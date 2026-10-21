// A procedural chicken built from primitives, so the app needs no model files. Its wings are
// the arms: each is a two-bone chain driven directly by the tracked shoulder->elbow->wrist
// directions. To use a rigged glTF/VRM character later, replace buildChicken() and keep
// the setArm()/update() contract.
import * as THREE from 'three';
import { LM } from './kinematics.js';

const UPPER = 0.95, FORE = 0.85;
const DOWN = new THREE.Vector3(0, -1, 0);
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const M = {
  feather: mat(0xfff7ea), wing: mat(0xffffff), orange: mat(0xff9a1f), red: mat(0xe5322d),
  white: mat(0xffffff, { roughness: 0.2 }), black: mat(0x111111, { roughness: 0.3 }),
};

function mesh(geo, material, pos = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos); m.scale.set(...scale);
  return m;
}

function buildArm() {
  const shoulder = new THREE.Group();
  shoulder.add(mesh(new THREE.SphereGeometry(0.28, 24, 16), M.wing));
  shoulder.add(mesh(new THREE.CapsuleGeometry(0.27, UPPER - 0.3, 8, 16), M.wing, [0, -UPPER / 2, 0]));
  const elbow = new THREE.Group();
  elbow.position.y = -UPPER;
  elbow.add(mesh(new THREE.SphereGeometry(0.25, 24, 16), M.wing));
  elbow.add(mesh(new THREE.CapsuleGeometry(0.23, FORE - 0.3, 8, 16), M.wing, [0, -FORE / 2, 0]));
  // feather tips
  for (const dx of [-0.12, 0, 0.12]) {
    const tip = mesh(new THREE.ConeGeometry(0.1, 0.4, 12), M.feather, [dx, -FORE - 0.12, 0]);
    tip.rotation.z = Math.PI + dx * 1.5;
    elbow.add(tip);
  }
  shoulder.add(elbow);
  return { shoulder, elbow, upperQ: new THREE.Quaternion() };
}

function buildEye(x) {
  const eye = new THREE.Group();
  eye.position.set(x, 0.14, 0.45);
  eye.add(mesh(new THREE.SphereGeometry(0.28, 24, 16), M.white));
  const pupil = mesh(new THREE.SphereGeometry(0.13, 16, 12), M.black, [0, 0, 0.2]);
  eye.add(pupil);
  return { eye, pupil, vx: 0, vy: 0, px: 0, py: 0 };   // spring state for the googly wobble
}

export class Avatar {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    this.camera.position.set(0, 1.6, 9);
    this.camera.lookAt(0, 1.4, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(3, 6, 5);
    this.scene.add(sun);

    const root = this.root = new THREE.Group();
    this.scene.add(root);
    root.add(mesh(new THREE.SphereGeometry(1, 40, 28), M.feather, [0, 0.9, 0], [1.25, 1.45, 1.05]));  // body
    this.head = new THREE.Group();
    this.head.position.set(0, 2.75, 0.1);
    this.head.add(mesh(new THREE.SphereGeometry(0.75, 32, 24), M.feather));
    this.head.add(mesh(new THREE.ConeGeometry(0.2, 0.55, 16), M.orange, [0, -0.05, 0.85]));            // beak
    this.head.children.at(-1).rotation.x = Math.PI / 2;
    for (const [dx, dy, s] of [[-0.18, 0.78, 0.2], [0, 0.88, 0.26], [0.18, 0.78, 0.2]]) this.head.add(mesh(new THREE.SphereGeometry(s, 16, 12), M.red, [dx, dy, 0.05]));  // comb
    this.head.add(mesh(new THREE.SphereGeometry(0.14, 16, 12), M.red, [0, -0.42, 0.7], [1, 1.6, 1])); // wattle
    this.eyes = [buildEye(-0.34), buildEye(0.34)];
    this.eyes.forEach((e) => this.head.add(e.eye));
    root.add(this.head);

    for (const x of [-0.45, 0.45]) {                                                                    // legs and feet
      root.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 12), M.orange, [x, -0.45, 0]));
      root.add(mesh(new THREE.BoxGeometry(0.5, 0.08, 0.6), M.orange, [x, -0.85, 0.15]));
    }
    root.add(mesh(new THREE.CircleGeometry(1.8, 48), mat(0x000000, { transparent: true, opacity: 0.12 }), [0, -0.89, 0.1]));
    root.children.at(-1).rotation.x = -Math.PI / 2;                                                    // ground shadow

    // Arms are named by screen side: +x is the arm that follows the user's RIGHT arm in the mirrored view.
    this.arms = { plus: buildArm(), minus: buildArm() };
    this.arms.plus.shoulder.position.set(1.2, 1.7, 0);
    this.arms.minus.shoulder.position.set(-1.2, 1.7, 0);
    root.add(this.arms.plus.shoulder, this.arms.minus.shoulder);
    this._tmp = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.lastPose = -Infinity;
  }

  resize() {
    const c = this.renderer.domElement, w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Point one wing along shoulder->elbow and the forearm along elbow->wrist (scene-space points). */
  setArm(arm, s, e, w) {
    const dirU = this._tmp.set(e[0] - s[0], e[1] - s[1], e[2] - s[2]).normalize();
    arm.upperQ.setFromUnitVectors(DOWN, dirU);
    const dirF = this._tmp.set(w[0] - e[0], w[1] - e[1], w[2] - e[2]).normalize();
    this._q.setFromUnitVectors(DOWN, dirF);
    arm.shoulder.quaternion.copy(arm.upperQ);
    arm.elbow.quaternion.copy(arm.upperQ).invert().multiply(this._q);   // forearm relative to upper arm
  }

  /** pts: map of landmark index -> filtered scene-space [x,y,z], or null when nobody is tracked. */
  update(pts, tSec, dt) {
    if (pts) {
      this.lastPose = tSec;
      this.setArm(this.arms.plus, pts[LM.R_SHOULDER], pts[LM.R_ELBOW], pts[LM.R_WRIST]);
      this.setArm(this.arms.minus, pts[LM.L_SHOULDER], pts[LM.L_ELBOW], pts[LM.L_WRIST]);
      const mid = (a, b, i) => (a[i] + b[i]) / 2;
      const nx = pts[LM.NOSE][0] - mid(pts[LM.L_SHOULDER], pts[LM.R_SHOULDER], 0);
      this.head.rotation.z = THREE.MathUtils.lerp(this.head.rotation.z, -nx * 2.5, 0.3);
    } else if (tSec - this.lastPose > 0.6) {                    // nobody there: relax to a limp wing pose
      for (const a of Object.values(this.arms)) {
        a.shoulder.quaternion.slerp(this._q.identity(), 0.08);
        a.elbow.quaternion.slerp(this._q.identity(), 0.08);
      }
    }
    const bob = Math.sin(tSec * 3) * 0.03;                       // idle breathing so it never looks frozen
    this.root.position.y = bob;
    this.head.rotation.x = Math.sin(tSec * 1.7) * 0.04;
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
