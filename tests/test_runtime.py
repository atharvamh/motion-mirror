import unittest

from rtc import backends
from rtc.sender import Sender


class FakePort:
    def __init__(self):
        self.written = []

    def write(self, b):
        self.written.append(b)


class SenderTest(unittest.TestCase):
    def test_rate_limit_and_latest_wins(self):
        port = FakePort()
        s = Sender(port, max_hz=10)
        self.assertIsNotNone(s.send(False, 50, 130, now=0.0))
        self.assertIsNone(s.send(False, 90, 150, now=0.05))   # too soon: dropped, not queued
        self.assertIsNotNone(s.send(False, 90, 150, now=0.11))
        self.assertEqual(port.written, [b"0050130\n", b"0090150\n"])

    def test_deadband_suppresses_jitter_but_not_claw_changes(self):
        port = FakePort()
        s = Sender(port, max_hz=1000, deadband=1)
        s.send(False, 50, 130, now=0.0)
        self.assertIsNone(s.send(False, 51, 129, now=1.0))
        self.assertIsNotNone(s.send(False, 52, 130, now=2.0))
        self.assertIsNotNone(s.send(True, 52, 130, now=3.0))

    def test_dry_run_has_no_port(self):
        self.assertEqual(Sender(None).send(True, 1, 2, now=0), "1001002\n")


class HeatmapTest(unittest.TestCase):
    def test_peaks_and_threshold(self):
        a = [[0, 0, 0], [0, 0.9, 0], [0, 0, 0]]
        b = [[0, 0.05, 0], [0, 0, 0], [0, 0, 0]]
        self.assertEqual(backends.heatmap_peaks([a, b], 0.1), [(1, 1), None])


if __name__ == "__main__":
    unittest.main()
