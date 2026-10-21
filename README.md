# Real Time Control of Articulated Robot via Pose Estimation (RTC-AROPE)

Stand in front of a camera; your arm movements are replicated either on a goofy animated
chicken in the browser, on a physical servo arm driven by an Arduino, or both at once.

The original (2017-18) project did this with OpenPose + OpenCV + an Arduino and worked,
but with high latency. This version keeps that hardware path and adds a browser app.

## 1. Browser: the Mirror Chicken

```
npm run serve        # then open http://localhost:8000
```

Click **Start camera**, step back so the camera sees your whole body, and move. The chicken copies your
head, torso lean and twist, whole-body turns (up to about 70° either way), both arms, both legs, squats, and sideways position.
A single camera can't tell front from back, so past that angle the chicken holds its last good turn instead of flipping. Parts that are out of frame
(e.g. your legs at a desk) relax to rest instead of flailing. Both hands above your head makes it squawk. **Demo** runs
a synthetic person if you have no camera. Everything runs on-device; no video is uploaded.
(Three.js and MediaPipe load from the jsDelivr CDN and the pose model from Google's
MediaPipe bucket, so the first load needs internet.)

- Pose: MediaPipe PoseLandmarker (BlazePose) with 3D *world* landmarks, GPU delegate with CPU fallback.
- Smoothing: One Euro filter per landmark coordinate (adaptive: smooth when still, responsive when moving).
- Avatar: procedural Three.js chicken with a full skeleton (pelvis, torso, head, two-bone wings and legs), no model files. Its wings are the arms. To use a rigged
  glTF/VRM character instead, replace the model construction in `web/js/avatar.js` and keep `setArm()`/`update()`.

### Driving the robot from the browser
Flash the firmware (below), click **Connect Arduino** (Chrome/Edge only, uses Web Serial)
and pick which of your arms drives it. The chicken and the robot move together.

## 2. Hardware: Arduino arm

`firmware/Robotic_arm_control/` holds the sketch (open that folder in the Arduino IDE).
Wiring is unchanged: shoulder servo pin 9, elbow pin 11, claw pin 5.

**Reflash required:** the baud rate is now 115200 (was 9600) and the sketch is non-blocking.
The wire format is the same: `<claw 0|1><shoulder 3 digits><elbow 3 digits>\n`, e.g. `1110120\n`.

Python host (alternative to the browser):

```
pip install -r requirements.txt
python main.py --port /dev/ttyUSB0            # COM7 on Windows; omit --port for a dry run
python main.py --backend openpose --port ...  # the original Caffe model (see below)
python detect_marker.py                       # check the ArUco claw marker is seen
```

`--claw aruco` (default) keeps the original behaviour: marker visible = claw open.
In the browser the claw is a checkbox.

### Calibration: do this first on real hardware
The servo mapping lives in `rtc/robot.py` / `web/js/robot.js` (`Calibration` / `DEFAULT_CAL`).
The old gains (`1.6*a+50`, `0.7*b+120`) were tuned by trial and error on the original rig for a
different angle definition, so they can't be carried over exactly. The defaults map shoulder
elevation 0-180° to servo 40-180° and elbow bend 0-150° to servo 120-180°, and the per-shoulder
elbow clamp table from the original is kept. Check the elbow direction on your arm; if it is
inverted, swap `elbow_servo` to `[180, 120]`. For Python, override with `--calibration file.json`.

### OpenPose backend
`pose_deploy_linevec_faster_4_stages.prototxt` is in the repo; download
`pose_iter_160000.caffemodel` (OpenPose MPI model) next to it. This backend is 2D only and is
**untested** since the weights are not available here; MediaPipe is the recommended backend.
OpenPose is licensed by CMU for non-commercial/academic use only, so don't use this backend in a commercial product.

## What was fixed vs. the original
| Problem | Fix |
|---|---|
| Firmware slewed with `delay(5)` per degree (up to ~0.9 s) while packets queued up; `servo.write(target)` inside the loop meant the ramp smoothed nothing | Non-blocking: a new packet retargets, `millis()`-paced slewing at the same speed |
| Firmware echoed ~100 bytes per packet at 9600 baud | Echo removed (`DEBUG_ECHO`), 115200 baud |
| A packet for every video frame | Capped at 30 Hz, latest-wins, 1° dead-band |
| `arctan(dy/dx)` with `abs()`: loses quadrant, breaks on vertical bones, not a joint angle | Angle between bone vectors (`atan2(|a×b|, a·b)`) from 3D landmarks |
| 120×120 OpenPose input on CPU | MediaPipe BlazePose (real-time, GPU in browser) |
| No smoothing | One Euro filter |
| Out-of-range angles jumped to a fixed (40°, 180°) pose | Clamped to the servo range |
| `and`/`or` precedence bug when drawing the arm ROI; frame used before `hasFrame` check; ArUco dictionary rebuilt each frame; `Dictionary_get` removed in OpenCV 4.7+ | Rewritten; both ArUco APIs supported |
| Arduino assumed servos start at 0° and swept from there | Starts from a home pose |

## Tests
```
npm test      # JS (node:test) + Python (unittest), both against tests/vectors.json
```
The Python math modules need only the standard library. Also:
- `firmware/test_protocol.cpp`: desktop test for the firmware's packet parser (`g++ -std=c++11`).
- `web/tests/smoke.mjs`: headless-browser smoke test (see the file header).

## Layout
```
rtc/                 Python: kinematics, filters, protocol, robot mapping, sender, backends, app
main.py              Python entry point
web/                 Browser app (no build step)
firmware/            Arduino sketch + desktop-testable protocol.h
tests/               Python tests + shared vectors.json
```

## License
MIT, see `LICENSE`. Third-party components and their licenses are listed in `THIRD_PARTY_NOTICES.md`.
