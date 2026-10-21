// Web Serial link to the Arduino (Chrome/Edge, secure context or localhost).
import { BAUD } from './protocol.js';

export class RobotLink {
  constructor() { this.port = null; this.writer = null; this.busy = false; this.encoder = new TextEncoder(); }
  static get supported() { return 'serial' in navigator; }
  get connected() { return !!this.writer; }

  async connect() {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: BAUD });
    this.writer = this.port.writable.getWriter();
    await new Promise((r) => setTimeout(r, 2000));   // the Arduino resets when the port opens
  }

  /** Fire-and-forget; if the previous write is still in flight the new one is dropped (newest pose wins next tick). */
  write(wire) {
    if (!this.writer || this.busy) return;
    this.busy = true;
    this.writer.write(this.encoder.encode(wire)).catch(() => {}).finally(() => { this.busy = false; });
  }

  async disconnect() {
    try { this.writer?.releaseLock(); await this.port?.close(); } catch { /* already gone */ }
    this.writer = this.port = null;
  }
}
