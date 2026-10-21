// Wire format shared with the firmware: "<claw:1><shoulder:3><elbow:3>\n". Mirrors rtc/protocol.py + rtc/sender.py.
export const BAUD = 115200;
const clamp = (v) => Math.max(0, Math.min(180, Math.trunc(v)));

export const encode = (claw, shoulder, elbow) =>
  `${claw ? 1 : 0}${String(clamp(shoulder)).padStart(3, '0')}${String(clamp(elbow)).padStart(3, '0')}\n`;

export function decode(line) {
  const s = line.trim();
  if (!/^[01]\d{6}$/.test(s)) return null;
  const shoulder = +s.slice(1, 4), elbow = +s.slice(4, 7);
  return shoulder > 180 || elbow > 180 ? null : { claw: s[0] === '1', shoulder, elbow };
}

/** Rate-limited, latest-wins sender: dropped packets are never queued, so the arm can't lag behind. */
export class Sender {
  constructor(write, maxHz = 30, deadband = 1) {
    Object.assign(this, { write, minInterval: 1 / maxHz, deadband, lastT: null, last: null });
  }
  /** now in seconds. Returns the wire string if sent, else null. */
  send(claw, shoulder, elbow, now) {
    if (this.lastT !== null && now - this.lastT < this.minInterval) return null;
    if (this.last) {
      const [lc, ls, le] = this.last;
      if (lc === claw && Math.abs(ls - shoulder) <= this.deadband && Math.abs(le - elbow) <= this.deadband) return null;
    }
    const wire = encode(claw, shoulder, elbow);
    this.write(wire);
    this.lastT = now;
    this.last = [claw, shoulder, elbow];
    return wire;
  }
}
