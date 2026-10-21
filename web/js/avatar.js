// A procedural chicken built from primitives, so the app needs no model files, with a full
// skeleton: pelvis, torso, head, two 2-bone wings (arms) and two 2-bone legs. Each frame the
// tracked landmark directions are turned into bone rotations. To use a rigged glTF/VRM
// character later, replace the model construction and keep update(pose, tSec, dt).
import * as THREE from 'three';
import { LM, bodyYaw, legCompression } from './kinematics.js';

const ARM_LEN = [0.85, 0.8], LEG_LEN = [0.64, 0.64];
const LEG_TOTAL = LEG_LEN[0] + LEG_LEN[1];
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
const M = {
  feather: mat(0xfff6e8), wing: mat(0xffffff), orange: mat(0xff9a1f), red: mat(0xe5322d),
  white: mat(0xffffff, { roughness: 0.2 }), black: mat(0x111111, { roughness: 0.3 }),
  tail: mat(0xf2e3c8),
};

function mesh(geo, material, pos = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos); m.scale.set(...scale);
  return m;
}

/** Two-bone limb hanging down from its root. `joint` is the elbow/knee pivot. */
function buildLimb(lens, radii, material, jointRadius) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.SphereGeometry(jointRadius, 20, 14), material));
  root.add(mesh(new THREE.CapsuleGeometry(radii[0], lens[0] - radii[0] * 2, 6, 14), material, [0, -lens[0] / 2, 0]));
  const joint = new THREE.Group();
  joint.position.y = -lens[0];
  joint.add(mesh(new THREE.SphereGeometry(jointRadius * 0.9, 20, 14), material));
  joint.add(mesh(new THREE.CapsuleGeometry(radii[1], lens[1] - radii[1] * 2, 6, 14), material, [0, -lens[1] / 2, 0]));
  root.add(joint);
  return { root, joint, end: lens[1] };
}

function buildArm() {
  const a = buildLimb(ARM_LEN, [0.15, 0.12], M.wing, 0.2);
  for (const dx of [-0.1, 0, 0.1]) {                                  // feather tips
    const tip = mesh(new THREE.ConeGeometry(0.075, 0.38, 10), M.feather, [dx, -a.end - 0.1, 0]);
    tip.rotation.z = Math.PI + dx * 1.6;
    a.joint.add(tip);
  }
  return a;
}

function buildLeg() {
  const l = buildLimb(LEG_LEN, [0.1, 0.08], M.orange, 0.12);
  l.foot = new THREE.Group();                                         // kept flat on the floor each frame
  l.foot.position.y = -l.end;
  l.foot.add(mesh(new THREE.BoxGeometry(0.34, 0.07, 0.42), M.orange, [0, -0.03, 0.14]));
  for (const dx of [-0.11, 0, 0.11]) l.foot.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), M.orange, [dx, -0.03, 0.36]));
  l.joint.add(l.foot);
  return l;
}

function buildEye(x) {
  const eye = new THREE.Group();
  eye.position.set(x, 0.58, 0.4);
  eye.add(mesh(new THREE.SphereGeometry(0.26, 24, 16), M.white));
  const pupil = mesh(new THREE.SphereGeometry(0.12, 16, 12), M.black, [0, 0, 0.19]);
  eye.add(pupil);
  return { eye, pupil, vx: 0, vy: 0, px: 0, py: 0 };                  // spring state for the googly wobble
}

export class Avatar {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    this.camera.position.set(0, 2.5, 11.2);
    this.camera.lookAt(0, 2.35, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.3);
    sun.position.set(3, 7, 6);
    this.scene.add(sun);

    // rig (x motion) > pelvis (squat drop) > torso (lean/twist) > head, wings;  pelvis > legs
    const rig = this.rig = new THREE.Group();
    this.scene.add(rig);
    const shadow = mesh(new THREE.CircleGeometry(1.5, 48), mat(0x000000, { transparent: true, opacity: 0.16 }), [0, 0.01, 0.1]);
    shadow.rotation.x = -Math.PI / 2;
    rig.add(shadow);
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = LEG_TOTAL;
    rig.add(this.pelvis);

