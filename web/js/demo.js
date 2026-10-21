// Synthetic full-body pose so the app (and its tests) work without a camera. Returns
// MediaPipe-style world landmarks (metres, x right, y down, z toward camera negative) of a
// person who waves one arm, flaps the other, squats, sways, turns their head and slowly pivots their whole body.
import { LM } from './kinematics.js';

// side: -1 for the person's right (image-left, x < 0), +1 for the left.
// elev: upper-arm angle from straight down; bend: extra forearm angle in the same plane.
function arm(shoulder, side, elev, bend) {
  const at = (from, len, deg) => {
    const a = deg * Math.PI / 180;
    return [from[0] + side * len * Math.sin(a), from[1] + len * Math.cos(a), from[2]];
  };
  const elbow = at(shoulder, 0.3, elev);
  return [elbow, at(elbow, 0.25, elev + bend)];
}

// A squat: thigh pitches forward by `deg`, shin back by `deg`, so the ankle stays under the hip.
function leg(hip, deg, lift = 0) {
  const a = deg * Math.PI / 180;
  const knee = [hip[0], hip[1] + 0.45 * Math.cos(a), hip[2] - 0.45 * Math.sin(a)];
  const ankle = [hip[0], knee[1] + 0.45 * Math.cos(a), hip[2] - lift];
  return [knee, ankle];
}

export function demoLandmarks(tSec) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  const set = (i, [x, y, z]) => Object.assign(lm[i], { x, y, z });
  const squat = Math.max(0, Math.sin(tSec * 1.3)) * 65;         // 0..65 degrees, in bursts
  const sway = 0.07 * Math.sin(tSec * 0.9);                      // torso leans side to side
  const turn = 0.05 * Math.sin(tSec * 1.1);                      // head yaw

  const hipY = squat ? 0 : 0;
  const rH = [-0.1, hipY, 0], lH = [0.1, hipY, 0];
  const rS = [-0.19 + sway, -0.45, 0], lS = [0.19 + sway, -0.45, 0];
  set(LM.R_HIP, rH); set(LM.L_HIP, lH);
  set(LM.R_SHOULDER, rS); set(LM.L_SHOULDER, lS);
  set(LM.NOSE, [sway * 1.3 + turn, -0.64, -0.1]);
  set(LM.R_EAR, [-0.08 + sway * 1.3, -0.62, 0.0]); set(LM.L_EAR, [0.08 + sway * 1.3, -0.62, 0.0]);
  const [rE, rW] = arm(rS, -1, 150, 25 * Math.sin(tSec * 6));    // right arm up, waving at the elbow
  set(LM.R_ELBOW, rE); set(LM.R_WRIST, rW);
  const [lE, lW] = arm(lS, 1, 50 + 40 * Math.sin(tSec * 2.2), 15);   // left arm flapping
  set(LM.L_ELBOW, lE); set(LM.L_WRIST, lW);
  const [rK, rA] = leg(rH, squat); set(LM.R_KNEE, rK); set(LM.R_ANKLE, rA);
  const [lK, lA] = leg(lH, squat); set(LM.L_KNEE, lK); set(LM.L_ANKLE, lA);
  // pivot the whole body about the vertical axis by up to +-55 degrees
  const phi = 55 * Math.PI / 180 * Math.sin(tSec * 0.55), c = Math.cos(phi), s = Math.sin(phi);
  for (const p of lm) { const x = p.x, z = p.z; p.x = x * c - z * s; p.z = x * s + z * c; }
  return lm;
}
