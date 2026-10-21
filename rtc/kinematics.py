"""Joint angles from 3D landmark positions.

The original pipeline used arctan(dy/dx) of the 2D bone against the image axes, which
loses the quadrant, is undefined for vertical bones, and is not a joint angle. Here the
angles are taken between bone vectors, so they are independent of camera roll and work
for arms raised in any direction. Coordinates: x right, y down (MediaPipe world space).
"""
import math

EPS = 1e-9


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def angle_between(a, b):
    """Angle in degrees between vectors a and b, or None if either has zero length.

    Uses atan2(|a x b|, a . b), which stays accurate near 0 and 180 degrees where
    acos(dot / norms) loses precision (the arm hanging straight is the common case).
    """
    if math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) < EPS or math.sqrt(b[0] ** 2 + b[1] ** 2 + b[2] ** 2) < EPS:
        return None
    cx = a[1] * b[2] - a[2] * b[1]
    cy = a[2] * b[0] - a[0] * b[2]
    cz = a[0] * b[1] - a[1] * b[0]
    dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    return math.degrees(math.atan2(math.sqrt(cx * cx + cy * cy + cz * cz), dot))


def shoulder_elevation(shoulder, elbow, hip):
    """0 = arm hanging along the torso, 90 = horizontal, 180 = straight up."""
    return angle_between(_sub(elbow, shoulder), _sub(hip, shoulder))


def elbow_flexion(shoulder, elbow, wrist):
    """0 = fully straight arm, increasing as the elbow bends."""
    inner = angle_between(_sub(shoulder, elbow), _sub(wrist, elbow))
    return None if inner is None else 180.0 - inner


def arm_angles(shoulder, elbow, wrist, hip):
    """(elevation, flexion) in degrees; either may be None for degenerate input."""
    return shoulder_elevation(shoulder, elbow, hip), elbow_flexion(shoulder, elbow, wrist)
