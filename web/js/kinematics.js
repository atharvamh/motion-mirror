// Joint angles from 3D landmarks. Mirrors rtc/kinematics.py (checked against the same
// tests/vectors.json). Coordinates: x right, y DOWN, as MediaPipe world landmarks.

const EPS = 1e-9;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// MediaPipe BlazePose landmark indices.
export const LM = { NOSE: 0, L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14,
                    L_WRIST: 15, R_WRIST: 16, L_HIP: 23, R_HIP: 24 };
export const ARM = {
  right: { shoulder: LM.R_SHOULDER, elbow: LM.R_ELBOW, wrist: LM.R_WRIST, hip: LM.R_HIP },
  left:  { shoulder: LM.L_SHOULDER, elbow: LM.L_ELBOW, wrist: LM.L_WRIST, hip: LM.L_HIP },
};

/** Angle in degrees between a and b, or null for a zero-length vector. atan2 form: accurate near 0/180. */
export function angleBetween(a, b) {
  if (Math.hypot(...a) < EPS || Math.hypot(...b) < EPS) return null;
  const cross = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.atan2(cross, dot) * 180 / Math.PI;
}

/** 0 = arm along torso, 90 = horizontal, 180 = straight up. */
export const shoulderElevation = (shoulder, elbow, hip) => angleBetween(sub(elbow, shoulder), sub(hip, shoulder));

/** 0 = straight arm, growing as the elbow bends. */
export function elbowFlexion(shoulder, elbow, wrist) {
  const inner = angleBetween(sub(shoulder, elbow), sub(wrist, elbow));
  return inner === null ? null : 180 - inner;
}

export const armAngles = (shoulder, elbow, wrist, hip) =>
  [shoulderElevation(shoulder, elbow, hip), elbowFlexion(shoulder, elbow, wrist)];

/** MediaPipe world (x right, y down, z away-from-camera positive) -> mirror-view scene (x right, y up, z toward viewer). */
export const toScene = (p) => [-p[0], -p[1], -p[2]];
