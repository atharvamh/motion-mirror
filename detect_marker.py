"""Standalone ArUco marker viewer, for checking that the claw trigger marker is seen."""
import cv2

from rtc.claw import ArucoClaw


def main(camera=0):
    claw = ArucoClaw()
    cap = cv2.VideoCapture(camera)
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        found, corners, ids = claw.is_open(frame)
        claw.draw(frame, corners, ids)
        cv2.imshow("Aruco_image (q to quit)", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
