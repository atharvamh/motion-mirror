// Robotic arm firmware: receives "<claw><shoulder:3><elbow:3>\n" over serial and drives
// three servos. Wire format is unchanged from the original; only the baud rate differs
// (115200 now, was 9600), so reflash and use the same rate on the host.
//
// What changed for latency:
//  * No blocking delay() loops. The original slewed with delay(5) per degree (up to ~0.9 s
//    per packet) while packets piled up in the serial buffer. Now loop() never blocks, a
//    new packet just retargets the arm, and the newest target always wins.
//  * No per-packet debug echo (about 100 bytes at 9600 baud = ~100 ms of blocked TX each).
//    Set DEBUG_ECHO to 1 to bring it back.
//  * Start from a known home pose instead of assuming 0 degrees.
#include <Servo.h>
#include "protocol.h"

#define DEBUG_ECHO 0

const long BAUD = 115200;
const byte SHOULDER_PIN = 9;
const byte ELBOW_PIN = 11;
const byte CLAW_PIN = 5;
const byte LED_PIN = 13;

const int HOME_SHOULDER = 40;
const int HOME_ELBOW = 120;
const int CLAW_OPEN = 180;
const int CLAW_CLOSED = 0;

const unsigned long STEP_INTERVAL_MS = 5;   // same speed as before: 1 degree / 5 ms ...
const int MAX_STEP_DEG = 1;                 // ... raise this for a faster arm

const byte NUM_CHARS = 16;
char receivedChars[NUM_CHARS];

Servo shoulderServo;
Servo elbowServo;
Servo clawServo;

int currentShoulder = HOME_SHOULDER;
int currentElbow = HOME_ELBOW;
int targetShoulder = HOME_SHOULDER;
int targetElbow = HOME_ELBOW;
unsigned long lastStepMs = 0;

void setup() {
    Serial.begin(BAUD);
    shoulderServo.attach(SHOULDER_PIN);
    elbowServo.attach(ELBOW_PIN);
    clawServo.attach(CLAW_PIN);
    pinMode(LED_PIN, OUTPUT);
    shoulderServo.write(currentShoulder);
    elbowServo.write(currentElbow);
    clawServo.write(CLAW_CLOSED);
    Serial.println("<Arduino is ready>");
}

void loop() {
    receivePackets();
    slewServos();
}

void receivePackets() {
    static byte ndx = 0;
    static bool overflow = false;
    while (Serial.available() > 0) {
        char rc = Serial.read();
        if (rc == '\r') continue;
        if (rc != '\n') {
            if (ndx < NUM_CHARS - 1) receivedChars[ndx++] = rc;
            else overflow = true;
            continue;
        }
        receivedChars[ndx] = '\0';
        ndx = 0;
        if (overflow) { overflow = false; continue; }
        Packet p;
        if (parsePacket(receivedChars, &p)) {
            targetShoulder = p.shoulder;
            targetElbow = p.elbow;
            clawServo.write(p.claw ? CLAW_OPEN : CLAW_CLOSED);
            digitalWrite(LED_PIN, !digitalRead(LED_PIN));   // heartbeat per valid packet
#if DEBUG_ECHO
            Serial.print(p.claw); Serial.print(' ');
            Serial.print(p.shoulder); Serial.print(' ');
            Serial.println(p.elbow);
#endif
        }
    }
}

void slewServos() {
    unsigned long now = millis();
    if (now - lastStepMs < STEP_INTERVAL_MS) return;
    lastStepMs = now;
    if (currentShoulder != targetShoulder) {
        currentShoulder = stepToward(currentShoulder, targetShoulder, MAX_STEP_DEG);
        shoulderServo.write(currentShoulder);
    }
    if (currentElbow != targetElbow) {
        currentElbow = stepToward(currentElbow, targetElbow, MAX_STEP_DEG);
        elbowServo.write(currentElbow);
    }
}
