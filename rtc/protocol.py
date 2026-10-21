"""Wire format shared with the Arduino firmware (unchanged from the original project).

    <claw:1><shoulder:3><elbow:3>\\n      e.g. "1110120\\n"

claw is '1' (open) or '0' (closed); angles are zero-padded servo degrees 0..180.
"""

SERVO_MIN, SERVO_MAX = 0, 180
BAUD = 115200


def _clamp(v):
    return max(SERVO_MIN, min(SERVO_MAX, int(v)))


def encode(claw, shoulder, elbow):
    return "%d%03d%03d\n" % (1 if claw else 0, _clamp(shoulder), _clamp(elbow))


def decode(line):
    """Inverse of encode(); returns (claw, shoulder, elbow) or None if malformed."""
    s = line.strip()
    if len(s) != 7 or not s.isdigit() or s[0] not in "01":
        return None
    shoulder, elbow = int(s[1:4]), int(s[4:7])
    if shoulder > SERVO_MAX or elbow > SERVO_MAX:
        return None
    return s[0] == "1", shoulder, elbow
