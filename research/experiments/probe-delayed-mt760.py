"""Controlled read-only test: send DPI then polling before collecting one reply."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import runpy
import struct
import sys
import time

READ = runpy.run_path(str(Path(__file__).with_name("read-mt760.py")))


def probe(fd):
    for name in ("dpi-list", "polling-rate"):
        request = READ["request"](name)
        if os.write(fd, request) != len(request):
            raise RuntimeError(f"Envio incompleto para {name}; teste interrompido")
        print(json.dumps({"query": name, "requestHex": request.hex()}), flush=True)
        time.sleep(0.45)
    response = bytearray(32)
    response[0] = 0xBA
    count = fcntl.ioctl(fd, 0xC020480A, response, True)
    print(json.dumps({"after": "polling-rate", "returnedBytes": count,
                      "responseHex": response[:count].hex()}), flush=True)
    if count != 28 or response[0] != 1:
        raise RuntimeError("Resposta inválida; não interpretar como DPI ou polling rate")


def main():
    with READ["receiver_lock"]() as lock:
        path = READ["device_path"]()
        fd = os.open(path, os.O_RDWR | os.O_NONBLOCK)
        try:
            opened = os.fstat(fd)
            if (opened.st_dev, opened.st_ino) != lock.identity:
                raise RuntimeError("Dispositivo mudou; nenhuma consulta enviada")
            info = bytearray(8)
            fcntl.ioctl(fd, 0x80084803, info, True)
            if struct.unpack("IHH", info) != (3, 0x24AE, 0x1870):
                raise RuntimeError("Identidade mudou; nenhuma consulta enviada")
            print(json.dumps({"capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                              "device": str(path), "experimental": True,
                              "descriptorSha256": READ["DESCRIPTOR_SHA256"],
                              "procedure": "dpi-list, polling-rate, one GET_REPORT(Input)"}), flush=True)
            probe(fd)
        finally:
            os.close(fd)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError) as error:
        print(json.dumps({"error": str(error)}), flush=True)
        sys.exit(1)
