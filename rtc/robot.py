"""Map human joint angles to servo angles, honouring the arm's mechanical limits."""
import json
import math
from dataclasses import dataclass, field, fields


def round_half_up(x):
    # Same rounding as JS Math.round so both implementations agree on .5 cases.
    return int(math.floor(x + 0.5))


def _lerp_clamped(x, h0, h1, s0, s1):
    t = max(0.0, min(1.0, (x - h0) / (h1 - h0)))
    return s0 + t * (s1 - s0)


# (shoulder_servo_max, elbow_servo_min, elbow_servo_max), checked in order.
# Carried over from the original hand-tuned if/elif ladder: the elbow can only travel
# a limited range for each shoulder band (the links collide otherwise). Bands include
# their upper bound, as before.
ELBOW_LIMITS = (
    (60, 120, 120),
    (80, 160, 180),
    (100, 140, 180),
    (170, 120, 160),
    (180, 120, 140),
)


@dataclass
class Calibration:
    """Human range -> servo range. Defaults are a starting point: the original gains were
    found by trial and error on the author's rig, so tune these on yours (see README)."""
    shoulder_human: tuple = (0.0, 180.0)
    shoulder_servo: tuple = (40.0, 180.0)
    elbow_human: tuple = (0.0, 150.0)
    elbow_servo: tuple = (120.0, 180.0)
    elbow_limits: tuple = field(default=ELBOW_LIMITS)

    @classmethod
    def from_json(cls, path):
        with open(path) as f:
            raw = json.load(f)
        unknown = set(raw) - {f_.name for f_ in fields(cls)}
        if unknown:
            raise ValueError("unknown calibration keys: %s" % sorted(unknown))
        if "elbow_limits" in raw:
            raw["elbow_limits"] = tuple(tuple(band) for band in raw["elbow_limits"])
        return cls(**{k: v if k == "elbow_limits" else tuple(v) for k, v in raw.items()})


def to_servo(elevation, flexion, cal=None):
    """(shoulder_deg, elbow_deg) human angles -> integer servo angles."""
    cal = cal or Calibration()
    shoulder = round_half_up(_lerp_clamped(elevation, *cal.shoulder_human, *cal.shoulder_servo))
    elbow = round_half_up(_lerp_clamped(flexion, *cal.elbow_human, *cal.elbow_servo))
    for hi, lo_e, hi_e in cal.elbow_limits:
        if shoulder <= hi:
            return shoulder, max(lo_e, min(hi_e, elbow))
    lo_e, hi_e = cal.elbow_limits[-1][1:]
    return shoulder, max(lo_e, min(hi_e, elbow))
