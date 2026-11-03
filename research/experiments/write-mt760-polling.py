"""Read/verify a bounded WebHID 1000->500 Hz test; native writes are restoration only."""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import runpy
import struct
import subprocess
import sys
import time

DPI = runpy.run_path(str(Path(__file__).with_name('write-mt760-dpi.py')))
READ, BRIDGE, CAPTURES = DPI['READ'], DPI['BRIDGE'], DPI['CAPTURES']
save, stamp, stable_snapshot = DPI['save'], DPI['stamp'], DPI['stable_snapshot']


def original(plan):
    if plan.get('kind') != 'mt760-polling-test-v1' or plan.get('descriptorSha256') != READ['DESCRIPTOR_SHA256']:
        raise ValueError('Unknown polling backup')
    dpi = bytes.fromhex(plan['before']['rawResponses']['dpi-list'])
    polling = bytes.fromhex(plan['before']['rawResponses']['polling-rate'])
    BRIDGE['decode_polling'](polling, dpi)
    if polling[5] != 1 or dpi[18] > 6 or dpi[20] > dpi[18] or any(not 1 <= v <= 80 for v in struct.unpack('<7H', dpi[4:18])):
        raise ValueError('Baseline is not eligible for 1000->500 Hz')
    return dpi, polling


def packet(plan, restore=False):
    _, polling = original(plan)
    data = bytearray(polling[4:8])
    if not restore:
        data[1] = 2
    return (bytes.fromhex('ba a5 a5 04 30 06 00 00') + data).ljust(32, b'\0')


def check_state(plan, snapshot, restored):
    dpi, polling = original(plan)
    expected = bytearray(polling)
    if not restored:
        expected[5] = 2
    current_dpi = bytes.fromhex(snapshot['rawResponses']['dpi-list'])
    current_polling = bytes.fromhex(snapshot['rawResponses']['polling-rate'])
    BRIDGE['decode_polling'](current_polling, current_dpi)
    if current_dpi[4:] != dpi[4:] or current_polling[4:] != expected[4:]:
        raise ValueError('Unexpected configuration; do not overwrite it')


def restore_worker(plan, lock):
    if (os.fstat(lock.fd).st_dev, os.fstat(lock.fd).st_ino) != lock.identity:
        raise RuntimeError('Inherited receiver lock is invalid')
    fcntl.flock(lock.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    fd = os.open(READ['device_path'](), os.O_RDWR | os.O_NONBLOCK)
    try:
        opened = os.fstat(fd)
        if (opened.st_dev, opened.st_ino) != lock.identity:
            raise RuntimeError('Receiver changed; no restoration sent')
        info = bytearray(8)
        fcntl.ioctl(fd, 0x80084803, info, True)
        if struct.unpack('IHH', info) != (3, 0x24AE, 0x1870):
            raise RuntimeError('Unexpected device; no restoration sent')
        request = packet(plan, True)
        print(json.dumps({'requestHex': request.hex(), 'operation': 'native-recovery'}), flush=True)
        if os.write(fd, request) != len(request):
            raise RuntimeError('Incomplete restoration; no retry')
        time.sleep(0.45)
        response = bytearray(32); response[0] = 0xBA
        count = fcntl.ioctl(fd, 0xC020480A, response, True)
        print(json.dumps({'returnedBytes': count, 'responseBufferHex': response.hex()}), flush=True)
        if count != 1 or response[0] != 1:
            raise RuntimeError('Restoration ACK unverified; read the real state')
    finally:
        os.close(fd)


def evidence_path(value):
    path = Path(value).resolve()
    if path.parent != CAPTURES or not path.name.startswith('mt760-polling-write-') or path.suffix != '.json':
        raise ValueError('Polling backup must be in this project capture directory')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('prepare', 'verify-applied', 'verify-restored', 'restore', 'worker-restore'))
    parser.add_argument('evidence', nargs='?')
    parser.add_argument('--lock-fd', type=int)
    parser.add_argument('--lock-device', type=int)
    parser.add_argument('--lock-inode', type=int)
    args = parser.parse_args()
    if args.mode == 'worker-restore':
        if not args.evidence or any(v is None for v in (args.lock_fd, args.lock_device, args.lock_inode)):
            parser.error('Restoration requires the inherited supervisor lock')
        plan = json.loads(evidence_path(args.evidence).read_text())
        restore_worker(plan, READ['ReceiverLock']((args.lock_device, args.lock_inode), args.lock_fd))
        return
    with READ['receiver_lock']() as lock:
        if args.mode == 'prepare':
            plan = {'kind': 'mt760-polling-test-v1', 'createdAt': stamp(), 'descriptorSha256': READ['DESCRIPTOR_SHA256'],
                    'before': stable_snapshot(lock), 'events': []}
            original(plan)
            path = CAPTURES / ('mt760-polling-write-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
            save(path, plan)
            print(json.dumps({'evidence': str(path), 'requestHex': packet(plan).hex(), 'change': '1000->500 Hz; wireless field only'}))
            return
        if not args.evidence:
            parser.error('Provide a backup from prepare')
        path = evidence_path(args.evidence)
        plan = json.loads(path.read_text()); original(plan)
        current = stable_snapshot(lock)
        restored = args.mode != 'verify-applied'
        if args.mode == 'restore':
            try:
                check_state(plan, current, True)
            except ValueError:
                check_state(plan, current, False)
                if any(e.get('operation') == 'native-recovery' for e in plan['events']):
                    raise RuntimeError('Restoration was already attempted; inspect the real state')
                event = {'operation': 'native-recovery', 'startedAt': stamp(), 'requestHex': packet(plan, True).hex()}
                plan['events'].append(event); save(path, plan)
                try:
                    worker = subprocess.run([sys.executable, __file__, 'worker-restore', str(path), '--lock-fd', str(lock.fd),
                                             '--lock-device', str(lock.identity[0]), '--lock-inode', str(lock.identity[1])],
                                            capture_output=True, text=True, timeout=8, pass_fds=(lock.fd,))
                    event.update(exitCode=worker.returncode, output=worker.stdout, error=worker.stderr)
                    if worker.returncode:
                        raise RuntimeError(worker.stderr.strip() or 'Restoration failed')
                except subprocess.TimeoutExpired as error:
                    event.update(error='timeout', output=(error.stdout or b'').decode())
                    raise RuntimeError('Restoration outcome is indeterminate; no automatic retry') from error
                finally:
                    event['finishedAt'] = stamp(); save(path, plan)
                current = stable_snapshot(lock)
        check_state(plan, current, restored)
        plan['events'].append({'operation': args.mode, 'verifiedAt': stamp(), 'snapshot': current})
        save(path, plan)
        print(json.dumps({'result': args.mode + ' verified by native readback', 'evidence': str(path)}))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, KeyError, subprocess.TimeoutExpired) as error:
        raise SystemExit(str(error))
