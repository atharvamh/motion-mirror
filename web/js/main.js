import { Avatar } from './avatar.js';
import { createPose } from './pose.js';
import { RobotLink } from './serial.js';
import { demoLandmarks } from './demo.js';
import { PointFilter } from './filter.js';
import { ARM, LM, armAngles, toScene } from './kinematics.js';
import { Sender } from './protocol.js';
import { toServo } from './robot.js';

const $ = (id) => document.getElementById(id);
const ui = { video: $('video'), overlay: $('overlay'), status: $('status'), bawk: $('bawk'), side: $('side'), claw: $('claw') };
const avatar = new Avatar($('stage'));
const link = new RobotLink();
const sender = new Sender((wire) => link.write(wire), 30);

const TRACKED = [LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST, LM.L_HIP, LM.R_HIP];
const filters = Object.fromEntries(TRACKED.map((i) => [i, new PointFilter()]));
const MIN_VISIBILITY = 0.5;

let pose = null, source = null /* 'camera' | 'demo' */, lastVideoTime = -1, latencyMs = 0, lastPts = null;
const showPreview = (on) => { $('preview').hidden = !on; };
const say = (msg) => { ui.status.textContent = msg; };

function track(landmarks, tSec) {
  const arms = Object.values(ARM).flatMap((a) => [a.shoulder, a.elbow, a.wrist]);
  if (!landmarks || arms.some((i) => (landmarks[i].visibility ?? 1) < MIN_VISIBILITY)) return null;
  const pts = {};
  for (const i of TRACKED) pts[i] = filters[i].filter(toScene([landmarks[i].x, landmarks[i].y, landmarks[i].z]), tSec);
  return pts;
}

function drive(pts, tSec) {
  // Reflection preserves angles, so the mirrored scene-space points give the same joint angles.
  const a = ARM[ui.side.value];
  const [elev, flex] = armAngles(pts[a.shoulder], pts[a.elbow], pts[a.wrist], pts[a.hip]);
  if (elev === null || flex === null) return;
  const [s, e] = toServo(elev, flex);
  $('v-elev').textContent = `${elev.toFixed(0)}°`;
  $('v-flex').textContent = `${flex.toFixed(0)}°`;
  $('v-servo').textContent = `${s}° / ${e}°`;
  const wire = link.connected ? sender.send(ui.claw.checked, s, e, tSec) : null;
  if (wire) $('v-wire').textContent = wire.trim();
}

function drawOverlay(landmarks) {
  const c = ui.overlay, ctx = c.getContext('2d');
  c.width = ui.video.videoWidth || 640; c.height = ui.video.videoHeight || 480;
  ctx.clearRect(0, 0, c.width, c.height);
  if (!landmarks) return;
  ctx.lineWidth = 4; ctx.strokeStyle = '#ffd23f'; ctx.fillStyle = '#e5322d';
  for (const a of Object.values(ARM)) {
    const p = [a.shoulder, a.elbow, a.wrist].map((i) => landmarks[i]);
    ctx.beginPath();
    p.forEach((q, k) => (k ? ctx.lineTo(q.x * c.width, q.y * c.height) : ctx.moveTo(q.x * c.width, q.y * c.height)));
    ctx.stroke();
    p.forEach((q) => { ctx.beginPath(); ctx.arc(q.x * c.width, q.y * c.height, 5, 0, 7); ctx.fill(); });
  }
}

let prev = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const tSec = now / 1000, dt = (now - prev) / 1000;
  prev = now;
  let pts = lastPts;
  if (source === 'demo') {
    pts = track(demoLandmarks(tSec), tSec);
  } else if (source === 'camera' && pose && ui.video.readyState >= 2 && ui.video.currentTime !== lastVideoTime) {
    lastVideoTime = ui.video.currentTime;
    const t0 = performance.now();
    const res = pose.detectForVideo(ui.video, now);
    latencyMs = latencyMs * 0.9 + (performance.now() - t0) * 0.1;
    $('v-lat').textContent = `${latencyMs.toFixed(0)} ms`;
    pts = track(res.worldLandmarks[0], tSec);
    drawOverlay(res.landmarks[0]);
  }
  lastPts = pts;
  if (pts) {
    drive(pts, tSec);
    // both wrists above the nose = chicken has opinions
    ui.bawk.hidden = !(pts[LM.L_WRIST][1] > pts[LM.NOSE][1] && pts[LM.R_WRIST][1] > pts[LM.NOSE][1]);
  } else if (source) {
    say(source === 'camera' ? 'Step back so both arms are in view.' : '');
  }
  avatar.update(pts, tSec, dt);
}

$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  try {
    say('Loading pose model…');
    pose ??= await createPose();
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 60 } }, audio: false });
    ui.video.srcObject = stream;
    await ui.video.play();
    source = 'camera';
    showPreview(true);
    say('Flap away. Both hands above your head makes it squawk.');
  } catch (err) {
    say(`Couldn't start: ${err.message}`);
    $('start').disabled = false;
  }
});

$('demo').addEventListener('click', () => { source = 'demo'; showPreview(false); say('Demo mode: synthetic waving person.'); });

$('connect').addEventListener('click', async () => {
  if (!RobotLink.supported) return say('Web Serial needs Chrome or Edge.');
  try {
    if (link.connected) { await link.disconnect(); $('connect').textContent = 'Connect Arduino'; return; }
    await link.connect();
    $('connect').textContent = 'Disconnect Arduino';
    say('Robot connected. It follows the arm selected on the right.');
  } catch (err) { say(`Serial: ${err.message}`); }
});

showPreview(false);
if (new URLSearchParams(location.search).has('demo')) source = 'demo';
requestAnimationFrame(frame);
