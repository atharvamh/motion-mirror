// A procedural, human-proportioned scientist in a lab coat with spiky blue hair (a homage to a certain
// mad-scientist cartoon, built from primitives). Arms and legs are single continuous meshes bound to
// two-bone skeletons, so elbows and knees bend smoothly instead of showing sticks and joint balls. No
// model files are needed. Each frame the tracked landmark directions become bone targets, and every
// bone eases toward its target (FOLLOW_RATE) for fluid motion. To use a rigged glTF/VRM character
// later, replace the model construction and keep update(pose, tSec, dt).
import * as THREE from 'three';
import { LM, bodyYaw, legCompression } from './kinematics.js';

const ARM_LEN = [0.55, 0.5], LEG_LEN = [0.9, 0.9];       // lengths are cosmetic: only the tracked directions drive the bones
const LEG_TOTAL = LEG_LEN[0] + LEG_LEN[1];
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

// Bones chase their targets exponentially: alpha = 1 - exp(-dt * rate). Higher = snappier, lower = silkier
// (22/s is a ~45 ms time constant). Parts that leave the frame relax to rest at the slower rate.
const FOLLOW_RATE = 22, RELAX_RATE = 5;

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
const M = {
  coat: mat(0xe9edf2, { roughness: 0.75 }),
  shirt: mat(0x7fc8e6, { roughness: 0.7 }),
  pants: mat(0x7a5638, { roughness: 0.8 }),
  shoe: mat(0x2a2a2e, { roughness: 0.5 }),
  sole: mat(0xd9d9d9, { roughness: 0.6 }),
  skin: mat(0xf0d5b6, { roughness: 0.6 }),
  hair: mat(0x9fdcf0, { roughness: 0.6 }),
  brow: mat(0x7a8590),
  mouth: mat(0x3a1414),
  teeth: mat(0xf6f1dc, { roughness: 0.4 }),
  drool: mat(0xcfe8f5, { roughness: 0.1, transparent: true, opacity: 0.8 }),
  eyeWhite: mat(0xffffff, { roughness: 0.15 }),
  eyeBlack: mat(0x111111, { roughness: 0.25 }),
};

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function mesh(geo, material, pos = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos); m.scale.set(...scale);
  return m;
}

/**
 * A smooth tube hanging down from its root, skinned to two bones (root + joint) with a soft
 * blend around the joint, so it bends like rubber. radius(t) gives the radius along t = 0..1 (top to
 * bottom); `flat` squashes the cross-section (0.5 would make it a flat ribbon); the ends are rounded.
 */
function skinnedTube({ lens, radius, flat = 1, material, blend = 0.35 }) {
  const total = lens[0] + lens[1], N = 48, cap = 0.12;
  const round = (e) => Math.sqrt(Math.max(0, 1 - (1 - Math.min(e, 1)) ** 2));
  const profile = [];
  for (let i = N; i >= 0; i--) {                                    // bottom to top: outward-facing normals
    const t = i / N;
    profile.push(new THREE.Vector2(Math.max(1e-4, radius(t) * Math.min(round(t / cap), round((1 - t) / cap))), -t * total));
  }
  const geo = new THREE.LatheGeometry(profile, 28);
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const idx = [], wgt = [];
  const blendLen = blend * Math.min(...lens);
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, pos.getZ(i) * flat);                                // flatten, keeping the analytic normals consistent:
    const n = new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i) / flat).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
    const w1 = smoothstep(-blendLen, blendLen, -pos.getY(i) - lens[0]);   // 0 above the joint, 1 below it
    idx.push(0, 1, 0, 0); wgt.push(1 - w1, w1, 0, 0);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));

  const root = new THREE.Bone(), joint = new THREE.Bone();
  joint.position.y = -lens[0];
  root.add(joint);
  const skinned = new THREE.SkinnedMesh(geo, material);
  skinned.add(root);
  skinned.frustumCulled = false;                                    // the bind-pose bounds don't follow the bones
  skinned.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton([root, joint]));
  return { mesh: skinned, root, joint, end: lens[1], tRoot: new THREE.Quaternion(), tJoint: new THREE.Quaternion() };
}

function buildArm() {
  const arm = skinnedTube({ lens: ARM_LEN, radius: (t) => 0.125 - 0.04 * t, material: M.coat, blend: 0.3 });
  arm.joint.add(mesh(new THREE.SphereGeometry(1, 24, 16), M.skin, [0, -arm.end - 0.04, 0], [0.075, 0.12, 0.055]));   // hand
  return arm;
}

