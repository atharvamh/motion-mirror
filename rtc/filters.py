"""One Euro filter (Casiez, Roussel, Vogel; CHI 2012).

An adaptive low-pass filter: heavy smoothing when the signal is slow (kills landmark
jitter) and light smoothing when it moves fast (keeps lag low). That trade-off is why
it replaces a fixed moving average for latency-sensitive pose tracking.
"""
import math


def _alpha(cutoff, dt):
    tau = 1.0 / (2.0 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


class OneEuroFilter:
    def __init__(self, min_cutoff=1.5, beta=0.05, d_cutoff=1.0):
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._t = None
        self._x = 0.0
        self._dx = 0.0

    def reset(self):
        self._t = None

    def __call__(self, x, t):
        """Filter sample x taken at time t (seconds)."""
        if self._t is None:
            self._t, self._x, self._dx = t, x, 0.0
            return x
        dt = t - self._t
        if dt <= 0:
            return self._x
        a_d = _alpha(self.d_cutoff, dt)
        self._dx = a_d * ((x - self._x) / dt) + (1 - a_d) * self._dx
        a = _alpha(self.min_cutoff + self.beta * abs(self._dx), dt)
        self._x = a * x + (1 - a) * self._x
        self._t = t
        return self._x
