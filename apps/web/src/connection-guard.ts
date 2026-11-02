import type { DeviceChange } from './device-client.ts';

export class ConnectionGuard {
  private latest = -1;
  private shown: number | null = null;
  private available = true;
  private session: string | null = null;
  private revision = 0;

  begin() { this.shown = null; }

  changed(event: DeviceChange): boolean {
    if (!event.available) {
      this.available = false;
      this.shown = null;
      return true;
    }
    if (event.generation <= this.latest) return false;
    this.latest = event.generation;
    this.session = null;
    this.revision = 0;
    if (this.shown === null || event.generation > this.shown) {
      this.shown = null;
      return true;
    }
    return false;
  }

  accept(generation: number | null, session: string | null, revision: number | null): boolean {
    if (!this.available || generation === null || session === null || revision === null || generation < this.latest) return false;
    if (generation === this.latest && this.session !== null
      && (session !== this.session || revision <= this.revision)) return false;
    this.latest = generation;
    this.session = session;
    this.revision = revision;
    this.shown = generation;
    return true;
  }
}
