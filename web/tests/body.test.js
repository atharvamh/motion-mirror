import test from 'node:test';
import assert from 'node:assert/strict';
import { legCompression, visible, bodyYaw, LM, LEG, ARM } from '../js/kinematics.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('legCompression: straight standing leg is 0', () => {
  near(legCompression([0, 0, 0], [0, -0.45, 0], [0, -0.9, 0]), 0);
});

test('legCompression: squat (knee forward, ankle under hip) compresses', () => {
  const th = 60 * Math.PI / 180;               // thigh 60 degrees forward, shin 60 back
  const knee = [0, -0.45 * Math.cos(th), 0.45 * Math.sin(th)];
  const ankle = [0, knee[1] - 0.45 * Math.cos(th), 0];
  near(legCompression([0, 0, 0], knee, ankle), 1 - Math.cos(th), 1e-9);
});

test('legCompression: capped at 0.85, and zero-length leg is safe', () => {
  assert.equal(legCompression([0, 0, 0], [0, -0.45, 0], [0, 0, 0]), 0.85);   // folded fully
  assert.equal(legCompression([0, 0, 0], [0, 0, 0], [0, 0, 0]), 0);
});

test('visible: threshold and missing visibility', () => {
  const lm = { 1: { visibility: 0.9 }, 2: { visibility: 0.3 }, 3: {} };
  assert.equal(visible(lm, [1, 3]), true);       // missing visibility counts as visible
  assert.equal(visible(lm, [1, 2]), false);
  assert.equal(visible(lm, [1, 2], 0.2), true);
});

test('landmark tables use the BlazePose indices', () => {
  assert.equal(LM.R_ANKLE, 28);
  assert.deepEqual(LEG.left, { hip: 23, knee: 25, ankle: 27 });
  assert.equal(ARM.right.wrist, 16);
});

test('bodyYaw: facing the camera is 0', () => {
  near(bodyYaw([0.1, 0, 0], [-0.1, 0, 0]), 0);
});

test('bodyYaw: recovers the rotation that maps (1,0,0) onto the hip line', () => {
  for (const deg of [-60, -30, 15, 45, 65]) {
    const a = deg * Math.PI / 180, w = 0.2;
    const right = [w * Math.cos(a) / 2, 0, -w * Math.sin(a) / 2];
    near(bodyYaw(right, right.map((v) => -v)), a, 1e-9);
  }
});

test('bodyYaw: past the limit, sideways, degenerate, or facing away -> null (caller holds last value)', () => {
  const at = (deg) => { const a = deg * Math.PI / 180; return [[0.1 * Math.cos(a), 0, -0.1 * Math.sin(a)], [-0.1 * Math.cos(a), 0, 0.1 * Math.sin(a)]]; };
  assert.equal(bodyYaw(...at(80)), null);
  assert.equal(bodyYaw(...at(-100)), null);
  assert.equal(bodyYaw(...at(180)), null);                       // facing away: sides swapped
  assert.equal(bodyYaw([0, 0, -0.1], [0, 0, 0.1]), null);          // 90 degrees: sideways
  assert.equal(bodyYaw([0.002, 0, 0], [-0.002, 0, 0]), null);      // landmarks collapsed together: noise
  assert.equal(bodyYaw([0, 0, 0], [0, 0, 0]), null);
});
