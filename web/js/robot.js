// Human joint angles -> servo angles. Mirrors rtc/robot.py (same defaults, same shared test vectors).
// Tune these for your rig: the original gains were found by trial and error.
export const DEFAULT_CAL = {
  shoulderHuman: [0, 180], shoulderServo: [40, 180],
  elbowHuman: [0, 150], elbowServo: [120, 180],
  // [shoulderServoMax, elbowServoMin, elbowServoMax], first match wins (upper bound inclusive)
  elbowLimits: [[60, 120, 120], [80, 160, 180], [100, 140, 180], [170, 120, 160], [180, 120, 140]],
};

const lerpClamped = (x, [h0, h1], [s0, s1]) => s0 + Math.max(0, Math.min(1, (x - h0) / (h1 - h0))) * (s1 - s0);
const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function toServo(elevation, flexion, cal = DEFAULT_CAL) {
  const shoulder = Math.floor(lerpClamped(elevation, cal.shoulderHuman, cal.shoulderServo) + 0.5);
  const elbow = Math.floor(lerpClamped(flexion, cal.elbowHuman, cal.elbowServo) + 0.5);
  const band = cal.elbowLimits.find(([hi]) => shoulder <= hi) ?? cal.elbowLimits.at(-1);
  return [shoulder, clampTo(elbow, band[1], band[2])];
}
