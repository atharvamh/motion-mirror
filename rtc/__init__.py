"""Real-time control of an articulated robot arm from body-pose estimation.

The modules in this package that do the maths (kinematics, filters, robot, protocol)
use only the standard library so they can be unit-tested anywhere. Heavy
dependencies (OpenCV, MediaPipe, pyserial) are imported lazily by the runtime modules.
"""
