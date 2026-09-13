import { MICROBES, NUTRIENTS, PLANT_TARGET } from './biology';
import { FOOD_TILE, H, HOME, W, layer, tileAt, playableTile, nutrientRevealed, surveyForTile } from './world';
import { energyMax, type Simulation } from './simulation';
const COLORS = ['#d4ff70', '#72eadc', '#b78aff'];
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }
export class Renderer {
  ctx: CanvasRenderingContext2D;
  width = 1000; height = 600; cell =  40;
  cameraX = HOME.x; cameraY = 6;
  px = HOME.x; py = HOME.y;
  particles: Particle[] = [];
  reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  revealTime = 0;
  revealDepth: number | null = null;
  reveal(y: number) { this.revealDepth=y; this.revealTime=1.5; }
  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    this.width = rect.width; this.height = rect.height; this.cell = this.width < 600 ? 32 : 42;
    this.canvas.width = Math.round(rect.width * dpr); this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  burst(x: number, y: number, color: string) {
    if(this.reducedMotion.matches)return;
    for (let i = 0; i < 12; i++) this.particles.push({ x: x + .5, y: y + .5, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, life: .7, color });
  }
  draw(sim: Simulation, time: number, dt: number, active: boolean) {
    if(this.reducedMotion.matches)time=0;
    const c = this.ctx, s = sim.state, size = this.cell;
    if (active) this.revealTime=Math.max(0,this.revealTime-dt);
    const easing = this.reducedMotion.matches?1:1-Math.exp(-dt*32);
    if (Math.abs(this.px - s.player.x) + Math.abs(this.py - s.player.y) > 8) { this.px = s.player.x; this.py = s.player.y; }
    this.px += (s.player.x - this.px) * easing; this.py += (s.player.y - this.py) * easing;
    const halfX = this.width / size / 2, halfY = this.height / size / 2;
    const cx = Math.max(halfX - .5, Math.min(W - halfX - .5, this.px));
    const cy = Math.max(halfY - .5, Math.min(H - halfY - .5, this.py + 1));
    this.cameraX += (cx - this.cameraX) * (this.reducedMotion.matches?1:1 - Math.exp(-dt * 7)); this.cameraY += (cy - this.cameraY) * (this.reducedMotion.matches?1:1 - Math.exp(-dt * 7));
    const ox = this.width / 2 - (this.cameraX + .5) * size, oy = this.height / 2 - (this.cameraY + .5) * size;
    c.fillStyle = '#0a1219'; c.fillRect(0, 0, this.width, this.height);
    c.save(); c.translate(ox, oy);
    const minX = Math.max(0, Math.floor(-ox / size)), maxX = Math.min(W - 1, Math.ceil((this.width - ox) / size));
    const minY = Math.max(0, Math.floor(-oy / size)), maxY = Math.min(H - 1, Math.ceil((this.height - oy) / size));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const t = playableTile(s.world, s.scans, x, y), l = layer(y), sx = x * size, sy = y * size;
      if (t === 0 || t === 5 || t === 7 || t === 9 || s.world.buried?.[y*W+x]) {
        c.fillStyle = y <= 3 ? '#102b2b' : ['#111e23', '#151c2b', '#201a2e'][l]; c.fillRect(sx, sy, size, size);
        c.strokeStyle = '#ffffff04'; c.strokeRect(sx, sy, size, size);
        // Drifting motes give dug tunnels a sense of living pore water.
        const h2 = ((x * 2654435761 ^ y * 97) >>> 0);
        if (y > 3 && h2 % 6 === 0) {
          const mx = sx + size * (.2 + (h2 >>> 4) % 60 / 100) + Math.sin(time * .9 + h2 % 10) * 3;
          const my = sy + size * (.2 + (h2 >>> 8) % 60 / 100) + Math.cos(time * .7 + h2 % 7) * 3;
          c.fillStyle = ['#8adfcf30', '#c9a2ff2e', '#d4ff7028'][h2 % 3]; c.beginPath(); c.arc(mx, my, 1.6, 0, 7); c.fill();
        }
      } else {
        c.fillStyle = t === 6 ? '#48575f' : ['#29322f', '#2a303c', '#332d41'][l];
        c.beginPath(); c.roundRect(sx + 1, sy + 1, size - 2, size - 2, 4); c.fill();
        c.strokeStyle = t === 6 ? '#76909c' : '#ffffff06'; c.lineWidth = t === 6 ? 1.5 : 1; c.stroke(); c.lineWidth = 1;
        for (let j = 0; j < 5; j++) {
          const h = ((x * 73856093 ^ y * 19349663 ^ j * 83492791) >>> 0);
          c.fillStyle = j % 2 ? '#00000024' : '#ffffff0c';
          c.fillRect(sx + 4 + h % (size - 8), sy + 4 + (h >>> 8) % (size - 8), j % 2 + 1, 2);
        }
        // Rocks read as pale, faceted stone — clearly not diggable soil.
        if (t === 6) {
          c.strokeStyle = '#a9c1cc99'; c.lineWidth = 1.6;
          c.beginPath(); c.moveTo(sx + 8, sy + 10); c.lineTo(sx + 17, sy + 18); c.lineTo(sx + 10, sy + 30); c.stroke();
          c.beginPath(); c.moveTo(sx + size - 9, sy + 8); c.lineTo(sx + size * .55, sy + size * .5); c.lineTo(sx + size - 7, sy + size - 11); c.stroke();
          c.fillStyle = '#ffffff1e'; c.beginPath(); c.moveTo(sx + 6, sy + 8); c.lineTo(sx + size * .45, sy + 6); c.lineTo(sx + 8, sy + size * .4); c.closePath(); c.fill();
          c.lineWidth = 1;
        }
      }
      if(y>3) {
        const surveyed=nutrientRevealed(s.world,s.scans,y);
        c.fillStyle=surveyed?'#72eadc09':'#00000013';c.fillRect(sx,sy,size,size);
        if(x%5===0 && y%4===0 && t===1){c.strokeStyle=['#849b6544','#87c7ce44','#b79cda44'][l];c.lineWidth=1;c.beginPath();c.moveTo(sx+8,sy+7);c.lineTo(sx+size/2,sy+size/2);c.lineTo(sx+size-6,sy+size/3);c.stroke();}
        if(y>4 && surveyForTile(s.world,y).id!==surveyForTile(s.world,y-1).id){c.strokeStyle=surveyed?'#72eadc':'#ffc857';c.setLineDash([6,5]);c.beginPath();c.moveTo(sx,sy);c.lineTo(sx+size,sy);c.stroke();c.setLineDash([]);}
      }
      if (t === FOOD_TILE) {
        c.save(); c.translate(sx + size / 2, sy + size / 2);
        c.fillStyle = '#ffae492c'; c.strokeStyle = '#ffae49'; c.lineWidth = 2;
        c.beginPath(); c.roundRect(-size*.42,-size*.42,size*.84,size*.84,6);c.fill();c.stroke();
        c.fillStyle = '#ffbf69'; c.shadowColor = '#ffae49'; c.shadowBlur = 12;
        c.beginPath(); c.moveTo(2,-14);c.lineTo(-10,2);c.lineTo(-1,2);c.lineTo(-5,13);c.lineTo(11,-5);c.lineTo(2,-5);c.closePath();c.fill();
        c.shadowBlur = 0;c.font = 'bold 8px monospace';c.textAlign = 'center';c.fillText('+30',0,size*.38);c.restore();
      }
      if (t >= 2 && t <= 4) {
        if(this.revealTime>0 && this.revealDepth!==null && surveyForTile(s.world,y).y===this.revealDepth && nutrientRevealed(s.world,s.scans,y)) {
          c.fillStyle=`rgba(114,234,220,${this.revealTime*.2})`;c.fillRect(sx,sy,size,size);
        }
        const col = COLORS[t - 2], pulse = .7 + Math.sin(time * 2 + x + y) * .15;
        c.save(); c.translate(sx + size / 2, sy + size / 2); c.shadowBlur = 15 * pulse; c.shadowColor = col; c.fillStyle = col;
        for (let j = 0; j < 3; j++) { c.beginPath(); c.ellipse((j - 1) * 7, j === 1 ? -5 : 4, 3.5, 6, j - 1, 0, Math.PI * 2); c.fill(); }
        c.restore();
        c.fillStyle = '#10191b'; c.font = 'bold 14px monospace'; c.textAlign = 'center';
        c.fillText(NUTRIENTS[t - 2], sx + size / 2, sy + size / 2 + 5);
        const known = s.world.samples.some(site => s.scans.includes(site.id) && MICROBES[site.id].nutrient === NUTRIENTS[t - 2] && Math.abs(site.x - x) <= 5 && Math.abs(site.y - y) <= 3);
        if (known) { c.strokeStyle = col; c.lineWidth = 1.5; c.strokeRect(sx + 3, sy + 3, size - 6, size - 6); }
      }
      if (t === 9) {
        // Waterlogged pore space: passable, dim blue, oxygen-poor.
        c.fillStyle = '#3a7fb02a'; c.fillRect(sx, sy, size, size);
        c.strokeStyle = '#6fb7e877'; c.lineWidth = 1.2;
        for (const off of [.4, .65, .88]) {
          c.beginPath();
          for (let i = 0; i <= 6; i++) { const wx = sx + 3 + i * (size - 6) / 6, wy = sy + size * off + Math.sin(time * 1.5 + x * 1.7 + i * 1.1) * 2; i ? c.lineTo(wx, wy) : c.moveTo(wx, wy); }
          c.stroke();
        }
        c.font = 'bold 7px monospace'; c.fillStyle = '#9fd4f5'; c.textAlign = 'center'; c.fillText('LOW O₂', sx + size / 2, sy + 11);
      }
      if (t === 5) {
        c.fillStyle = '#ff759525'; c.fillRect(sx, sy, size, size); c.strokeStyle = '#ff7595'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(sx + size / 2, sy + 9); c.lineTo(sx + size - 10, sy + size - 10); c.lineTo(sx + 10, sy + size - 10); c.closePath(); c.stroke();
        c.font = 'bold 16px sans-serif'; c.fillStyle = '#ff9fb4'; c.textAlign = 'center'; c.fillText('!', sx + size / 2, sy + size - 14);
        c.fillStyle = '#ff759555'; c.beginPath(); c.arc(sx + size * .7, sy + size * (.3 + Math.sin(time + x) * .12), 3, 0, 7); c.fill();
      }
      if (t === 7) {
        c.save(); c.translate(sx + size / 2, sy + size / 2); c.shadowColor = '#ffc857'; c.shadowBlur = 30; c.strokeStyle = '#ffc857'; c.lineWidth = 2;
        for (let i = -13; i < 14; i += 4) { const q = Math.sin(i / 7 + time) * 9; c.beginPath(); c.moveTo(q, i); c.lineTo(-q, i); c.stroke(); }
        c.restore();
      }
    }
    // Surface meadow strip and faint horizon letters give the column a sense of place.
    if (3 >= minY && 3 <= maxY) {
      c.strokeStyle = '#7fbf6a'; c.lineWidth = 1.5;
      for (let x = minX; x <= maxX; x++) for (let j = 0; j < 3; j++) {
        const h = ((x * 92821 + j * 53987) >>> 0), bx = x * size + 4 + h % (size - 8), sway = Math.sin(time * 1.5 + h) * 2;
        c.beginPath(); c.moveTo(bx, 4 * size); c.quadraticCurveTo(bx + sway, 4 * size - 7 - h % 6, bx + sway * 1.6, 4 * size - 12 - h % 8); c.stroke();
      }
      c.lineWidth = 1;
    }
    c.font = `bold ${size * 2.4}px monospace`; c.fillStyle = '#ffffff0a'; c.textAlign = 'left';
    c.fillText('A', 1.1 * size, 9 * size); c.fillText('B', 1.1 * size, 38 * size); c.fillText('C', 1.1 * size, 71 * size);
    // Sample habitats and DNA markers are distinct from fictional contact hazards.
    for (const site of s.world.samples) {
      const sx = (site.x + .5) * size, sy = (site.y + .5) * size;
      const scanned = s.scans.includes(site.id), risk = site.id === 'root-risk';
      c.save(); c.translate(sx, sy);
      c.fillStyle = risk ? '#ffb5700c' : '#72eadc0c'; c.fillRect(-size * 2, -size * 3, size * 7, size * 6);
      c.strokeStyle = risk ? '#b49972' : '#9eac75'; c.lineWidth = 2; c.beginPath();
      c.moveTo(-size * 1.2, -size * 2.7); c.bezierCurveTo(-size * 2, -size, -size * .9, size, -size * 1.8, size * 2.6);
      c.moveTo(-size * 1.5, -size); c.lineTo(-size * .8, -size * .3); c.moveTo(-size * 1.4, size); c.lineTo(-size * 2, size * 1.4); c.stroke();
      c.strokeStyle = scanned ? '#72eadc' : '#ffc857'; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, size * .43, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#12262dee'; c.fill();
      if (scanned) { c.fillStyle = '#72eadc'; c.font = 'bold 13px monospace'; c.textAlign = 'center'; c.fillText('✓', 0, 5); }
      else this.goldBars(size);
      // Stylized rods for bacteria; branching hyphae for the fungal clue.
      // These are illustrations revealed by the scan, not microscopic identification.
      if (scanned) {
        c.save(); c.translate(-size * 1.5, size * .3); c.strokeStyle = risk ? '#e9b48b' : '#72eadc'; c.fillStyle = risk ? '#e9b48b' : '#72eadc';
        if (risk) {
          c.lineWidth = 1.5; c.beginPath(); c.moveTo(-12, 18); c.lineTo(3, -15); c.moveTo(-5, 3); c.lineTo(-17, -7); c.moveTo(0, -7); c.lineTo(14, -15); c.moveTo(-7, 9); c.lineTo(8, 10); c.stroke();
        } else {
          for (let j=0;j<3;j++) { c.save(); c.translate((j-1)*10, (j%2)*14); c.rotate(j*.5); c.beginPath(); c.roundRect(-3,-7,6,14,3); c.fill(); if (site.id === 'phosphorus-helper') { c.fillStyle='#15352d'; c.beginPath(); c.arc(0,0,2,0,7); c.fill(); c.fillStyle='#72eadc'; } c.restore(); }
        }
        c.restore();
      }
      c.font = '9px monospace'; c.fillText(scanned ? MICROBES[site.id].role.toUpperCase() : 'SOIL DNA SAMPLE', 0, -size * .65);
      if (scanned && s.world.balanced) {c.strokeStyle='#72eadc';c.setLineDash([5,5]);c.beginPath();c.moveTo(0,0);c.lineTo(0,size*5);c.lineTo(size*7,size*5);c.lineTo(size*7,0);c.stroke();c.setLineDash([]);c.font='bold 11px monospace';c.fillStyle='#b5f5da';c.fillText('SAFE ROUTE',size*3.5,size*5.4);if(site.y>4){c.fillStyle='#ffc0cc';c.fillText('SHORTCUT · HAZARDS',size*3.5,-size*.7);}}
      if (scanned && risk && !s.world.balanced) { c.strokeStyle = '#72eadc'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(0, -size * 2); c.lineTo(0, size * 3); c.lineTo(size * 4, size * 3); c.stroke(); }
      c.restore();
    }
    // The colony is a luminous landmark in the surface band.
    const hx = (HOME.x + .5) * size, hy = (HOME.y + .5) * size;
    c.save(); c.strokeStyle = '#72eadc66'; c.fillStyle = '#72eadc0b'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(hx, hy, size * 2.5, size * 1.2, 0, 0, 7); c.fill(); c.stroke();
    c.textAlign = 'center'; c.fillStyle = '#9ee9d9'; c.font = '10px monospace'; c.fillText('HOME · FREE ENERGY + DEPOSIT', hx, size * 1.1);
    for (const offset of [-1.5, 1.5]) this.microbe(hx + offset * size, hy + Math.sin(time + offset) * 3, size * .42, time + offset, false);
    c.restore();
    // Plant recovery remains visible at the colony as well as in the dashboard.
    c.save(); c.translate(hx + size * 3.5, hy);
    const growth = Math.min(1, s.deposited.N / PLANT_TARGET), roots = Math.min(1, s.deposited.P / PLANT_TARGET), water = Math.min(1, s.deposited.K / PLANT_TARGET);
    c.strokeStyle = '#c3ae89'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(-12 - roots * 20, 10 + roots * 20); c.moveTo(0, 0); c.lineTo(12 + roots * 20, 10 + roots * 20); c.stroke();
    c.rotate((1-water)*.25); c.strokeStyle = '#9ecb7c'; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -size * 1.3); c.stroke();
    c.fillStyle = `hsl(${55+growth*48} 50% 50%)`;
    for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * 11, -size * (.55 + (d+1)*.2), 15, 8, d * -.4, 0, 7); c.fill(); }
    c.restore();
    for (const e of s.world.enemies) {
      const ex = (e.x + .5) * size, ey = (e.y + .5) * size;
      c.save(); c.translate(ex, ey); c.fillStyle = '#ff75953d'; c.strokeStyle = '#ff7595'; c.shadowColor = '#ff7595'; c.shadowBlur = 12;
      c.beginPath(); for (let j = 0; j < 16; j++) { const a = j / 16 * Math.PI * 2 + time * .4, r = j % 2 ? 11 : 17; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ffdddf'; c.fillRect(-6, -3, 4, 3); c.fillRect(3, -3, 4, 3); c.restore();
    }
    // Earthworms: segmented, pale saddle band, trailing behind their heading.
    for (const w of s.world.worms ?? []) {
      const wx = (w.x + .5) * size, wy = (w.y + .5) * size, dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]], [wdx, wdy] = dirs[w.dir];
      c.save(); c.translate(wx, wy); c.lineCap = 'round';
      c.strokeStyle = '#d98a74'; c.lineWidth = size * .3;
      c.beginPath();
      for (let i = 0; i <= 4; i++) { const t2 = i / 4, px = -wdx * size * .95 * t2 + (wdy ? Math.sin(time * 3 + i * 1.4) * 3 : 0), py = -wdy * size * .95 * t2 + (wdx ? Math.sin(time * 3 + i * 1.4) * 3 : 0); i ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.stroke();
      c.strokeStyle = '#f3b39c'; c.lineWidth = size * .34;
      c.beginPath(); c.moveTo(-wdx * size * .35, -wdy * size * .35); c.lineTo(-wdx * size * .55, -wdy * size * .55); c.stroke();
      c.fillStyle = '#8a4a3c'; c.beginPath(); c.arc(wdx * size * .12, wdy * size * .12, size * .09, 0, 7); c.fill();
      c.restore();
    }
    if (sim.progress > 0) {
      const x = (s.player.x + sim.facing.x) * size, y = (s.player.y + sim.facing.y) * size;
      c.fillStyle = '#d4ff7022'; c.fillRect(x, y, size, size); c.strokeStyle = '#d4ff70'; c.lineWidth = 2; c.strokeRect(x + 2, y + 2, size - 4, size - 4);
      c.fillStyle = '#10171c'; c.fillRect(x + 5, y + size - 9, size - 10, 4); c.fillStyle = '#d4ff70'; c.fillRect(x + 5, y + size - 9, (size - 10) * sim.progress, 4);
    }
    this.microbe((this.px + .5) * size, (this.py + .5) * size, size * .8, time, sim.damageTimer > .5);

    if (active) this.particles = this.particles.filter(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; return p.life > 0; });
    for (const p of this.particles) { c.globalAlpha = Math.max(0, p.life / .7); c.fillStyle = p.color; c.fillRect(p.x * size, p.y * size, 3, 3); } c.globalAlpha = 1;
    c.restore();
    for (let i = 0; i < 28; i++) {
      const x = (i * 137.7 + Math.sin(time * .12 + i) * 25) % this.width, y = (i * 89.3 - time * (2 + i % 3)) % this.height;
      c.fillStyle = '#b7f9e41c'; c.beginPath(); c.arc(x, y < 0 ? y + this.height : y, i % 3 === 0 ? 1.5 : .7, 0, 7); c.fill();
    }
    const vignette = c.createRadialGradient(this.width / 2, this.height / 2, this.height * .25, this.width / 2, this.height / 2, this.width * .7);
    vignette.addColorStop(0, '#02060a00'); vignette.addColorStop(1, '#02060a99'); c.fillStyle = vignette; c.fillRect(0, 0, this.width, this.height);
    // Low-energy alarm: the screen edge pulses red as reserves run out.
    const er = s.player.energy / energyMax(s);
    if (active && er <= .25) {
      const urgency = 1 - er / .25, pulse = this.reducedMotion.matches ? .6 : .55 + Math.sin(time * 5) * .35;
      const alarm = c.createRadialGradient(this.width / 2, this.height / 2, this.height * .3, this.width / 2, this.height / 2, this.width * .62);
      alarm.addColorStop(0, '#ff3d5e00'); alarm.addColorStop(1, `rgba(255,61,94,${(.14 + .2 * urgency) * pulse})`);
      c.fillStyle = alarm; c.fillRect(0, 0, this.width, this.height);
    }
  }
  // Unscanned gold markers read as a stack of ingots — a clearer "collect me" cue than a bare letter.
  goldBars(size: number) {
    const c = this.ctx, barH = size * .14, gap = size * .03;
    let bottom = size * .27;
    for (const w of [size * .58, size * .44, size * .3]) {
      const top = bottom - barH;
      c.fillStyle = '#b8860f'; c.strokeStyle = '#6e4c12'; c.lineWidth = 1;
      c.beginPath(); c.roundRect(-w / 2, top, w, barH, 2); c.fill(); c.stroke();
      c.fillStyle = '#ffe08a';
      c.beginPath(); c.roundRect(-w / 2 + 1.2, top + 1, w - 2.4, barH * .4, 1.4); c.fill();
      bottom = top - gap;
    }
    c.strokeStyle = '#fff6d6'; c.lineWidth = 1.1;
    const sx0 = size * .2, sy0 = -size * .3;
    c.beginPath(); c.moveTo(sx0 - 3, sy0); c.lineTo(sx0 + 3, sy0); c.moveTo(sx0, sy0 - 3); c.lineTo(sx0, sy0 + 3); c.stroke();
  }
  microbe(x: number, y: number, size: number, time: number, hurt: boolean) {
    const c = this.ctx; c.save(); c.translate(x, y); c.rotate(Math.sin(time * 2) * .06);
    c.strokeStyle = '#b78affaa'; c.lineWidth = 1.3;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2, bx = Math.cos(a) * size * .3, by = Math.sin(a) * size * .45;
      c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx * 1.6 + Math.sin(time * 7 + i) * 3, by * 1.5, bx * 1.8, by * 1.7 + Math.cos(time * 5 + i) * 3); c.stroke();
    }
    c.shadowColor = hurt ? '#ff7595' : '#ad72ff'; c.shadowBlur = 18;
    const g = c.createLinearGradient(-size / 3, 0, size / 3, 0); g.addColorStop(0, '#8951d2'); g.addColorStop(.5, hurt ? '#ff9bab' : '#c991ff'); g.addColorStop(1, '#9654db');
    c.fillStyle = g; c.strokeStyle = '#d3a2ff'; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(-size * .29, -size * .45, size * .58, size * .9, size * .28); c.fill(); c.stroke(); c.shadowBlur = 0;
    c.strokeStyle = '#271a3e'; c.lineWidth = 2;
    for (const ex of [-.12, .12]) { c.beginPath(); c.arc(ex * size, -size * .12, size * .047, Math.PI, 0); c.stroke(); }
    c.fillStyle = '#351746'; c.beginPath(); c.arc(0, size * .01, size * .085, 0, Math.PI); c.fill();
    c.fillStyle = '#ff80bf'; for (const ex of [-.18, .18]) { c.beginPath(); c.ellipse(ex * size, 0, size * .055, size * .035, 0, 0, 7); c.fill(); }
    c.fillStyle = '#ffffffa0'; c.beginPath(); c.ellipse(size * .09, -size * .32, size * .04, size * .09, -.6, 0, 7); c.fill(); c.restore();
  }
}

