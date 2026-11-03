import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('write_polling', ROOT / 'research/experiments/write-mt760-polling.py')
writer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(writer)


def plan():
    return {'kind': 'mt760-polling-test-v1', 'descriptorSha256': writer.READ['DESCRIPTOR_SHA256'], 'events': [],
            'before': json.loads((ROOT / 'research/captures/bridge-polling-rate-reading.json').read_text())}


def after(p):
    snapshot = copy.deepcopy(p['before'])
    raw = bytearray.fromhex(snapshot['rawResponses']['polling-rate']); raw[5] = 2
    snapshot['rawResponses']['polling-rate'] = raw.hex()
    snapshot.update(pollingRateCode=2, pollingRateHz=500)
    return snapshot


class PollingTests(unittest.TestCase):
    def test_bounded_packets_and_full_preservation(self):
        p = plan()
        self.assertEqual(writer.packet(p).hex(), 'baa5a504300600000202ffff' + '00' * 20)
        self.assertEqual(writer.packet(p, True).hex(), 'baa5a504300600000201ffff' + '00' * 20)
        writer.check_state(p, after(p), False)
        writer.check_state(p, p['before'], True)
        for offset in (4, 6, 7, 8, 11):
            changed = after(p); raw = bytearray.fromhex(changed['rawResponses']['polling-rate']); raw[offset] ^= 1
            changed['rawResponses']['polling-rate'] = raw.hex()
            with self.assertRaises(ValueError): writer.check_state(p, changed, False)

    def test_ineligible_baseline_and_unknown_configuration_cannot_be_restored(self):
        p = plan(); p['kind'] = 'unknown'
        with self.assertRaises(ValueError): writer.packet(p)
        p = plan(); p['before'] = after(p)
        with self.assertRaises(ValueError): writer.packet(p)
        p = plan(); unexpected = after(p)
        raw = bytearray.fromhex(unexpected['rawResponses']['dpi-list']); raw[20] = 1
        unexpected['rawResponses']['dpi-list'] = raw.hex()
        with self.assertRaises(ValueError): writer.check_state(p, unexpected, False)

    def test_recovery_persists_intent_before_single_worker_with_inherited_lock(self):
        p = plan()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'mt760-polling-write-test.json'; writer.save(path, p)
            def send(args, **kwargs):
                saved = json.loads(path.read_text())
                self.assertEqual(saved['events'][0]['operation'], 'native-recovery')
                self.assertEqual(saved['events'][0]['requestHex'], writer.packet(p, True).hex())
                self.assertEqual(kwargs['pass_fds'], (42,))
                self.assertIn('worker-restore', args)
                return writer.subprocess.CompletedProcess(args, 0, 'ack', '')
            with patch.object(writer, 'CAPTURES', Path(directory)), patch.object(writer.sys, 'argv', ['script', 'restore', str(path)]), \
                 patch.dict(writer.READ, {'receiver_lock': lambda: contextlib.nullcontext(writer.READ['ReceiverLock']((1, 2), 42))}), \
                 patch.object(writer, 'stable_snapshot', side_effect=[after(p), p['before']]), \
                 patch.object(writer.subprocess, 'run', side_effect=send) as run, contextlib.redirect_stdout(io.StringIO()):
                writer.main()
                self.assertEqual(run.call_count, 1)
            self.assertEqual(json.loads(path.read_text())['events'][-1]['operation'], 'restore')

    def test_already_restored_is_read_only_and_changed_device_cannot_receive_a_packet(self):
        p = plan()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'mt760-polling-write-test.json'; writer.save(path, p)
            with patch.object(writer, 'CAPTURES', Path(directory)), patch.object(writer.sys, 'argv', ['script', 'restore', str(path)]), \
                 patch.dict(writer.READ, {'receiver_lock': lambda: contextlib.nullcontext(None)}), \
                 patch.object(writer, 'stable_snapshot', return_value=p['before']), \
                 patch.object(writer.subprocess, 'run') as run, contextlib.redirect_stdout(io.StringIO()):
                writer.main(); run.assert_not_called()
        with tempfile.NamedTemporaryFile() as locked, tempfile.NamedTemporaryFile() as other:
            original = writer.os.fstat(locked.fileno())
            lock = writer.READ['ReceiverLock']((original.st_dev, original.st_ino), locked.fileno())
            with patch.dict(writer.READ, {'device_path': lambda: Path(other.name)}), patch.object(writer.os, 'write') as write:
                with self.assertRaisesRegex(RuntimeError, 'Receiver changed'): writer.restore_worker(p, lock)
                write.assert_not_called()
