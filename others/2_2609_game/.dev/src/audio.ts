export class Sound {
  context: AudioContext | null = null;
  muted = false;
  volume = .5;
  private lastDig = -1;
  setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));try{localStorage.setItem('microload.volume',String(this.volume));}catch{}}
  constructor() { try {const volume=localStorage.getItem('microload.volume');if(volume!==null&&Number.isFinite(Number(volume)))this.volume=Math.max(0,Math.min(1,Number(volume))); this.muted = localStorage.getItem('microload.muted') === 'true'; } catch {} }
  async enable() {
    if (this.muted) return;
    try { this.context ??= new AudioContext(); if (this.context.state === 'suspended') await this.context.resume(); } catch {}
  }
  toggle() { this.muted = !this.muted; try { localStorage.setItem('microload.muted', String(this.muted)); } catch {} if (this.muted) this.pause(); else void this.enable(); }
  pause() { if (this.context?.state === 'running') void this.context.suspend(); }
  // pitch shifts the tone: lower for harder, deeper soil layers.
  play(kind: string, pitch = 1) {
    const c = this.context;
    if (this.muted || this.volume<=0 || !c || c.state !== 'running') return;
    if(kind==='dig'){if(c.currentTime-this.lastDig<.15)return;this.lastDig=c.currentTime;}
    const tones: Record<string, number[]> = { dig: [100], collect: [520, 780], hurt: [130, 80], deposit: [390, 520, 780], respawn: [260, 170], upgrade: [440, 660, 880], fragment: [330, 495, 660, 990], win: [392, 494, 587, 784, 988] };
    (tones[kind] ?? [400]).forEach((frequency, i) => {
      const o = c.createOscillator(), g = c.createGain(), time = c.currentTime + i * .075;
      o.type = kind === 'dig' || kind === 'hurt' ? 'triangle' : 'sine'; o.frequency.setValueAtTime(frequency * pitch, time);
      g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime((kind==='dig'?.025:.07)*this.volume, time + .008); g.gain.exponentialRampToValueAtTime(.001, time + .15);
      o.connect(g); g.connect(c.destination); o.start(time); o.stop(time + .17);
    });
  }
}
