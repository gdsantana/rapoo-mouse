import importlib.util
import io
from pathlib import Path
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("delayed_probe", ROOT / "research/experiments/probe-delayed-mt760.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class DelayedProbeTests(unittest.TestCase):
    def test_only_two_fixed_reads_then_one_input_report(self):
        sent = []
        def write(fd, packet):
            sent.append(packet)
            return len(packet)
        def ioctl(fd, operation, response, mutate):
            self.assertEqual(operation, 0xC020480A)
            self.assertEqual(response[0], 0xBA)
            response[:28] = b"\x01" + bytes(27)
            return 28
        with patch.object(probe.os, "write", side_effect=write), patch.object(probe.fcntl, "ioctl", side_effect=ioctl) as get, patch.object(probe.time, "sleep"), redirect_stdout(io.StringIO()):
            probe.probe(42)
        self.assertEqual(sent, [probe.READ["request"]("dpi-list"), probe.READ["request"]("polling-rate")])
        self.assertEqual(get.call_count, 1)

    def test_incomplete_send_stops_immediately(self):
        with patch.object(probe.os, "write", return_value=1) as write, patch.object(probe.fcntl, "ioctl") as get:
            with self.assertRaisesRegex(RuntimeError, "Envio incompleto"):
                probe.probe(42)
        self.assertEqual(write.call_count, 1)
        get.assert_not_called()


if __name__ == "__main__":
    unittest.main()
