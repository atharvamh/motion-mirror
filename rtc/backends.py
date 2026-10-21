"""Pose backends. Each returns an ArmPoints for the chosen arm, or None.

Heavy dependencies are imported inside the constructors so the rest of the package
stays importable (and testable) without them.
"""
import os
import urllib.request
from dataclasses import dataclass

MEDIAPIPE_MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
                       "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task")

# MediaPipe BlazePose landmark indices: (shoulder, elbow, wrist, hip) per side
_MP_ARM = {"right": (12, 14, 16, 24), "left": (11, 13, 15, 23)}
# OpenPose MPI-15 indices (the model the original project used)
_OP_ARM = {"right": (2, 3, 4, 8), "left": (5, 6, 7, 11)}


@dataclass
class ArmPoints:
    shoulder: tuple
    elbow: tuple
    wrist: tuple
    hip: tuple


class MediaPipeBackend:
    """BlazePose via MediaPipe Tasks. Uses *world* landmarks (metric 3D, hip-centred), which
    gives real joint angles instead of the 2D image-plane projection the original used."""

    def __init__(self, side="right", model_path="models/pose_landmarker_lite.task", min_visibility=0.5):
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision
        self._mp = mp
        self._idx = _MP_ARM[side]
        self._min_vis = min_visibility
        if not os.path.exists(model_path):
            os.makedirs(os.path.dirname(model_path) or ".", exist_ok=True)
            print("Downloading pose model to %s ..." % model_path)
            urllib.request.urlretrieve(MEDIAPIPE_MODEL_URL, model_path)
        options = vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=model_path),
            running_mode=vision.RunningMode.VIDEO, num_poses=1)
        self._landmarker = vision.PoseLandmarker.create_from_options(options)

    def detect(self, frame_bgr, timestamp_ms):
        import cv2
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(image, int(timestamp_ms))
        if not result.pose_world_landmarks:
            return None
        lms = result.pose_world_landmarks[0]
        if any((lms[i].visibility or 0) < self._min_vis for i in self._idx[:3]):
            return None
        pts = [(lms[i].x, lms[i].y, lms[i].z) for i in self._idx]
        return ArmPoints(*pts)

    def close(self):
        self._landmarker.close()


def heatmap_peaks(maps, threshold):
    """Argmax of each confidence map -> list of (x, y) in map coords, or None below threshold.

    `maps` is an iterable of 2D arrays (e.g. the OpenPose output[0, i]). Plain-Python so it
    can be tested without OpenCV; fine for the ~15 small maps the network emits.
    """
    peaks = []
    for m in maps:
        best, bx, by = float("-inf"), 0, 0
        for y, row in enumerate(m):
            for x, v in enumerate(row):
                if v > best:
                    best, bx, by = v, x, y
        peaks.append((bx, by) if best > threshold else None)
    return peaks


class OpenPoseBackend:
    """The original Caffe OpenPose (MPI, 15 keypoints) model, 2D only (z = 0).

    Needs pose_deploy_linevec_faster_4_stages.prototxt (in this repo) and
    pose_iter_160000.caffemodel (not in the repo; download from the OpenPose project).
    """

    def __init__(self, side="right", proto="pose_deploy_linevec_faster_4_stages.prototxt",
                 weights="pose_iter_160000.caffemodel", input_size=192, threshold=0.1):
        import cv2
        if not os.path.exists(weights):
            raise FileNotFoundError("%s not found; see README for where to download it" % weights)
        self._cv2 = cv2
        self._net = cv2.dnn.readNetFromCaffe(proto, weights)
        self._idx = _OP_ARM[side]
        self._size = input_size
        self._threshold = threshold

    def detect(self, frame_bgr, timestamp_ms=None):
        cv2 = self._cv2
        h, w = frame_bgr.shape[:2]
        blob = cv2.dnn.blobFromImage(frame_bgr, 1.0 / 255, (self._size, self._size), (0, 0, 0),
                                     swapRB=False, crop=False)
        self._net.setInput(blob)
        out = self._net.forward()
        needed = self._idx
        maps = [out[0, i] for i in needed]
        peaks = heatmap_peaks(maps, self._threshold)
        if any(p is None for p in peaks):
            return None
        mh, mw = out.shape[2], out.shape[3]
        pts = [(px * w / mw, py * h / mh, 0.0) for px, py in peaks]
        return ArmPoints(*pts)

    def close(self):
        pass
