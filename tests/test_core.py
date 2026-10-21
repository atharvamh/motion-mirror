import json
import math
import os
import tempfile
import unittest

from rtc import filters, kinematics, protocol, robot

with open(os.path.join(os.path.dirname(__file__), "vectors.json")) as f:
    VECTORS = json.load(f)


class KinematicsTest(unittest.TestCase):
    def test_shared_vectors(self):
        for v in VECTORS["kinematics"]:
            with self.subTest(v["name"]):
                elev, flex = kinematics.arm_angles(v["shoulder"], v["elbow"], v["wrist"], v["hip"])
                self.assertAlmostEqual(elev, v["elevation"], places=6)
                if v["flexion"] is None:
                    self.assertIsNone(flex)
                else:
                    self.assertAlmostEqual(flex, v["flexion"], places=6)

    def test_invariant_to_scale_and_translation(self):
        s, e, w, h = (0, 0, 0), (0.3, 0.1, -0.1), (0.4, 0.4, -0.2), (0, 0.5, 0)
        base = kinematics.arm_angles(s, e, w, h)
        move = lambda p: tuple(2.5 * c + o for c, o in zip(p, (1, -2, 3)))
        moved = kinematics.arm_angles(move(s), move(e), move(w), move(h))
        self.assertAlmostEqual(base[0], moved[0], places=9)
        self.assertAlmostEqual(base[1], moved[1], places=9)

    def test_parallel_vectors_are_accurate(self):
        # acos(dot/norms) is off by ~1e-6 degrees here; the atan2 form is ~1e-14.
        a = (0.1, 0.2, 0.3)
        self.assertAlmostEqual(kinematics.angle_between(a, tuple(3 * c for c in a)), 0.0, places=10)


class ProtocolTest(unittest.TestCase):
    def test_shared_vectors(self):
        for v in VECTORS["protocol"]:
            with self.subTest(v["wire"]):
                self.assertEqual(protocol.encode(v["claw"], v["shoulder"], v["elbow"]), v["wire"])

    def test_roundtrip(self):
        self.assertEqual(protocol.decode(protocol.encode(True, 12, 170)), (True, 12, 170))

    def test_decode_rejects_malformed(self):
        for bad in ["", "111012", "11101200", "2110120\n", "1ab0120\n", "1181120\n", "-110120\n"]:
            with self.subTest(bad):
                self.assertIsNone(protocol.decode(bad))


class RobotTest(unittest.TestCase):
    def test_shared_vectors(self):
        for v in VECTORS["robot"]:
            with self.subTest(v):
                self.assertEqual(robot.to_servo(v["elevation"], v["flexion"]), (v["shoulder"], v["elbow"]))

    def test_band_boundary_belongs_to_lower_band(self):
        cal = robot.Calibration(shoulder_human=(0, 140), shoulder_servo=(0, 140))
        # shoulder servo == 60 -> first band (elbow pinned to 120)
        self.assertEqual(robot.to_servo(60, 150, cal), (60, 120))
        self.assertEqual(robot.to_servo(61, 0, cal)[1], 160)

    def test_output_always_inside_servo_range(self):
        for e in range(-30, 231, 10):
            for f in range(-30, 200, 10):
                s, el = robot.to_servo(e, f)
                self.assertTrue(40 <= s <= 180 and 120 <= el <= 180, (e, f, s, el))

    def test_rounding_matches_js(self):
        self.assertEqual([robot.round_half_up(x) for x in (0.5, 1.5, 2.5, -0.5)], [1, 2, 3, 0])

    def test_calibration_from_json(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"shoulder_servo": [0, 90], "elbow_limits": [[180, 0, 180]]}, f)
        try:
            cal = robot.Calibration.from_json(f.name)
            self.assertEqual(robot.to_servo(180, 0, cal), (90, 120))
            with open(f.name, "w") as g:
                json.dump({"bogus": 1}, g)
            with self.assertRaises(ValueError):
                robot.Calibration.from_json(f.name)
        finally:
            os.unlink(f.name)


class OneEuroTest(unittest.TestCase):
    def test_first_sample_passes_through(self):
        self.assertEqual(filters.OneEuroFilter()(42.0, 0.0), 42.0)

    def test_constant_signal_is_unchanged(self):
        f = filters.OneEuroFilter()
        for i in range(50):
            self.assertAlmostEqual(f(10.0, i / 30), 10.0)

    def test_attenuates_jitter(self):
        f = filters.OneEuroFilter()
        raw = [10 + (1 if i % 2 else -1) for i in range(120)]
        out = [f(x, i / 30) for i, x in enumerate(raw)]
        self.assertLess(max(out[60:]) - min(out[60:]), 0.5 * (max(raw) - min(raw)))

    def test_fast_motion_lags_less_than_slow_filter(self):
        adaptive = filters.OneEuroFilter(min_cutoff=1.0, beta=0.1)
        fixed = filters.OneEuroFilter(min_cutoff=1.0, beta=0.0)
        for i in range(30):
            t = i / 30
            a, b = adaptive(180 * t, t), fixed(180 * t, t)
        self.assertLess(abs(180 * t - a), abs(180 * t - b))

    def test_ignores_non_increasing_time(self):
        f = filters.OneEuroFilter()
        f(1.0, 1.0)
        self.assertEqual(f(5.0, 1.0), 1.0)


if __name__ == "__main__":
    unittest.main()