function buildLeg() {
  const leg = skinnedTube({ lens: LEG_LEN, radius: (t) => 0.17 - 0.07 * t, material: M.pants, blend: 0.25 });
  leg.foot = new THREE.Group();                                     // kept flat on the floor and facing the pelvis each frame
  leg.foot.position.y = -leg.end;
  leg.foot.add(mesh(new THREE.SphereGeometry(1, 28, 18), M.shoe, [0, -0.07, 0.1], [0.13, 0.08, 0.29]));
  leg.foot.add(mesh(new THREE.SphereGeometry(1, 28, 10), M.sole, [0, -0.13, 0.1], [0.14, 0.025, 0.3]));
  leg.joint.add(leg.foot);
  return leg;
}

const EYE_R = 0.115, PUPIL_R = 0.026, WOBBLE_R = 0.06;
function buildEye(x) {
  const eye = new THREE.Group();
  eye.position.set(x, 0.4, 0.235);
  eye.add(mesh(new THREE.SphereGeometry(EYE_R, 28, 18), M.eyeWhite));
  const pupil = mesh(new THREE.SphereGeometry(PUPIL_R, 20, 14), M.eyeBlack, [0, 0, EYE_R - 0.004]);
  eye.add(pupil);
  return { eye, pupil, vx: 0, vy: 0, px: 0, py: 0 };                // spring state for the googly wobble
}

/** The lab coat as a single lathe: a smooth spline through hem, waist, chest and shoulders (the cross-section is squashed in z by the caller). */
function buildCoat() {
  const spline = new THREE.SplineCurve([[0.4, -0.34], [0.37, -0.2], [0.32, -0.02], [0.29, 0.3], [0.35, 0.62], [0.44, 0.88], [0.45, 1.0], [0.37, 1.12], [0.2, 1.18], [0.12, 1.2]].map(([r, y]) => new THREE.Vector2(r, y)));
  const profile = [new THREE.Vector2(1e-4, -0.34), ...spline.getPoints(60)];
  return new THREE.LatheGeometry(profile, 56);
}

/** Spiky swept-back hair: a cap on the skull plus tapered cones fanned over the crown. */
function buildHair() {
  const hair = new THREE.Group(), tilt = -0.4, R = [0.3, 0.38, 0.31];
  const cap = mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, 0.95), M.hair, [0, 0.3, 0], R.map((r) => r * 1.04));
  cap.rotation.x = tilt;
  hair.add(cap);
  const pole = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
  const side = new THREE.Vector3(1, 0, 0), back = new THREE.Vector3().crossVectors(side, pole);
  const rings = [[0, 1, 0.34], [0.32, 6, 0.28], [0.62, 11, 0.24], [0.88, 14, 0.2]];     // [angle from the crown pole, spikes, length]
  let n = 0;
  for (const [ang, count, len] of rings) {
    for (let i = 0; i < count; i++, n++) {
      const az = (i / count) * Math.PI * 2 + ang * 2.1, j = Math.sin(n * 12.9898) * 0.5;   // deterministic jitter
      const d = new THREE.Vector3().addScaledVector(pole, Math.cos(ang)).addScaledVector(side, Math.sin(ang) * Math.cos(az)).addScaledVector(back, Math.sin(ang) * Math.sin(az)).normalize();
      const dir = d.clone().add(new THREE.Vector3(0, 0.45, -0.3)).normalize();           // sweep up and back
      const L = len * (1 + 0.25 * j);
      const spike = mesh(new THREE.ConeGeometry(0.065, L, 10), M.hair);
      spike.position.set(R[0] * d.x * 1.0, 0.3 + R[1] * d.y, R[2] * d.z).addScaledVector(dir, L * 0.35);
      spike.quaternion.setFromUnitVectors(UP, dir);
      hair.add(spike);
    }
  }
  return hair;
}

