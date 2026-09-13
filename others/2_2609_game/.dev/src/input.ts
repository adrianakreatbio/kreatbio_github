export class Input {
  keys = new Set<string>();
  blockedUntilRelease = new Set<string>();
  constructor(public onPause: () => void, public onMute: () => void, public onScan: () => void) {
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(k) && !(e.target instanceof HTMLButtonElement && k === ' ')) e.preventDefault();
      if (!e.repeat && k === 'escape') onPause();
      if (!e.repeat && k === 'm') onMute();
      if (!e.repeat && k === 'e') onScan();
      if (!this.blockedUntilRelease.has(k)) this.keys.add(k);
    });
    window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); this.keys.delete(k); this.blockedUntilRelease.delete(k); });
  }
  private pointerId: number | null = null;
  private touchDirection: [number, number] = [0, 0];
  private zone: HTMLElement | null = null;
  private touchBlocked = false;
  private anchorX = 0;
  private anchorY = 0;
  // A MOBA-style floating joystick: touch anywhere in the zone to plant it there,
  // drag to pick a direction, release to stop. No fixed on-screen buttons needed.
  bindDrag(zone: HTMLElement, base: HTMLElement, knob: HTMLElement, enabled: () => boolean) {
    this.zone = zone;
    const DEAD = 10, MAX = 40;
    const update = (x: number, y: number) => {
      this.touchDirection = [0, 0];
      if (!enabled() || this.touchBlocked) return;
      const dx = x - this.anchorX, dy = y - this.anchorY, dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, MAX) / (dist || 1);
      knob.style.transform = `translate(${dx * clamped}px, ${dy * clamped}px)`;
      if (dist < DEAD) return;
      this.touchDirection = Math.abs(dx) > Math.abs(dy) ? [dx > 0 ? 1 : -1, 0] : [0, dy > 0 ? 1 : -1];
    };
    zone.addEventListener('pointerdown', e => {
      if (!enabled() || this.pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); this.pointerId = e.pointerId; this.touchBlocked = false;
      this.anchorX = e.clientX; this.anchorY = e.clientY;
      base.style.left = `${e.clientX}px`; base.style.top = `${e.clientY}px`;
      knob.style.transform = 'translate(0,0)'; base.hidden = false;
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', e => { if (this.pointerId === e.pointerId) { e.preventDefault(); update(e.clientX, e.clientY); } });
    const release = (e: PointerEvent) => { if (this.pointerId === e.pointerId) { this.clearTouch(); base.hidden = true; } };
    zone.addEventListener('pointerup', release); zone.addEventListener('pointercancel', release); zone.addEventListener('lostpointercapture', release);
    zone.addEventListener('contextmenu', e => e.preventDefault());
  }
  private clearTouch() {
    const id = this.pointerId; this.pointerId = null; this.touchDirection = [0,0]; this.touchBlocked = false;
    if (id !== null && this.zone?.hasPointerCapture(id)) this.zone.releasePointerCapture(id);
  }
  clear() { this.clearTouch(); this.keys.clear(); this.blockedUntilRelease.clear(); }
  stopUntilRelease() { this.touchBlocked = true; this.touchDirection = [0,0]; for (const k of this.keys) this.blockedUntilRelease.add(k); this.keys.clear(); }
  direction(): [number, number] {
    if (this.pointerId !== null) return this.touchDirection;
    const has = (...ks: string[]) => ks.some(k => this.keys.has(k));
    return [Number(has('d', 'arrowright')) - Number(has('a', 'arrowleft')), Number(has('s', 'arrowdown')) - Number(has('w', 'arrowup'))];
  }
}