    this.torso = new THREE.Group();
    this.pelvis.add(this.torso);
    this.torso.add(mesh(new THREE.SphereGeometry(1, 40, 28), M.feather, [0, 0.9, -0.05], [0.78, 1.08, 0.64]));   // body
    for (const [dx, rz] of [[-0.32, 0.35], [0, 0], [0.32, -0.35]]) {                                          // tail feathers
      const f = mesh(new THREE.ConeGeometry(0.2, 1.0, 12), M.tail, [dx, 1.0, -0.62]);
      f.rotation.set(-0.5, 0, rz);
      this.torso.add(f);
    }
    this.neck = new THREE.Group();
    this.neck.position.set(0, 1.85, 0.05);
    this.torso.add(this.neck);
    this.head = this.neck;
    const skull = mesh(new THREE.SphereGeometry(0.68, 32, 24), M.feather, [0, 0.5, 0], [1, 0.96, 1]);
    const beak = mesh(new THREE.ConeGeometry(0.2, 0.55, 16), M.orange, [0, 0.38, 0.8]);
    beak.rotation.x = Math.PI / 2;
    this.head.add(skull, beak);
    for (const [dx, dy, s] of [[-0.2, 1.15, 0.21], [0, 1.26, 0.28], [0.2, 1.15, 0.21]]) this.head.add(mesh(new THREE.SphereGeometry(s, 16, 12), M.red, [dx, dy, 0.05]));   // comb
    this.head.add(mesh(new THREE.SphereGeometry(0.14, 16, 12), M.red, [0, 0.0, 0.68], [1, 1.6, 1]));     // wattle
    this.eyes = [buildEye(-0.3), buildEye(0.3)];
    this.eyes.forEach((e) => this.head.add(e.eye));

