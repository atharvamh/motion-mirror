# Third-party notices

This project's own code is MIT licensed (see `LICENSE`). It uses the following third-party
software and models, each under its own license. Licenses listed are to the best of the
author's knowledge; check each project for the authoritative terms.

| Component | Use | License |
|---|---|---|
| [MediaPipe Tasks](https://github.com/google-ai-edge/mediapipe) (`@mediapipe/tasks-vision`, `mediapipe`) and the BlazePose pose-landmarker model | Pose estimation. Loaded at runtime from jsDelivr / Google's model bucket; not redistributed here. | Apache-2.0 |
| [Three.js](https://threejs.org) | Avatar rendering. Loaded at runtime from jsDelivr. | MIT |
| [OpenCV](https://opencv.org) (`opencv-contrib-python`) | Python camera capture and ArUco marker detection | Apache-2.0 |
| [pyserial](https://github.com/pyserial/pyserial) | Python serial link to the Arduino | BSD-3-Clause |
| Arduino core and `Servo` library | Firmware | LGPL-2.1 |
| [OpenPose](https://github.com/CMU-Perceptual-Computing-Lab/openpose) network definition (`pose_deploy_linevec_faster_4_stages.prototxt`) and the separately downloaded `pose_iter_160000.caffemodel` weights | Optional legacy `--backend openpose` only | CMU OpenPose license: academic / non-commercial use; commercial use needs a license from CMU |

The OpenPose files are only for non-commercial use. The default MediaPipe path does not use them.
