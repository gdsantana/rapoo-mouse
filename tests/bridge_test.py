import http.client
from contextlib import nullcontext
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bridge", ROOT / "apps/bridge/server.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class BridgeTests(unittest.TestCase):
    def test_receiver_lock_excludes_other_cooperative_readers(self):
        with tempfile.NamedTemporaryFile() as receiver, patch.object(bridge.diagnostic, "device_path", return_value=Path(receiver.name)):
            with bridge.diagnostic.receiver_lock():
                with open(receiver.name, "rb") as other:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with open(receiver.name, "rb") as other:
                fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_lock_is_retained_by_worker_after_parent_releases(self):
        with tempfile.NamedTemporaryFile() as receiver, patch.object(bridge.diagnostic, "device_path", return_value=Path(receiver.name)):
            with bridge.diagnostic.receiver_lock() as lock:
                child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(10)"], pass_fds=(lock.fd,))
            try:
                with open(receiver.name, "rb") as other:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                child.terminate()
                child.wait(timeout=5)
            with open(receiver.name, "rb") as other:
                fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_receiver_replacement_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            receiver = Path(directory) / "receiver"
            replacement = Path(directory) / "replacement"
            receiver.touch()
            replacement.touch()
            with patch.object(bridge.diagnostic, "device_path", return_value=receiver):
                with self.assertRaisesRegex(RuntimeError, "reconectado"):
                    with bridge.diagnostic.receiver_lock():
                        os.replace(replacement, receiver)

    def test_worker_rejects_changed_node_before_hid_access(self):
        with tempfile.NamedTemporaryFile() as receiver, patch.object(bridge.diagnostic, "device_path", return_value=Path(receiver.name)), patch.object(bridge.diagnostic.fcntl, "ioctl") as ioctl, patch.object(bridge.diagnostic.os, "write") as write:
            with self.assertRaisesRegex(RuntimeError, "nenhum comando enviado"):
                bridge.diagnostic.query("battery", (-1, -1))
            ioctl.assert_not_called()
            write.assert_not_called()

    def test_decodes_actual_button_cycle_and_rejects_invalid_data(self):
        for filename, expected in (("baseline", 1350), ("dpi-button", 1000), ("dpi-button-2", 1200), ("restored", 1350)):
            capture = json.loads((ROOT / f"research/captures/mt760-native-{filename}.json").read_text())
            battery, dpi = [bytes.fromhex(q["responseBufferHex"])[:q["returnedBytes"]] for q in capture["queries"][:2]]
            result = bridge.decode(battery, dpi)
            self.assertEqual((result["batteryPercent"], result["activeDpi"], result["enabledStages"]), (59, expected, 3))
        for bad_battery, bad_dpi in ((b"\x02", dpi), (bytes([1, 1, 101]), dpi), (battery, battery),
                                     (battery, dpi[:20] + b"\x07" + dpi[21:])):
            with self.assertRaises(ValueError):
                bridge.decode(bad_battery, bad_dpi)

    def test_polling_uses_wireless_field_and_checks_overlap(self):
        capture = json.loads((ROOT / "research/captures/mt760-native-polling-rate.json").read_text())
        polling, dpi, repeated = [bytes.fromhex(q["responseBufferHex"])[:q["returnedBytes"]] for q in capture["samples"]]
        self.assertEqual(polling, repeated)
        self.assertEqual(polling[4], 2)  # Adjacent wired field differs from the wireless setting.
        self.assertEqual(bridge.decode_polling(polling, dpi), {"pollingRateCode": 1, "pollingRateHz": 1000})
        for code, hz in ((8, 125), (4, 250), (2, 500), (1, 1000), (3, None)):
            changed = bytearray(polling)
            changed[5] = code
            self.assertEqual(bridge.decode_polling(changed, dpi), {"pollingRateCode": code, "pollingRateHz": hz})
        for invalid in (polling[:3], b"\x02" + polling[1:], polling[:12] + b"\xff" + polling[13:], dpi):
            with self.assertRaises(ValueError):
                bridge.decode_polling(invalid, dpi)

    def test_snapshot_collects_only_three_fixed_queries(self):
        capture = json.loads((ROOT / "research/captures/mt760-native-polling-rate.json").read_text())
        battery = json.loads((ROOT / "research/captures/mt760-native-baseline.json").read_text())["queries"][0]
        polling, dpi, _ = capture["samples"]
        outputs = []
        for name, q in (("battery", battery), ("dpi-list", dpi), ("polling-rate", polling)):
            output = json.dumps({"query": name, "responseHex": q["responseBufferHex"], "ioctlReturn": q["returnedBytes"]})
            outputs.append(subprocess.CompletedProcess([], 0, output, ""))
        with patch.object(bridge.diagnostic, "receiver_lock", return_value=nullcontext(bridge.diagnostic.ReceiverLock((1, 2), 42))), patch.object(bridge.subprocess, "run", side_effect=outputs) as worker:
            result = bridge.read_snapshot()
            self.assertEqual(result["pollingRateHz"], 1000)
            self.assertEqual([c.args[0][-3:] for c in worker.call_args_list], [["battery", "1", "2"], ["dpi-list", "1", "2"], ["polling-rate", "1", "2"]])
            self.assertTrue(all(c.kwargs["pass_fds"] == (42,) for c in worker.call_args_list))

    def test_worker_failure_or_timeout_prevents_partial_snapshot(self):
        for failure in (subprocess.CompletedProcess([], 1, "", "permission denied"), subprocess.TimeoutExpired([], 8)):
            with patch.object(bridge.diagnostic, "receiver_lock", return_value=nullcontext(bridge.diagnostic.ReceiverLock((1, 2), 42))), patch.object(bridge.subprocess, "run", side_effect=[failure]) as worker:
                with self.assertRaises((RuntimeError, subprocess.TimeoutExpired)):
                    bridge.read_snapshot()
                self.assertEqual(worker.call_count, 1)

    def test_lock_failure_stops_before_queries(self):
        with patch.object(bridge.diagnostic, "receiver_lock", side_effect=RuntimeError("ocupado")), patch.object(bridge.subprocess, "run") as worker:
            with self.assertRaisesRegex(RuntimeError, "ocupado"):
                bridge.read_snapshot()
            worker.assert_not_called()

    def test_http_origin_host_payload_lock_and_failure(self):
        server = bridge.ThreadingHTTPServer(("127.0.0.1", 0), bridge.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        def request(method="POST", origin="http://127.0.0.1:5174", host="127.0.0.1:5175", body=None, custom="1"):
            client = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
            try:
                client.request(method, "/api/telemetry", body=body,
                               headers={"Host": host, "Origin": origin, "X-Rapoo-Read": custom,
                                        "Access-Control-Request-Method": "POST"})
                reply = client.getresponse()
                return reply.status, reply.getheader("Access-Control-Allow-Origin"), reply.read()
            finally:
                client.close()
        try:
            with patch.object(bridge, "read_snapshot", return_value={"batteryPercent": 59}) as reader:
                self.assertEqual(request(origin="https://evil.example")[0], 403)
                self.assertEqual(request(host="evil.example:5175")[0], 403)
                self.assertEqual(request(custom="")[0], 400)
                self.assertEqual(request(body="{}")[0], 400)
                self.assertEqual(request(method="OPTIONS")[:2], (204, "http://127.0.0.1:5174"))
                reader.assert_not_called()
                bridge.READ_LOCK.acquire()
                try:
                    self.assertEqual(request()[0], 409)
                finally:
                    bridge.READ_LOCK.release()
                self.assertEqual(request()[:2], (200, "http://127.0.0.1:5174"))
                self.assertEqual(reader.call_count, 1)
            with patch.object(bridge, "read_snapshot", side_effect=RuntimeError("disconnected")):
                status, _, body = request()
                self.assertEqual(status, 503)
                self.assertIn("disconnected", json.loads(body)["error"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
