"""Fixed cable read queries; compare interrupt events with GET_REPORT(Input)."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import runpy
import select
import struct
import subprocess
import sys
import time

READ = runpy.run_path(str(Path(__file__).with_name("read-mt760.py")))
DESCRIPTOR_SHA256 = "b49fa5b5a4b47c02f0f25889fa9dc754a56cd54d2b698c7aca115a56e1f4344d"
NAMES = ("battery", "dpi-list")


def request(name):
    if name not in NAMES:
        raise ValueError("Only fixed battery and DPI read queries are allowed")
    packet = bytearray(READ["request"](name))
    packet[1] = 0xFF  # Cable prefix documented by RapooHUBPlus; not receiver A5.
    return bytes(packet)


def device_path():
    matches = []
    for node in Path("/sys/class/hidraw").glob("hidraw*"):
        device = node / "device"
        if "HID_ID=0003:000024AE:00004500\n" not in (device / "uevent").read_text():
            continue
        if hashlib.sha256((device / "report_descriptor").read_bytes()).hexdigest() == DESCRIPTOR_SHA256:
            matches.append(Path("/dev") / node.name)
    if len(matches) != 1:
        raise RuntimeError(f"Expected one known cable interface; found {len(matches)}")
    return matches[0]


def emit(value):
    print(json.dumps(value), flush=True)


def events(fd, seconds):
    deadline = time.monotonic() + seconds
    reports = []
    while len(reports) < 128:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([fd], [], [], remaining)[0]:
            return reports
        raw = os.read(fd, 64)
        if not raw:
            raise RuntimeError("Cable disconnected")
        # This composite interface also carries keyboard reports; retain vendor data only.
        if raw[0] in (0xBA, 0xBB, 0xBC):
            reports.append({"at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "rawHex": raw.hex()})
    raise RuntimeError("Input event limit reached; result discarded")


def query(name):
    path = device_path()
    fd = os.open(path, os.O_RDWR | os.O_NONBLOCK)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        original = os.fstat(fd)
        info = bytearray(8)
        fcntl.ioctl(fd, 0x80084803, info, True)
        if struct.unpack("IHH", info) != (3, 0x24AE, 0x4500):
            raise RuntimeError("Cable identity changed; no query sent")
        emit({"device": str(path), "descriptorSha256": DESCRIPTOR_SHA256, "beforeQuery": events(fd, 0.1)})
        packet = request(name)
        if os.write(fd, packet) != len(packet):
            raise RuntimeError("Incomplete query; no retry")
        emit({"query": name, "requestHex": packet.hex(), "sentAt": datetime.datetime.now(datetime.timezone.utc).isoformat()})
        emit({"interruptWindowSeconds": 2, "interruptReports": events(fd, 2)})
        response = bytearray(32)
        response[0] = 0xBA
        count = fcntl.ioctl(fd, 0xC020480A, response, True)
        emit({"controlTransfer": "GET_REPORT(Input)", "returnedBytes": count, "responseBufferHex": response.hex()})
        current = os.stat(path)
        if (original.st_dev, original.st_ino) != (current.st_dev, current.st_ino) or device_path() != path:
            raise RuntimeError("Cable reconnected; response discarded")
        READ["validate_response"](name, response, count)
    finally:
        os.close(fd)


def main():
    if sys.argv[1:] == ["--self-test"]:
        assert request("battery") == bytes.fromhex("ba ff aa 00 00 00 00 00") + bytes(24)
        assert request("dpi-list") == bytes.fromhex("ba ff a4 18 38 06 00 00") + bytes(24)
        try:
            request("write")
        except ValueError:
            pass
        else:
            raise AssertionError("Unbounded query accepted")
        READ["validate_response"]("battery", bytes.fromhex("010127"), 3)
        print("Self-test: fixed cable packets and shared response validation OK")
        return 0
    if len(sys.argv) == 3 and sys.argv[1] == "--worker" and sys.argv[2] in NAMES:
        query(sys.argv[2])
        return 0
    if len(sys.argv) != 2 or sys.argv[1] not in ["--capture-" + name for name in NAMES]:
        raise SystemExit("Usage: --self-test | --capture-battery | --capture-dpi-list")
    result = {"capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "experimental": True,
              "configurationWritesSent": False, "source": "Linux hidraw cable", "query": sys.argv[1][10:]}
    try:
        worker = subprocess.run([sys.executable, __file__, "--worker", result["query"]], capture_output=True, text=True, timeout=8)
        result.update(events=[json.loads(line) for line in worker.stdout.splitlines()], success=worker.returncode == 0)
        if worker.returncode:
            result["error"] = worker.stderr.strip()
    except subprocess.TimeoutExpired as error:
        result.update(success=False, error="8-second timeout; no retry", partialOutput=(error.stdout or b"").decode())
    emit(result)
    return 0 if result["success"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError) as error:
        raise SystemExit(str(error))