export class Avatar {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    this.camera.position.set(0, 2.2, 10.5);
    this.camera.lookAt(0, 2.0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(3, 7, 6);
    const rim = new THREE.DirectionalLight(0xa9c4ff, 1.2);        // cool back light so the figure keeps an edge against the backdrop
    rim.position.set(-4, 4, -6);
    this.scene.add(sun, rim);

    // rig (x motion) > pelvis (squat drop, yaw) > torso (lean/twist) > neck/head, arms;  pelvis > legs
    const rig = this.rig = new THREE.Group();
    this.scene.add(rig);
    const shadow = mesh(new THREE.CircleGeometry(1.3, 48), mat(0x03140c, { transparent: true, opacity: 0.35 }), [0, 0.01, 0.1]);
    shadow.rotation.x = -Math.PI / 2;
    rig.add(shadow);
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = LEG_TOTAL;
    rig.add(this.pelvis);

    this.torso = new THREE.Group();
    this.pelvis.add(this.torso);
    this.torso.add(mesh(buildCoat(), M.coat, [0, 0, 0], [1, 1, 0.68]));                                            // one smooth coat: hem, waist, chest, shoulders
    this.torso.add(mesh(new THREE.SphereGeometry(1, 24, 16), M.shirt, [0, 0.88, 0.29], [0.15, 0.3, 0.05]));       // shirt showing through the open coat
    this.torso.add(mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.22, 20), M.skin, [0, 1.22, 0]));                 // neck
    const collar = mesh(new THREE.TorusGeometry(0.14, 0.042, 12, 28), M.coat, [0, 1.21, 0], [1, 1, 1.1]);
    collar.rotation.x = Math.PI / 2;
    this.torso.add(collar);

    this.neck = new THREE.Group();
    this.neck.position.set(0, 1.3, 0.01);
    this.torso.add(this.neck);
    this.head = this.neck;
    this.head.add(mesh(new THREE.SphereGeometry(1, 40, 28), M.skin, [0, 0.3, 0], [0.29, 0.37, 0.3]));
    this.head.add(mesh(new THREE.SphereGeometry(1, 16, 12), M.skin, [0, 0.27, 0.3], [0.05, 0.075, 0.07]));        // big nose
    this.mouth = new THREE.Group();                                                                                // wide, wonky open mouth: opens when burping
    this.mouth.position.set(0, 0.13, 0.262);
    this.mouth.rotation.z = 0.08;
    this.mouthHole = mesh(new THREE.SphereGeometry(1, 20, 12), M.mouth, [0, 0, 0], [0.1, 0.03, 0.03]);
    this.mouth.add(this.mouthHole, mesh(new THREE.SphereGeometry(1, 16, 8), M.teeth, [0, 0.014, 0.012], [0.075, 0.012, 0.02]));
    this.drool = mesh(new THREE.CapsuleGeometry(0.012, 0.09, 4, 8), M.drool, [0.075, -0.07, 0.012]);               // a strand of drool from the corner
    this.mouth.add(this.drool);
    this.head.add(this.mouth);
    for (const x of [-1, 1]) {
      this.head.add(mesh(new THREE.SphereGeometry(1, 16, 12), M.skin, [x * 0.285, 0.3, 0], [0.04, 0.07, 0.035]));   // ears
      const brow = mesh(new THREE.SphereGeometry(1, 16, 8), M.brow, [x * 0.12, 0.535, 0.225], [0.115, 0.022, 0.035]);
      brow.rotation.z = x * 0.28;                                                                                   // inner ends low: manic
      this.head.add(brow);
    }
    this.head.add(buildHair());
    this.eyes = [buildEye(-0.105), buildEye(0.105)];
    this.eyes.forEach((e) => this.head.add(e.eye));

    // Limbs are named by screen side: "plus" (+x) follows the user's RIGHT side in the mirrored view.
    const place = (limb, parent, x, y) => { limb.root.position.set(x, y, 0); parent.add(limb.mesh); };
    this.arms = { plus: buildArm(), minus: buildArm() };
    place(this.arms.plus, this.torso, 0.45, 1.02);
    place(this.arms.minus, this.torso, -0.45, 1.02);
    this.legs = { plus: buildLeg(), minus: buildLeg() };
    place(this.legs.plus, this.pelvis, 0.2, 0.15);
    place(this.legs.minus, this.pelvis, -0.2, 0.15);

    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._qa = new THREE.Quaternion(); this._qb = new THREE.Quaternion(); this._qc = new THREE.Quaternion(); this._qd = new THREE.Quaternion(); this._qe = new THREE.Quaternion();
    this._id = new THREE.Quaternion();
    this.torsoQ = new THREE.Quaternion();       // smoothed torso orientation in world space
    this.torsoTarget = new THREE.Quaternion();
    this.pelvisQ = new THREE.Quaternion();      // pelvis orientation in world space (whole-body yaw)
    this.headTarget = new THREE.Quaternion();
    this.yaw = 0; this.yawTarget = 0;
    this.drop = 0;
    this.burp = 0;
  }

  resize() {
    const c = this.renderer.domElement, w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * this.renderer.getPixelRatio()) || c.height !== Math.round(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      // keep the whole body in frame on narrow screens
      this.camera.position.z = 10 * Math.max(1, 0.9 / this.camera.aspect);
    }
  }

  _vec(into, from, to) { return into.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize(); }

  /** Orientation whose +y is `up` and whose +x is as close to `right` as possible. */
  _basis(out, right, up) {
    const x = this._v.copy(right), y = this._w.copy(up).normalize();
    x.addScaledVector(y, -x.dot(y)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    return out.setFromRotationMatrix(this._m.makeBasis(x, y, z));
  }

  /**
   * Set a hanging two-bone limb's targets so its first bone points along s->e and its second along
   * e->w (scene-space points), given the world rotation of the limb's parent.
   */
  _aim(limb, parentQ, s, e, w) {
    const qU = this._qa.setFromUnitVectors(DOWN, this._vec(this._v, s, e));
    const qF = this._qb.setFromUnitVectors(DOWN, this._vec(this._v, e, w));
    limb.tRoot.copy(this._qc.copy(parentQ).invert().multiply(qU));
    limb.tJoint.copy(this._qc.copy(qU).invert().multiply(qF));
  }

  _follow(limb, a) {
    limb.root.quaternion.slerp(limb.tRoot, a);
    limb.joint.quaternion.slerp(limb.tJoint, a);
  }

  /** Soles stay flat on the floor and face where the pelvis faces, whatever the shin does. */
  _flatFoot(leg) {
    const shinWorld = this._qd.copy(this.pelvisQ).multiply(leg.root.quaternion).multiply(leg.joint.quaternion);
    leg.foot.quaternion.copy(this._qe.copy(shinWorld).invert().multiply(this.pelvisQ));
  }

  /**
   * pose: { pts, ok, rootX } where pts maps landmark index -> filtered scene-space [x,y,z] and ok
   * flags which body parts are currently tracked (RArm, LArm, RLeg, LLeg, torso, hips, head); or null.
   * Parts that are not tracked ease back to rest instead of freezing or flailing.
   */
  update(pose, tSec, dt) {
    const { pts, ok } = pose ?? { pts: {}, ok: {} };
    const step = Math.min(dt, 0.1);
    const k = 1 - Math.exp(-step * FOLLOW_RATE), kr = 1 - Math.exp(-step * RELAX_RATE);

    // whole-body turn: the pelvis (and so the legs) follows the hip line, or the shoulders if the hips are out of frame.
    // Out-of-range or ambiguous readings hold the last good yaw instead of letting the figure flip around.
    const yawIn = ok.hips ? bodyYaw(pts[LM.R_HIP], pts[LM.L_HIP]) : ok.torso ? bodyYaw(pts[LM.R_SHOULDER], pts[LM.L_SHOULDER], 0.36) : null;
    if (yawIn !== null) this.yawTarget = yawIn;
    else if (!ok.hips && !ok.torso) this.yawTarget *= 1 - kr;
    this.yaw += (this.yawTarget - this.yaw) * k;
    this.pelvisQ.setFromAxisAngle(UP, this.yaw);
    this.pelvis.quaternion.copy(this.pelvisQ);

    // torso: lean + twist from shoulders/hips (shoulders alone give roll + twist but no pitch)
    if (ok.torso) {
      const R = pts[LM.R_SHOULDER], L = pts[LM.L_SHOULDER];
      const right = (this._tmpR ??= new THREE.Vector3()).set(R[0] - L[0], R[1] - L[1], R[2] - L[2]);
      const up = this._tmpU ??= new THREE.Vector3();
      if (ok.hips) {
        const hR = pts[LM.R_HIP], hL = pts[LM.L_HIP];
        up.set((R[0] + L[0] - hR[0] - hL[0]) / 2, (R[1] + L[1] - hR[1] - hL[1]) / 2, (R[2] + L[2] - hR[2] - hL[2]) / 2);
      } else up.copy(UP);
      this.torsoTarget.copy(this._basis(this._qa, right, up));
      this.torsoQ.slerp(this.torsoTarget, k);
    } else this.torsoQ.slerp(this._id, kr);
    this.torso.quaternion.copy(this._qb.copy(this.pelvisQ).invert().multiply(this.torsoQ));   // world -> local to the pelvis

    for (const [side, key] of [['plus', 'R'], ['minus', 'L']]) {
      const arm = this.arms[side], leg = this.legs[side];
      const [S, E, W, H, K, A] = key === 'R'
        ? [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE]
        : [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST, LM.L_HIP, LM.L_KNEE, LM.L_ANKLE];
      const armOk = ok[`${key}Arm`], legOk = ok[`${key}Leg`];
      if (armOk) this._aim(arm, this.torsoQ, pts[S], pts[E], pts[W]); else { arm.tRoot.identity(); arm.tJoint.identity(); }
      this._follow(arm, armOk ? k : kr);
      if (legOk) this._aim(leg, this.pelvisQ, pts[H], pts[K], pts[A]); else { leg.tRoot.identity(); leg.tJoint.identity(); }
      this._follow(leg, legOk ? k : kr);
      this._flatFoot(leg);
    }

    // head orientation from ears + nose, relative to the torso
    if (ok.head) {
      const R = pts[LM.R_EAR], L = pts[LM.L_EAR];
      const x = (this._tmpE ??= new THREE.Vector3()).set(R[0] - L[0], R[1] - L[1], R[2] - L[2]).normalize();
      const mid = [0, 1, 2].map((i) => (R[i] + L[i]) / 2);
      const fwd = this._vec(new THREE.Vector3(), mid, pts[LM.NOSE]);
      fwd.addScaledVector(x, -fwd.dot(x)).normalize();
      const y = new THREE.Vector3().crossVectors(fwd, x);
      const headQ = this._qb.setFromRotationMatrix(this._m.makeBasis(x, y, fwd));
      this.headTarget.copy(this._qc.copy(this.torsoQ).invert().multiply(headQ));
      this.head.quaternion.slerp(this.headTarget, k);
    } else this.head.quaternion.slerp(this._id, kr);

    // squat: lower the pelvis by how folded the (most extended, i.e. planted) leg is
    if (ok.RLeg || ok.LLeg) {
      const c = [['R', ok.RLeg], ['L', ok.LLeg]].filter(([, o]) => o)
        .map(([key]) => legCompression(pts[LM[`${key}_HIP`]], pts[LM[`${key}_KNEE`]], pts[LM[`${key}_ANKLE`]]));
      this.drop += (LEG_TOTAL * Math.min(...c) - this.drop) * k;
    } else this.drop *= 1 - kr;
    this.pelvis.position.y = LEG_TOTAL - this.drop + Math.sin(tSec * 3) * 0.02;   // idle breathing bob
    this.rig.position.x += ((pose?.rootX ?? 0) - this.rig.position.x) * (pose ? k : kr);

    // burp: both wrists above the nose opens the mouth wide, with a gurgling wobble; otherwise a manic half-open grin
    const burp = ok.RArm && ok.LArm && ok.head && pts[LM.R_WRIST][1] > pts[LM.NOSE][1] && pts[LM.L_WRIST][1] > pts[LM.NOSE][1];   // scene y is up
    this.burp += ((burp ? 1 : 0) - this.burp) * (1 - Math.exp(-step * 14));
    const open = 0.9 + this.burp * (2.4 + Math.sin(tSec * 40) * 0.5) + Math.max(0, Math.sin(tSec * 1.7)) * 0.4;
    this.mouthHole.scale.y = 0.03 * open;
    this.mouthHole.position.y = -0.03 * (open - 1) * 0.6;
    this.drool.scale.y = 1 + this.burp * 1.5 + Math.sin(tSec * 2.3) * 0.15;

    this._googly(dt);
    this.resize();
    this.renderer.render(this.scene, this.camera);
  }

  // Googly eyes: each pupil is a damped spring pushed by the head's roll velocity (inertia) and pulled down by gravity.
  _googly(dt) {
    const step = Math.min(dt, 0.033);
    const roll = (this.head.rotation.z - (this._prevRoll ?? this.head.rotation.z)) / Math.max(step, 1e-3);
    this._prevRoll = this.head.rotation.z;
    const R = WOBBLE_R, k = 140, damp = 7;
    for (const e of this.eyes) {
      e.vx += (-k * e.px + roll * 0.2 - damp * e.vx) * step;
      e.vy += (-k * (e.py + 0.015) - damp * e.vy) * step;      // rests slightly low
      e.px += e.vx * step; e.py += e.vy * step;
      const r = Math.hypot(e.px, e.py);                       // stay inside the eyeball
      if (r > R) { e.px *= R / r; e.py *= R / r; e.vx *= -0.4; e.vy *= -0.4; }
      e.pupil.position.x = e.px; e.pupil.position.y = e.py;
    }
  }
}