    // Limbs are named by screen side: "plus" (+x) follows the user's RIGHT side in the mirrored view.
    this.arms = { plus: buildArm(), minus: buildArm() };
    this.arms.plus.root.position.set(0.74, 1.5, 0);
    this.arms.minus.root.position.set(-0.74, 1.5, 0);
    this.torso.add(this.arms.plus.root, this.arms.minus.root);
    this.legs = { plus: buildLeg(), minus: buildLeg() };
    this.legs.plus.root.position.set(0.32, 0, 0);
    this.legs.minus.root.position.set(-0.32, 0, 0);
    this.pelvis.add(this.legs.plus.root, this.legs.minus.root);

    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._qa = new THREE.Quaternion(); this._qb = new THREE.Quaternion(); this._qc = new THREE.Quaternion(); this._qd = new THREE.Quaternion(); this._qe = new THREE.Quaternion();
    this._id = new THREE.Quaternion();
    this.torsoQ = new THREE.Quaternion();       // torso orientation in world space
    this.pelvisQ = new THREE.Quaternion();      // pelvis orientation in world space (whole-body yaw)
    this.yaw = 0; this.yawTarget = 0;
    this.drop = 0;
    this.lastPose = -Infinity;
  }

  resize() {
    const c = this.renderer.domElement, w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * this.renderer.getPixelRatio()) || c.height !== Math.round(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      // keep the whole body in frame on narrow screens
      this.camera.position.z = 11.2 * Math.max(1, 0.9 / this.camera.aspect);
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
   * Aim a hanging two-bone limb: its first bone along s->e and its second along e->w (scene-space
   * points), given the world rotation of the limb's parent. Returns the world rotation of the 2nd bone.
   */
  _aim(limb, parentQ, s, e, w, out) {
    const qU = this._qa.setFromUnitVectors(DOWN, this._vec(this._v, s, e));
    const qF = out.setFromUnitVectors(DOWN, this._vec(this._v, e, w));
    limb.root.quaternion.copy(this._qb.copy(parentQ).invert().multiply(qU));
    limb.joint.quaternion.copy(this._qc.copy(qU).invert().multiply(qF));
    return out;
  }

  _relax(q, k = 0.12) { q.slerp(this._id, k); }

  /** Soles stay flat on the floor and face where the pelvis faces, whatever the shin does. */
  _flatFoot(leg, shinWorld) { leg.foot.quaternion.copy(this._qe.copy(shinWorld).invert().multiply(this.pelvisQ)); }

  /**
   * pose: { pts, ok, rootX } where pts maps landmark index -> filtered scene-space [x,y,z] and ok
   * flags which body parts are currently tracked (rArm, lArm, rLeg, lLeg, torso, head); or null.
   * Parts that are not tracked ease back to rest instead of freezing or flailing.
   */
  update(pose, tSec, dt) {
    const { pts, ok } = pose ?? { pts: {}, ok: {} };
    if (pose) this.lastPose = tSec;
    const gone = !pose && tSec - this.lastPose > 0.6;

    // whole-body turn: the pelvis (and so the legs) follows the hip line, or the shoulders if the hips are out of frame.
    // Out-of-range or ambiguous readings hold the last good yaw instead of letting the chicken flip around.
    const yawIn = ok.hips ? bodyYaw(pts[LM.R_HIP], pts[LM.L_HIP]) : ok.torso ? bodyYaw(pts[LM.R_SHOULDER], pts[LM.L_SHOULDER], 0.36) : null;
    if (yawIn !== null) this.yawTarget = yawIn;
    else if (!ok.hips && !ok.torso) this.yawTarget *= 0.95;
    this.yaw += (this.yawTarget - this.yaw) * 0.4;
    this.pelvisQ.setFromAxisAngle(UP, this.yaw);
    this.pelvis.quaternion.copy(this.pelvisQ);

    // torso: lean + twist from shoulders/hips (shoulders alone give roll + twist but no pitch)
    if (ok.torso) {
      const sh = [pts[LM.R_SHOULDER], pts[LM.L_SHOULDER]];
      const right = this._tmpR ??= new THREE.Vector3();
      right.set(sh[0][0] - sh[1][0], sh[0][1] - sh[1][1], sh[0][2] - sh[1][2]);
      const up = this._tmpU ??= new THREE.Vector3();
      if (ok.hips) {
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const s = mid(sh[0], sh[1]), h = mid(pts[LM.R_HIP], pts[LM.L_HIP]);
        up.set(s[0] - h[0], s[1] - h[1], s[2] - h[2]);
      } else up.copy(UP);
      this.torsoQ.copy(this._basis(this._qa, right, up));
    } else this._relax(this.torsoQ);

    this.torso.quaternion.copy(this._qb.copy(this.pelvisQ).invert().multiply(this.torsoQ));   // world -> local to the pelvis

    for (const [side, key] of [['plus', 'R'], ['minus', 'L']]) {
      const arm = this.arms[side], leg = this.legs[side];
      const [S, E, W, H, K, A] = key === 'R'
        ? [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE]
        : [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST, LM.L_HIP, LM.L_KNEE, LM.L_ANKLE];
      if (ok[`${key}Arm`]) this._aim(arm, this.torsoQ, pts[S], pts[E], pts[W], this._qd);
      else { this._relax(arm.root.quaternion); this._relax(arm.joint.quaternion); }
      if (ok[`${key}Leg`]) {
        this._flatFoot(leg, this._aim(leg, this.pelvisQ, pts[H], pts[K], pts[A], this._qd));
      } else {
        this._relax(leg.root.quaternion); this._relax(leg.joint.quaternion);
        this._flatFoot(leg, this._qd.copy(this.pelvisQ).multiply(leg.root.quaternion).multiply(leg.joint.quaternion));
      }
    }

    // head orientation from ears + nose, relative to the torso
    if (ok.head) {
      const ears = this._tmpE ??= new THREE.Vector3();
      ears.set(pts[LM.R_EAR][0] - pts[LM.L_EAR][0], pts[LM.R_EAR][1] - pts[LM.L_EAR][1], pts[LM.R_EAR][2] - pts[LM.L_EAR][2]);
      const mid = [0, 1, 2].map((i) => (pts[LM.R_EAR][i] + pts[LM.L_EAR][i]) / 2);
      const fwd = this._vec(new THREE.Vector3(), mid, pts[LM.NOSE]);
      const x = ears.normalize();
      fwd.addScaledVector(x, -fwd.dot(x)).normalize();
      const y = new THREE.Vector3().crossVectors(fwd, x);
      const headQ = this._qb.setFromRotationMatrix(this._m.makeBasis(x, y, fwd));
      this.head.quaternion.copy(this._qc.copy(this.torsoQ).invert().multiply(headQ));
    } else this._relax(this.head.quaternion);

    // squat: lower the pelvis by how folded the (most extended, i.e. planted) leg is
    if (ok.RLeg || ok.LLeg) {
      const c = [['R', ok.RLeg], ['L', ok.LLeg]].filter(([, o]) => o)
        .map(([k]) => legCompression(pts[LM[`${k}_HIP`]], pts[LM[`${k}_KNEE`]], pts[LM[`${k}_ANKLE`]]));
      this.drop += (LEG_TOTAL * Math.min(...c) - this.drop) * 0.5;
    } else this.drop *= 0.9;
    this.pelvis.position.y = LEG_TOTAL - this.drop + Math.sin(tSec * 3) * 0.02;   // idle breathing bob
    this.rig.position.x += ((pose?.rootX ?? 0) - this.rig.position.x) * 0.3;
    if (gone) this.rig.position.x *= 0.9;

    this._googly(dt);
    this.resize();
    this.renderer.render(this.scene, this.camera);
  }

  // Googly eyes: each pupil is a damped spring pushed by the head's roll velocity (inertia) and pulled down by gravity.
  _googly(dt) {
    const step = Math.min(dt, 0.033);
    const roll = (this.head.rotation.z - (this._prevRoll ?? this.head.rotation.z)) / Math.max(step, 1e-3);
    this._prevRoll = this.head.rotation.z;
    const R = 0.12, k = 140, damp = 7;
    for (const e of this.eyes) {
      e.vx += (-k * e.px + roll * 0.6 - damp * e.vx) * step;
      e.vy += (-k * (e.py + 0.05) - damp * e.vy) * step;      // rests slightly low
      e.px += e.vx * step; e.py += e.vy * step;
      const r = Math.hypot(e.px, e.py);                       // stay inside the eyeball
      if (r > R) { e.px *= R / r; e.py *= R / r; e.vx *= -0.4; e.vy *= -0.4; }
      e.pupil.position.x = e.px; e.pupil.position.y = e.py;
    }
  }
}
