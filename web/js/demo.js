// Synthetic pose so the app (and its tests) work without a camera. Returns MediaPipe-style
// world landmarks (metres, x right, y down) of a person waving one arm and flapping the other.
import { LM } from './kinematics.js';

// side: -1 for the person's right arm (image-left, x < 0), +1 for the left arm.
// elev: upper-arm angle from straight down; bend: extra forearm angle in the same plane.
function arm(shoulder, side, elev, bend) {
  const at = (from, len, deg) => {
    const a = deg * Math.PI / 180;
    return [from[0] + side * len * Math.sin(a), from[1] + len * Math.cos(a), from[2]];
  };
  const elbow = at(shoulder, 0.3, elev);
  return [elbow, at(elbow, 0.25, elev + bend)];
}

export function demoLandmarks(tSec) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  const set = (i, [x, y, z]) => Object.assign(lm[i], { x, y, z });
  const rS = [-0.19, -0.45, 0], lS = [0.19, -0.45, 0];
  set(LM.NOSE, [0, -0.62, -0.05]);
  set(LM.R_SHOULDER, rS); set(LM.L_SHOULDER, lS);
  set(LM.R_HIP, [-0.1, 0, 0]); set(LM.L_HIP, [0.1, 0, 0]);
  const [rE, rW] = arm(rS, -1, 150, 25 * Math.sin(tSec * 6));      // right arm up, waving at the elbow
  set(LM.R_ELBOW, rE); set(LM.R_WRIST, rW);
  const [lE, lW] = arm(lS, 1, 50 + 40 * Math.sin(tSec * 2.2), 15);  // left arm flapping
  set(LM.L_ELBOW, lE); set(LM.L_WRIST, lW);
  return lm;
}
