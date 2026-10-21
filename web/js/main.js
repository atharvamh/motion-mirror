import { Avatar } from './avatar.js';
import { createPose } from './pose.js';
import { RobotLink } from './serial.js';
import { demoLandmarks } from './demo.js';
import { OneEuroFilter, PointFilter } from './filter.js';
import { ARM, LM, armAngles, toScene } from './kinematics.js';
import { Sender } from './protocol.js';
import { toServo } from './robot.js';

const $ = (id) => document.getElementById(id);
const ui = { video: $('video'), overlay: $('overlay'), status: $('status'), bawk: $('bawk'), side: $('side'), claw: $('claw'), chips: $('chips') };
const avatar = new Avatar($('stage'));
const link = new RobotLink();
const sender = new Sender((wire) => link.write(wire), 30);

// Body parts and the landmarks each needs. A part is driven only while all of its landmarks are visible.
const PARTS = {
  RArm: [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST], LArm: [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST],
  RLeg: [LM.R_HIP, LM.R_KNEE, LM.R_ANKLE], LLeg: [LM.L_HIP, LM.L_KNEE, LM.L_ANKLE],
  torso: [LM.R_SHOULDER, LM.L_SHOULDER], hips: [LM.R_HIP, LM.L_HIP], head: [LM.NOSE, LM.R_EAR, LM.L_EAR],
};
const TRACKED = [...new Set(Object.values(PARTS).flat())];
const filters = Object.fromEntries(TRACKED.map((i) => [i, new PointFilter()]));
const rootFilter = new OneEuroFilter(1.0, 0.01);
const ENTER = 0.55, EXIT = 0.35;          // hysteresis: stops parts flickering on/off at the threshold
const wasOk = {};

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

let pose = null, stream = null, source = null /* 'camera' | 'demo' */, lastVideoTime = -1, latencyMs = 0, lastPts = null, lastMsg = '';
const say = (msg) => { if (msg !== lastMsg) { lastMsg = msg; ui.status.textContent = msg; } };
const setActive = (on) => { ui.chips.hidden = !on; $('preview').hidden = source !== 'camera'; $('v-lat').parentElement.hidden = source !== 'camera'; };

function track(lm, imgLm, tSec) {
  if (!lm) return null;
  const present = {};
  for (const i of TRACKED) {
    const vis = lm[i].visibility ?? 1;
    present[i] = vis >= (wasOk[i] ? EXIT : ENTER);
    wasOk[i] = present[i];
  }
  const pts = {};
  for (const i of TRACKED) {
    if (present[i]) pts[i] = filters[i].filter(toScene([lm[i].x, lm[i].y, lm[i].z]), tSec);
    else filters[i].reset();
  }
  const ok = {};
  for (const [part, idxs] of Object.entries(PARTS)) ok[part] = idxs.every((i) => present[i]);
  ok.hips = ok.torso && ok.hips;
  if (!ok.torso) ok.head = false;
  // sideways position from the 2D image (world landmarks are hip-centred and carry no position)
  let rootX = 0;
  if (imgLm && (ok.torso || ok.hips)) {
    const ids = ok.hips ? [LM.R_HIP, LM.L_HIP] : [LM.R_SHOULDER, LM.L_SHOULDER];
    const cx = (imgLm[ids[0]].x + imgLm[ids[1]].x) / 2;
    rootX = rootFilter.filter(Math.max(-3.5, Math.min(3.5, (0.5 - cx) * 9)), tSec);
  }
  if (!Object.values(ok).some(Boolean)) return null;
  return { pts, ok, rootX };
}

function updateChips(ok) {
  const on = { head: ok.head, arms: ok.RArm || ok.LArm, legs: ok.RLeg || ok.LLeg };
  for (const li of ui.chips.querySelectorAll('[data-part]')) li.dataset.on = String(!!on[li.dataset.part]);
}

function drive(p, tSec) {
  // Reflection preserves angles, so the mirrored scene-space points give the same joint angles.
  const side = ui.side.value, a = ARM[side];
  if (!p.ok[side === 'right' ? 'RArm' : 'LArm']) return;
  const [elev, flex] = armAngles(p.pts[a.shoulder], p.pts[a.elbow], p.pts[a.wrist], p.pts[a.hip] ?? hipFallback(p, a));
  if (elev === null || flex === null) return;
  const [s, e] = toServo(elev, flex);
  $('v-elev').textContent = `${elev.toFixed(0)}°`;
  $('v-flex').textContent = `${flex.toFixed(0)}°`;
  $('v-servo').textContent = `${s}° / ${e}°`;
  const wire = link.connected ? sender.send(ui.claw.checked, s, e, tSec) : null;
  if (wire) $('v-wire').textContent = wire.trim();
}

