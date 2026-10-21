"""Webcam -> pose -> angles -> filter -> servo packets. Run via `python main.py`."""
import argparse
import time

from . import kinematics, protocol
from .filters import OneEuroFilter
from .robot import Calibration, to_servo
from .sender import Sender


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--camera", type=int, default=0)
    p.add_argument("--backend", choices=["mediapipe", "openpose"], default="mediapipe")
    p.add_argument("--side", choices=["right", "left"], default="right", help="which arm drives the robot")
    p.add_argument("--port", help="serial port, e.g. COM7 or /dev/ttyUSB0 (omit for a dry run)")
    p.add_argument("--baud", type=int, default=protocol.BAUD)
    p.add_argument("--claw", choices=["aruco", "none"], default="aruco")
    p.add_argument("--calibration", help="JSON file overriding robot.Calibration fields")
    p.add_argument("--max-hz", type=float, default=30.0, help="max packets per second")
    p.add_argument("--no-window", action="store_true")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    import cv2
    from .backends import MediaPipeBackend, OpenPoseBackend

    backend = (MediaPipeBackend if args.backend == "mediapipe" else OpenPoseBackend)(side=args.side)
    claw = None
    if args.claw == "aruco":
        from .claw import ArucoClaw
        claw = ArucoClaw()
    port = None
    if args.port:
        import serial
        port = serial.Serial(args.port, args.baud, timeout=0, write_timeout=0.05)
        time.sleep(2)                       # Arduino resets when the port opens
    cal = Calibration.from_json(args.calibration) if args.calibration else Calibration()
    sender = Sender(port, max_hz=args.max_hz)
    f_shoulder, f_elbow = OneEuroFilter(), OneEuroFilter()

    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)     # always process the newest frame, never a stale queue
    t0 = time.monotonic()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            now = time.monotonic() - t0
            arm = backend.detect(frame, now * 1000)
            claw_open, corners, ids = claw.is_open(frame) if claw else (False, (), None)
            if arm is not None:
                elev, flex = kinematics.arm_angles(arm.shoulder, arm.elbow, arm.wrist, arm.hip)
                if elev is not None and flex is not None:
                    s, e = to_servo(f_shoulder(elev, now), f_elbow(flex, now), cal)
                    wire = sender.send(claw_open, s, e, now)
                    if wire:
                        print(wire.strip(), flush=True)
            if not args.no_window:
                if claw:
                    claw.draw(frame, corners, ids)
                cv2.imshow("RTC-AROPE (q to quit)", cv2.flip(frame, 1))
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
    finally:
        cap.release()
        backend.close()
        if port:
            port.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
