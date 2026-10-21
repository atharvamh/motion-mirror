// Packet parsing and servo slewing, kept free of Arduino APIs so it can be compiled and
// tested on a desktop (see firmware/test_protocol.cpp).
#pragma once

struct Packet {
    bool claw;      // true = open
    int shoulder;   // servo degrees 0..180
    int elbow;      // servo degrees 0..180
};

// Parses exactly "<claw:1><shoulder:3><elbow:3>" (7 digits, no newline). Returns false for
// anything else, so line noise or a half-received packet can never move the arm.
inline bool parsePacket(const char *s, Packet *out) {
    for (int i = 0; i < 7; i++) {
        if (s[i] < '0' || s[i] > '9') return false;
    }
    if (s[7] != '\0') return false;
    if (s[0] > '1') return false;
    int shoulder = (s[1] - '0') * 100 + (s[2] - '0') * 10 + (s[3] - '0');
    int elbow = (s[4] - '0') * 100 + (s[5] - '0') * 10 + (s[6] - '0');
    if (shoulder > 180 || elbow > 180) return false;
    out->claw = (s[0] == '1');
    out->shoulder = shoulder;
    out->elbow = elbow;
    return true;
}

// Moves `current` toward `target` by at most `maxStep` degrees, never overshooting.
inline int stepToward(int current, int target, int maxStep) {
    if (target > current) return (target - current > maxStep) ? current + maxStep : target;
    return (current - target > maxStep) ? current - maxStep : target;
}