// Hips are often out of frame when seated; assume the torso hangs straight below the shoulder.
const hipFallback = (p, a) => [p.pts[a.shoulder][0], p.pts[a.shoulder][1] - 0.5, p.pts[a.shoulder][2]];

function drawOverlay(lm) {
  const c = ui.overlay, ctx = c.getContext('2d');
  c.width = ui.video.videoWidth || 640; c.height = ui.video.videoHeight || 480;
  ctx.clearRect(0, 0, c.width, c.height);
  if (!lm) return;
  const seen = (i) => (lm[i].visibility ?? 1) >= ENTER;
  ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.fillStyle = '#ff4d3d';
  for (const [a, b] of BONES) {
    if (!seen(a) || !seen(b)) continue;
    ctx.beginPath(); ctx.moveTo(lm[a].x * c.width, lm[a].y * c.height); ctx.lineTo(lm[b].x * c.width, lm[b].y * c.height); ctx.stroke();
  }
  for (const i of [LM.NOSE, ...TRACKED]) {
    if (!seen(i)) continue;
    ctx.beginPath(); ctx.arc(lm[i].x * c.width, lm[i].y * c.height, 5, 0, 7); ctx.fill();
  }
}

let prev = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const tSec = now / 1000, dt = (now - prev) / 1000;
  prev = now;
  let p = lastPts;
  if (source === 'demo') {
    p = track(demoLandmarks(tSec), null, tSec);
  } else if (source === 'camera' && pose && ui.video.readyState >= 2 && ui.video.currentTime !== lastVideoTime) {
    lastVideoTime = ui.video.currentTime;
    const t0 = performance.now();
    const res = pose.detectForVideo(ui.video, now);
    latencyMs = latencyMs * 0.9 + (performance.now() - t0) * 0.1;
    $('v-lat').textContent = `${latencyMs.toFixed(0)} ms`;
    p = track(res.worldLandmarks[0], res.landmarks[0], tSec);
    drawOverlay(res.landmarks[0]);
  }
  lastPts = p;
  if (p) {
    updateChips(p.ok);
    drive(p, tSec);
    if (source === 'camera') {
      const arms = p.ok.RArm || p.ok.LArm, legs = p.ok.RLeg || p.ok.LLeg;
      say(!arms ? 'Step back so your arms are in view.' : !legs ? 'Upper body only. Step back to bring your legs in, too.' : 'Full body tracked. Go wild.');
    }
    // both wrists above the nose = chicken has opinions
    ui.bawk.hidden = !(p.pts[LM.L_WRIST] && p.pts[LM.R_WRIST] && p.pts[LM.NOSE]
      && p.pts[LM.L_WRIST][1] > p.pts[LM.NOSE][1] && p.pts[LM.R_WRIST][1] > p.pts[LM.NOSE][1]);
  } else if (source) {
    updateChips({});
    ui.bawk.hidden = true;
    if (source === 'camera') say('No one in view. Step back so the camera can see you.');
  }
  avatar.update(p, tSec, dt);
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null; source = null; lastPts = null;
  ui.video.srcObject = null;
  $('start').textContent = 'Start camera';
  setActive(false);
  say("Press Start and step back so you're in frame.");
}

$('start').addEventListener('click', async () => {
  if (source === 'camera') return stopCamera();
  $('start').disabled = true;
  try {
    say('Loading pose model…');
    pose ??= await createPose();
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 60 } }, audio: false });
    ui.video.srcObject = stream;
    await ui.video.play();
    source = 'camera';
    $('start').textContent = 'Stop camera';
    setActive(true);
    say('Camera on. Step back so the camera sees your whole body.');
  } catch (err) {
    say(`Couldn't start: ${err.message}`);
  } finally {
    $('start').disabled = false;
  }
});

$('demo').addEventListener('click', () => {
  if (source === 'camera') stopCamera();
  source = 'demo'; setActive(true); say('Demo mode: a synthetic person squats, waves and sways.');
});

$('robot-toggle').addEventListener('click', () => {
  const open = $('robot').hidden;
  $('robot').hidden = !open;
  $('robot-toggle').setAttribute('aria-expanded', String(open));
});

$('connect').addEventListener('click', async () => {
  if (!RobotLink.supported) return say('Web Serial needs Chrome or Edge.');
  try {
    if (link.connected) { await link.disconnect(); $('connect').textContent = 'Connect Arduino'; return; }
    await link.connect();
    $('connect').textContent = 'Disconnect Arduino';
    say('Robot connected. It follows the arm selected in the panel.');
  } catch (err) { say(`Serial: ${err.message}`); }
});

setActive(false);
if (new URLSearchParams(location.search).has('demo')) { source = 'demo'; setActive(true); say('Demo mode: a synthetic person squats, waves and sways.'); }
requestAnimationFrame(frame);
