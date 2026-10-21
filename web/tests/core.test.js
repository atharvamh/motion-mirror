import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { armAngles, angleBetween, toScene } from '../js/kinematics.js';
import { OneEuroFilter } from '../js/filter.js';
import { encode, decode, Sender } from '../js/protocol.js';
import { toServo } from '../js/robot.js';

const V = JSON.parse(readFileSync(new URL('../../tests/vectors.json', import.meta.url)));
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('kinematics: shared vectors', () => {
  for (const v of V.kinematics) {
    const [elev, flex] = armAngles(v.shoulder, v.elbow, v.wrist, v.hip);
    near(elev, v.elevation);
    if (v.flexion === null) assert.equal(flex, null, v.name); else near(flex, v.flexion);
  }
});

test('kinematics: parallel vectors are accurate to 1e-10 degrees', () => {
  near(angleBetween([0.1, 0.2, 0.3], [0.3, 0.6, 0.9]), 0, 1e-10);
});

test('toScene mirrors x and flips y/z', () => {
  assert.deepEqual(toScene([1, 2, 3]), [-1, -2, -3]);
});

test('robot: shared vectors', () => {
  for (const v of V.robot) assert.deepEqual(toServo(v.elevation, v.flexion), [v.shoulder, v.elbow], JSON.stringify(v));
});

test('robot: output always within servo range', () => {
  for (let e = -30; e <= 230; e += 10) for (let f = -30; f < 200; f += 10) {
    const [s, el] = toServo(e, f);
    assert.ok(s >= 40 && s <= 180 && el >= 120 && el <= 180, `${e},${f} -> ${s},${el}`);
  }
});

test('protocol: shared vectors and round trip', () => {
  for (const v of V.protocol) assert.equal(encode(v.claw, v.shoulder, v.elbow), v.wire);
  assert.deepEqual(decode(encode(true, 12, 170)), { claw: true, shoulder: 12, elbow: 170 });
});

test('protocol: decode rejects malformed', () => {
  for (const bad of ['', '111012', '11101200', '2110120\n', '1ab0120\n', '1181120\n', '-110120\n']) assert.equal(decode(bad), null, bad);
});

test('sender: rate limit, latest wins, deadband', () => {
  const out = [];
  const s = new Sender((w) => out.push(w), 10, 1);
  assert.ok(s.send(false, 50, 130, 0));
  assert.equal(s.send(false, 90, 150, 0.05), null);
  assert.ok(s.send(false, 90, 150, 0.11));
  assert.equal(s.send(false, 91, 149, 1), null);
  assert.ok(s.send(true, 91, 149, 2));
  assert.deepEqual(out, ['0050130\n', '0090150\n', '1091149\n']);
});

test('one euro: passthrough, constant, jitter, lag', () => {
  assert.equal(new OneEuroFilter().filter(42, 0), 42);
  let f = new OneEuroFilter();
  for (let i = 0; i < 50; i++) near(f.filter(10, i / 30), 10);
  f = new OneEuroFilter();
  const out = Array.from({ length: 120 }, (_, i) => f.filter(10 + (i % 2 ? 1 : -1), i / 30)).slice(60);
  assert.ok(Math.max(...out) - Math.min(...out) < 1);
  const ad = new OneEuroFilter(1, 0.1), fx = new OneEuroFilter(1, 0);
  let a, b, t;
  for (let i = 0; i < 30; i++) { t = i / 30; a = ad.filter(180 * t, t); b = fx.filter(180 * t, t); }
  assert.ok(Math.abs(180 * t - a) < Math.abs(180 * t - b));
  const g = new OneEuroFilter(); g.filter(1, 1);
  assert.equal(g.filter(5, 1), 1);
});
