"""Rate-limited, latest-wins packet sender.

The original sent a packet for every video frame, so the Arduino's input buffer filled
faster than it could be drained and the arm trailed the user by seconds. Only the newest
pose matters, so packets are capped at `max_hz` and skipped when nothing changed.
"""
from . import protocol


class Sender:
    def __init__(self, port, max_hz=30.0, deadband=1):
        self.port = port            # anything with .write(bytes); None = dry run
        self.min_interval = 1.0 / max_hz
        self.deadband = deadband    # degrees; suppresses servo chatter from residual jitter
        self._last_t = None
        self._last = None

    def send(self, claw, shoulder, elbow, now):
        """Returns the wire string if a packet was sent, else None."""
        if self._last_t is not None and now - self._last_t < self.min_interval:
            return None
        if self._last is not None:
            lc, ls, le = self._last
            if lc == claw and abs(ls - shoulder) <= self.deadband and abs(le - elbow) <= self.deadband:
                return None
        wire = protocol.encode(claw, shoulder, elbow)
        if self.port is not None:
            self.port.write(wire.encode("ascii"))
        self._last_t, self._last = now, (claw, shoulder, elbow)
        return wire
