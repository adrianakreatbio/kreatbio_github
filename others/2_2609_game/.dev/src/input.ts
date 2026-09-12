export class Input {
  singleStep = false;
  stepDirection(key:string){this.clear();this.keys.add(key);this.singleStep=true;}
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
  private pad: HTMLElement | null = null;
  private touchBlocked = false;
  bindPad(pad: HTMLElement, enabled: () => boolean) {
    this.pad = pad;
    const update = (e: PointerEvent) => {
      this.touchDirection = [0, 0];
      pad.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed'));
      if (!enabled() || this.touchBlocked) return;
      const button = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLButtonElement>('[data-direction]');
      if (!button || !pad.contains(button)) return;
      const dirs: Record<string, [number,number]> = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
      this.touchDirection = dirs[button.dataset.direction!]; button.classList.add('pressed');
    };
    pad.addEventListener('pointerdown', e => {
      if (!enabled() || this.pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); this.pointerId = e.pointerId; this.touchBlocked = false;
      pad.setPointerCapture(e.pointerId); update(e);
    });
    pad.addEventListener('pointermove', e => { if (this.pointerId === e.pointerId) { e.preventDefault(); update(e); } });
    const release = (e: PointerEvent) => { if (this.pointerId === e.pointerId) this.clearTouch(); };
    pad.addEventListener('pointerup', release); pad.addEventListener('pointercancel', release); pad.addEventListener('lostpointercapture', release);
    pad.addEventListener('contextmenu', e => e.preventDefault());
  }
  private clearTouch() {
    const id = this.pointerId; this.pointerId = null; this.touchDirection = [0,0]; this.touchBlocked = false;
    this.pad?.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed'));
    if (id !== null && this.pad?.hasPointerCapture(id)) this.pad.releasePointerCapture(id);
  }
  clear() { this.singleStep=false;this.clearTouch(); this.keys.clear(); this.blockedUntilRelease.clear(); }
  stopUntilRelease() { this.singleStep=false; this.touchBlocked = true; this.touchDirection = [0,0]; this.pad?.querySelectorAll(".pressed").forEach(b=>b.classList.remove("pressed")); for (const k of this.keys) this.blockedUntilRelease.add(k); this.keys.clear(); }
  direction(): [number, number] {
    if (this.pointerId !== null) return this.touchDirection;
    const has = (...ks: string[]) => ks.some(k => this.keys.has(k));
    return [Number(has('d', 'arrowright')) - Number(has('a', 'arrowleft')), Number(has('s', 'arrowdown')) - Number(has('w', 'arrowup'))];
  }
}
