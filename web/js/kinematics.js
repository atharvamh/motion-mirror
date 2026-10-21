// Joint angles from 3D landmarks. Mirrors rtc/kinematics.py (checked against the same
// tests/vectors.json). Coordinates: x right, y DOWN, as MediaPipe world landmarks.

const EPS = 1e-9;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// MediaPipe BlazePose landmark indices.
export const LM = { NOSE: 0, L_EAR: 7, R_EAR: 8, L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14,
                    L_WRIST: 15, R_WRIST: 16, L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANKLE: 27, R_ANKLE: 28 };
export const ARM = {
  right: { shoulder: LM.R_SHOULDER, elbow: LM.R_ELBOW, wrist: LM.R_WRIST, hip: LM.R_HIP },
  left:  { shoulder: LM.L_SHOULDER, elbow: LM.L_ELBOW, wrist: LM.L_WRIST, hip: LM.L_HIP },
};

export const LEG = {
  right: { hip: LM.R_HIP, knee: LM.R_KNEE, ankle: LM.R_ANKLE },
  left:  { hip: LM.L_HIP, knee: LM.L_KNEE, ankle: LM.L_ANKLE },
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

/** True when every landmark in idxs is tracked with at least `min` visibility. */
export const visible = (lm, idxs, min = 0.5) => idxs.every((i) => (lm[i]?.visibility ?? 1) >= min);

/**
 * How far a leg is folded: 0 = fully extended and vertical, towards 1 as it crouches. Uses the
 * vertical hip-to-ankle extent relative to the (constant) bone length, so it needs no calibration
 * and is independent of the person's size. Capped so the avatar never sinks into the floor.
 */
export function legCompression(hip, knee, ankle) {
  const len = Math.hypot(...sub(hip, knee)) + Math.hypot(...sub(knee, ankle));
  if (len < EPS) return 0;
  return Math.max(0, Math.min(0.85, 1 - Math.abs(ankle[1] - hip[1]) / len));
}

export const MAX_YAW = 70 * Math.PI / 180;
const MIN_ACROSS = 0.25;      // below this fraction of the expected width the two landmarks have collapsed together: noise

/**
 * Body yaw in radians (0 = facing the camera) from the line between two scene-space points on
 * the person's right and left side (hips, or shoulders). Positive turns about +y, i.e. it is the
 * rotation that carries the rest "right" axis (1,0,0) onto the measured one. A single camera cannot tell
 * front from back, so past `limit` (or when the landmarks have collapsed together) it returns null and callers
 * should hold the last good value rather than let the avatar flip.
 */
export function bodyYaw(right, left, restWidth = 0.2, limit = MAX_YAW) {
  const dx = right[0] - left[0], dz = right[2] - left[2];
  if (Math.hypot(dx, dz) < MIN_ACROSS * restWidth) return null;
  const yaw = Math.atan2(-dz, dx);
  return Math.abs(yaw) > limit ? null : yaw;
}
