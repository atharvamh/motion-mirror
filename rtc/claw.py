"""Claw control from an ArUco marker, as in the original: marker visible = claw open."""
import cv2


class ArucoClaw:
    def __init__(self, dictionary="DICT_5X5_250"):
        aruco = cv2.aruco
        dict_id = getattr(aruco, dictionary)
        if hasattr(aruco, "ArucoDetector"):                      # OpenCV >= 4.7
            self._detector = aruco.ArucoDetector(aruco.getPredefinedDictionary(dict_id),
                                                 aruco.DetectorParameters())
            self._detect = lambda gray: self._detector.detectMarkers(gray)
        else:                                                    # legacy API (<= 4.6)
            d, p = aruco.Dictionary_get(dict_id), aruco.DetectorParameters_create()
            self._detect = lambda gray: aruco.detectMarkers(gray, d, parameters=p)
        self._aruco = aruco

    def is_open(self, frame_bgr):
        corners, ids, _ = self._detect(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY))
        return len(corners) > 0, corners, ids

    def draw(self, frame_bgr, corners, ids):
        self._aruco.drawDetectedMarkers(frame_bgr, corners, ids)
