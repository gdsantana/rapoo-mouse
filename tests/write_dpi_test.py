import contextlib
import copy
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('write_dpi', ROOT / 'research/experiments/write-mt760-dpi.py')
writer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(writer)


def plan():
    before = json.loads((ROOT / 'research/captures/bridge-polling-rate-reading.json').read_text())
    return {'kind': 'mt760-inactive-dpi-test-v1', 'descriptorSha256': writer.READ['DESCRIPTOR_SHA256'], 'before': before, 'events': []}


def changed_snapshot(p):
    result = copy.deepcopy(p['before'])
    result['rawResponses']['dpi-list'] = writer.expected(p).hex()
    polling = bytearray.fromhex(result['rawResponses']['polling-rate'])
    struct.pack_into('<H', polling, 12, 21)
    result['rawResponses']['polling-rate'] = polling.hex()
    result['dpiValues'][0] = 1050
    return result


def fake_lock():
    return contextlib.nullcontext(writer.READ['ReceiverLock']((1, 2), 42))


class WriteDpiTests(unittest.TestCase):
    def test_exact_packet_changes_only_inactive_first_stage(self):
        p = plan()
        request = writer.packet(p)
        self.assertEqual(request, bytes.fromhex('ba a5 a5 10 38 06 00 00 15 00 18 00 1b 00 10 00 30 00 40 00 50 00 02 00') + bytes(8))
        self.assertEqual([(i, a, b) for i, (a, b) in enumerate(zip(writer.packet(p, True), request)) if a != b], [(8, 20, 21)])
        writer.check_state(p, changed_snapshot(p))
        writer.check_state(p, p['before'], True)

    def test_actual_write_power_cycle_and_restoration_evidence(self):
        p = json.loads((ROOT / 'research/captures/mt760-dpi-write-20261017T154052865924Z.json').read_text())
        self.assertTrue(p['userPowerCycle']['confirmedByUser'])
        self.assertEqual([e['operation'] for e in p['events']], ['apply-test', 'restore'])
        self.assertTrue(all(e['exitCode'] == 0 for e in p['events']))
        writer.check_state(p, p['after'])
        writer.check_state(p, p['afterPowerCycle'])
        writer.check_state(p, p['restored'], True)
        self.assertEqual(p['afterPowerCycle']['dpiValues'][0], 1050)
        self.assertEqual(p['restored']['dpiValues'], p['before']['dpiValues'])

    def test_rejects_unknown_backup_active_stage_or_reserved_data(self):
        for key, value in (('kind', 'unknown'), ('descriptorSha256', 'bad')):
            p = plan(); p[key] = value
            with self.assertRaises(ValueError): writer.packet(p)
        for offset, value in ((4, 0), (19, 1), (20, 0), (18, 7)):
            p = plan(); raw = bytearray.fromhex(p['before']['rawResponses']['dpi-list']); raw[offset] = value
            p['before']['rawResponses']['dpi-list'] = raw.hex()
            with self.assertRaises(ValueError): writer.packet(p)

    def test_failed_attempt_restores_and_records_both_outcomes(self):
        p = plan()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'mt760-dpi-write-test.json'
            writer.save(path, p)
            with patch.dict(writer.READ, {'receiver_lock': fake_lock}), patch.object(writer, 'CAPTURES', Path(directory)), patch.object(writer.sys, 'argv', ['script', 'apply-test', str(path)]), \
                 patch.object(writer, 'stable_snapshot', side_effect=[p['before'], changed_snapshot(p), p['before']]), \
                 patch.object(writer, 'write_once', side_effect=[RuntimeError('timeout'), None]) as send:
                with self.assertRaisesRegex(RuntimeError, 'timeout'): writer.main()
                self.assertEqual([c.args[2] for c in send.call_args_list], [False, True])
            evidence = json.loads(path.read_text())
            self.assertEqual(evidence['applyError'], 'timeout')
            self.assertEqual(evidence['restored'], p['before'])

    def test_no_blind_restore_over_unexpected_configuration(self):
        p = plan(); unexpected = changed_snapshot(p)
        unexpected['rawResponses']['dpi-list'] = unexpected['rawResponses']['dpi-list'][:-2] + 'ff'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'mt760-dpi-write-test.json'
            writer.save(path, p)
            with patch.dict(writer.READ, {'receiver_lock': fake_lock}), patch.object(writer, 'CAPTURES', Path(directory)), patch.object(writer.sys, 'argv', ['script', 'apply-test', str(path)]), \
                 patch.object(writer, 'stable_snapshot', side_effect=[p['before'], unexpected]), \
                 patch.object(writer, 'write_once', side_effect=RuntimeError('timeout')) as send:
                with self.assertRaisesRegex(RuntimeError, 'timeout'): writer.main()
                self.assertEqual(send.call_count, 1)
            self.assertIn('recoveryError', json.loads(path.read_text()))

    def test_restore_is_idempotent_and_power_cycle_check_never_writes(self):
        for mode, samples in (('restore', [plan()['before'], plan()['before']]), ('verify-after-power-cycle', [changed_snapshot(plan())])):
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'mt760-dpi-write-test.json'
                writer.save(path, plan())
                with patch.dict(writer.READ, {'receiver_lock': fake_lock}), patch.object(writer, 'CAPTURES', Path(directory)), patch.object(writer.sys, 'argv', ['script', mode, str(path)]), \
                     patch.object(writer, 'stable_snapshot', side_effect=samples), patch.object(writer, 'write_once') as send, contextlib.redirect_stdout(io.StringIO()):
                    writer.main()
                    send.assert_not_called()

    def test_write_worker_rejects_other_node_before_sending(self):
        with tempfile.NamedTemporaryFile() as locked, tempfile.NamedTemporaryFile() as replacement:
            locked_stat = os.fstat(locked.fileno())
            lock = writer.READ['ReceiverLock']((locked_stat.st_dev, locked_stat.st_ino), locked.fileno())
            with patch.dict(writer.READ, {'device_path': lambda: Path(replacement.name)}), patch.object(writer.os, 'write') as send:
                with self.assertRaisesRegex(RuntimeError, 'nenhuma gravação enviada'):
                    writer.write_worker(plan(), False, lock)
                send.assert_not_called()

    def test_internal_worker_requires_inherited_lock(self):
        with patch.object(writer.sys, 'argv', ['script', 'worker-apply', 'unused']), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            writer.main()

    def test_intent_is_persisted_before_spawning_locked_worker(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'evidence.json'
            p = plan()
            lock = writer.READ['ReceiverLock']((1, 2), 42)
            def run(args, **kwargs):
                recorded = json.loads(path.read_text())['events'][-1]
                self.assertEqual(recorded['operation'], 'apply-test')
                self.assertEqual(recorded['requestHex'], writer.packet(p).hex())
                self.assertEqual(kwargs['pass_fds'], (42,))
                self.assertEqual(args[-6:], ['--lock-fd', '42', '--lock-device', '1', '--lock-inode', '2'])
                return subprocess.CompletedProcess(args, 0, '', '')
            with patch.object(writer.subprocess, 'run', side_effect=run):
                writer.write_once(path, p, False, lock)

    def test_snapshots_reuse_lock_for_whole_operation(self):
        lock = writer.READ['ReceiverLock']((1, 2), 42)
        with patch.dict(writer.BRIDGE, {'_read_snapshot': unittest.mock.Mock(return_value=plan()['before'])}):
            writer.stable_snapshot(lock)
            self.assertEqual(writer.BRIDGE['_read_snapshot'].call_count, 2)
            self.assertTrue(all(call.args == (lock,) for call in writer.BRIDGE['_read_snapshot'].call_args_list))

    def test_occupied_receiver_prevents_writes(self):
        with patch.dict(writer.READ, {'receiver_lock': unittest.mock.Mock(side_effect=RuntimeError('ocupado'))}), \
             patch.object(writer.sys, 'argv', ['script', 'apply-test', 'unused']), patch.object(writer, 'write_once') as send:
            with self.assertRaisesRegex(RuntimeError, 'ocupado'):
                writer.main()
            send.assert_not_called()

    def test_lock_covers_reads_write_and_verification(self):
        p = plan()
        with tempfile.TemporaryDirectory() as directory:
            receiver = Path(directory) / 'receiver'
            receiver.touch()
            path = Path(directory) / 'mt760-dpi-write-test.json'
            writer.save(path, p)
            def check_locked():
                with receiver.open('rb') as other:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
            samples = iter([p['before'], changed_snapshot(p)])
            def snapshot(lock):
                check_locked()
                return next(samples)
            def write_once(path, plan, restore, lock):
                check_locked()
            with patch.dict(writer.READ['receiver_lock'].__wrapped__.__globals__, {'device_path': lambda: receiver}), \
                 patch.object(writer, 'CAPTURES', Path(directory)), patch.object(writer.sys, 'argv', ['script', 'apply-test', str(path)]), \
                 patch.object(writer, 'stable_snapshot', side_effect=snapshot), patch.object(writer, 'write_once', side_effect=write_once), \
                 contextlib.redirect_stdout(io.StringIO()):
                writer.main()
            with receiver.open('rb') as other:
                fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)


if __name__ == '__main__':
    unittest.main()
