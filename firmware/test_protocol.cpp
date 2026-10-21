// Desktop test for protocol.h:  g++ -std=c++11 -o /tmp/t test_protocol.cpp && /tmp/t
#include <cstdio>
#include <cstring>
#include "Robotic_arm_control/protocol.h"

static int failures = 0;
#define CHECK(c) do { if (!(c)) { printf("FAIL line %d: %s\n", __LINE__, #c); failures++; } } while (0)

int main() {
    Packet p;
    CHECK(parsePacket("1110120", &p) && p.claw && p.shoulder == 110 && p.elbow == 120);
    CHECK(parsePacket("0040180", &p) && !p.claw && p.shoulder == 40 && p.elbow == 180);
    CHECK(parsePacket("0000000", &p) && p.shoulder == 0 && p.elbow == 0);
    CHECK(!parsePacket("", &p));
    CHECK(!parsePacket("111012", &p));      // too short
    CHECK(!parsePacket("11101200", &p));    // too long
    CHECK(!parsePacket("2110120", &p));     // bad claw flag
    CHECK(!parsePacket("1181120", &p));     // shoulder > 180
    CHECK(!parsePacket("111012x", &p));     // non-digit
    CHECK(!parsePacket("-110120", &p));

    CHECK(stepToward(10, 100, 1) == 11);
    CHECK(stepToward(100, 10, 1) == 99);
    CHECK(stepToward(10, 11, 5) == 11);     // no overshoot
    CHECK(stepToward(11, 10, 5) == 10);
    CHECK(stepToward(50, 50, 3) == 50);

    printf(failures ? "%d FAILED\n" : "all passed\n", failures);
    return failures != 0;
}
