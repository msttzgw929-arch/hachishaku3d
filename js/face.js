// Anime-style face drawn on a canvas, with smoothly blended expression parameters.
import * as THREE from 'three';

export const EXPR = {
  // reference style: narrow, half-lidded sharp eyes; red lips; smug smile showing the upper teeth
  //        open  lid  happy  brow  browY smile mOpen mW   blush pupil squeeze teeth
  neutral:  [0.72, 0.55, 0.1,  0.15, 0.0,  0.55, 0.16, 1.0, 0.05, 1.0, 0, 1.0],
  smug:     [0.66, 0.68, 0.3,  0.3,  0.0,  0.95, 0.24, 1.08,0.08, 1.0, 0, 1.0],
  delight:  [0.52, 0.6,  0.85, 0.45, 0.08, 1.0,  0.5,  1.12,0.3,  1.0, 0, 1.0],
  angry:    [0.8,  0.45, 0.0, -1.0, -0.08,-0.2,  0.3,  1.0, 0.25, 0.8, 0, 1.0],
  pout:     [0.66, 0.6,  0.0, -0.5, -0.04,-0.55, 0.06, 0.62,0.45, 1.0, 0, 0.3],
  surprised:[1.05, 0.05, 0.0,  1.0,  0.18, 0.1,  0.6,  0.6, 0.15, 0.62,0, 1.0],
  hurt:     [0.3,  0.3,  0.0,  0.9,  0.05, -0.1, 0.5,  0.85,0.55, 1.0, 1, 1.0],
  furious:  [0.86, 0.3,  0.0, -1.0, -0.1,  0.35, 0.5,  1.15,0.3,  0.6, 0, 1.0],
};
const N = 12;

export class Face {
  constructor() {
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.cur = EXPR.smug.slice(); this.target = EXPR.smug.slice(); this.name = 'smug';
    this.blink = 0; this.blinkT = 2; this.talk = 0; this.look = [0, 0]; this.last = null;
    this.draw();
  }
  set(name) { if (EXPR[name] && name !== this.name) { this.name = name; this.target = EXPR[name].slice(); } }
  update(dt) {
    const k = 1 - Math.exp(-dt * 9);
    for (let i = 0; i < N; i++) this.cur[i] += (this.target[i] - this.cur[i]) * k;
    // blinking
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 2.2 + Math.random() * 3.5; if (Math.random() < 0.15) this.blinkT = 0.25; }
    this.blink = Math.max(0, this.blink - dt * 7);
    const sig = this.cur.map(v => v.toFixed(3)).join() + this.blink.toFixed(2) + this.talk.toFixed(2) + this.look[0].toFixed(2) + this.look[1].toFixed(2);
    if (sig !== this.last) { this.last = sig; this.draw(); this.tex.needsUpdate = true; }
  }
  draw() {
    const x = this.ctx, c = this.cur; x.clearRect(0, 0, 512, 512);
    let [open, lid, happy, brow, browY, smile, mOpen, mW, blush, pupil, squeeze, teeth] = c;
    const bl = Math.sin(Math.min(1, this.blink) * Math.PI);
    open *= (1 - bl * 0.95);
    mOpen = Math.min(1, mOpen + this.talk * 0.5);
    // subtle cheek tint / contour
    for (const s of [-1, 1]) {
      const g = x.createRadialGradient(256 + s * 132, 350, 0, 256 + s * 132, 350, 62);
      g.addColorStop(0, `rgba(240,130,140,${0.1 + 0.35 * blush})`); g.addColorStop(1, 'rgba(240,130,140,0)');
      x.fillStyle = g; x.fillRect(256 + s * 132 - 66, 284, 132, 132);
    }
    // nose: soft shadow + tip
    x.strokeStyle = 'rgba(150,100,105,0.45)'; x.lineWidth = 2.5; x.lineCap = 'round';
    x.beginPath(); x.moveTo(262, 300); x.quadraticCurveTo(266, 330, 258, 346); x.stroke();
    x.fillStyle = 'rgba(140,90,95,0.45)'; x.beginPath(); x.ellipse(250, 349, 6, 2.6, 0.2, 0, 7); x.fill();
    for (const s of [-1, 1]) this.eye(x, 256 + s * 108, 278, s, open, lid, happy, pupil, squeeze);
    // brows: thin, long, sharp
    for (const s of [-1, 1]) {
      const bx = 256 + s * 110, by = 214 - browY * 36 - Math.max(0, open - 0.9) * 40;
      const inner = by + (-brow) * 15, outer = by + brow * 6 - 10;
      x.strokeStyle = '#1c1214'; x.lineWidth = 5; x.lineCap = 'round';
      x.beginPath(); x.moveTo(bx - s * 50, inner + 6); x.quadraticCurveTo(bx + s * 4, Math.min(inner, outer) - 5, bx + s * 62, outer + 10); x.stroke();
      x.lineWidth = 2.5; x.beginPath(); x.moveTo(bx - s * 54, inner + 8); x.lineTo(bx - s * 44, inner + 4); x.stroke();
    }
    x.save(); x.translate(256, 398); x.scale(1.4, 1.4); x.translate(-256, -398); this.mouth(x, 256, 398, smile, mOpen, mW, teeth); x.restore();
  }
  eye(x, ex, ey, s, open, lid, happy, pupil, squeeze) {
    x.save(); x.translate(ex, ey); x.scale(1.5, 1.5); x.translate(-ex, -ey);
    this.eye2(x, ex, ey, s, open, lid, happy, pupil, squeeze); x.restore();
  }
  eye2(x, ex, ey, s, open, lid, happy, pupil, squeeze) {
    const W = 50;
    const lx = this.look[0] * 8, ly = this.look[1] * 5;
    x.lineCap = 'round'; x.lineJoin = 'round';
    if (squeeze > 0.5) { // tightly shut, pained (keeps the sharp liner style)
      x.strokeStyle = '#140c0e'; x.lineWidth = 7;
      x.beginPath(); x.moveTo(ex - s * W, ey + 2); x.quadraticCurveTo(ex, ey + 12, ex + s * W, ey - 6); x.lineTo(ex + s * (W + 12), ey - 12); x.stroke();
      x.lineWidth = 3; x.beginPath(); x.moveTo(ex - s * W * 0.7, ey - 12); x.quadraticCurveTo(ex, ey - 20, ex + s * W * 0.8, ey - 16); x.stroke();
      x.fillStyle = 'rgba(160,215,255,0.85)'; x.beginPath(); x.ellipse(ex + s * 30, ey + 18, 5, 9, 0, 0, 7); x.fill();
      return;
    }
    const h = 34 * open;
    const inner = [ex - s * W, ey + 6], outer = [ex + s * W, ey - 10];     // upturned, sharp outer corner
    const topY = ey - h * (1 - lid * 0.62);                                  // heavy, half-lidded upper lid
    const lowY = ey + 6 + h * 0.26 - happy * 9;                              // lower lid lifts when smiling
    x.save();
    x.beginPath(); x.moveTo(...inner);
    x.bezierCurveTo(ex - s * W * 0.45, topY + 2, ex + s * W * 0.4, topY - 1, ...outer);
    x.bezierCurveTo(ex + s * W * 0.45, lowY - 2, ex - s * W * 0.35, lowY + 1, ...inner); x.closePath();
    x.fillStyle = '#f3eeee'; x.fill(); x.clip();
    x.fillStyle = 'rgba(120,90,110,0.45)'; x.fillRect(ex - W - 10, topY - 12, W * 2 + 20, 16);
    const ir = 24 * Math.max(0.8, Math.min(1.0, open + 0.25)), icx = ex + lx + s * 2, icy = ey + 3 + ly;
    const g = x.createRadialGradient(icx, icy + 4, 2, icx, icy, ir);
    g.addColorStop(0, '#0a0607'); g.addColorStop(0.45, '#22140f'); g.addColorStop(0.85, '#4a2a1e'); g.addColorStop(1, '#140a08');
    x.fillStyle = g; x.beginPath(); x.ellipse(icx, icy, ir * 0.86, ir, 0, 0, 7); x.fill();
    x.fillStyle = '#050304'; x.beginPath(); x.ellipse(icx, icy + 1, ir * 0.34 * pupil, ir * 0.42 * pupil, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.ellipse(icx - s * 7, icy - 7, 4.5, 5, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,230,230,0.35)'; x.beginPath(); x.arc(icx + s * 8, icy + 9, 3, 0, 7); x.fill();
    x.restore();
    // heavy upper eyeliner with a sharp wing
    x.fillStyle = '#0e0809'; x.beginPath(); x.moveTo(inner[0], inner[1]);
    x.bezierCurveTo(ex - s * W * 0.45, topY - 1, ex + s * W * 0.4, topY - 4, outer[0], outer[1] - 2);
    x.lineTo(outer[0] + s * 18, outer[1] - 12);
    x.lineTo(outer[0] - s * 2, outer[1] + 3);
    x.bezierCurveTo(ex + s * W * 0.4, topY + 4, ex - s * W * 0.45, topY + 5, inner[0], inner[1] + 2); x.closePath(); x.fill();
    // lid crease
    x.strokeStyle = 'rgba(110,65,75,0.55)'; x.lineWidth = 2.2;
    x.beginPath(); x.moveTo(ex - s * W * 0.6, topY - 9); x.quadraticCurveTo(ex + s * 4, topY - 15, ex + s * W * 0.95, outer[1] - 12); x.stroke();
    // lower lash line (thin, outer half darker)
    x.strokeStyle = 'rgba(50,25,30,0.75)'; x.lineWidth = 2.2;
    x.beginPath(); x.moveTo(ex - s * W * 0.5, lowY + 1); x.quadraticCurveTo(ex + s * 10, lowY + 3, outer[0] - s * 2, outer[1] + 2); x.stroke();
  }
  mouth(x, mx, my, smile, open, w, teeth) {
    const hw = 30 * w + 9 * Math.max(0, smile);
    const curve = smile * 13;
    const oh = 4 + open * 32;
    x.lineCap = 'round'; x.lineJoin = 'round';
    const cy = my - curve * 0.6;                      // corner height
    const topC = my - 2 - oh * 0.1, botC = my + oh + curve * 0.35;
    // mouth opening
    x.beginPath(); x.moveTo(mx - hw, cy);
    x.bezierCurveTo(mx - hw * 0.5, topC, mx + hw * 0.5, topC, mx + hw, cy);
    x.bezierCurveTo(mx + hw * 0.55, botC, mx - hw * 0.55, botC, mx - hw, cy); x.closePath();
    x.fillStyle = '#4a0f18'; x.fill();
    x.save(); x.clip();
    x.fillStyle = '#b8505a'; x.beginPath(); x.ellipse(mx, botC + 3, hw * 0.55, Math.max(2, oh * 0.4), 0, 0, 7); x.fill();
    if (teeth > 0.1) { // upper teeth row
      const th = Math.min(oh * 0.55, 9) * teeth + 2;
      x.fillStyle = '#fbf7f2'; x.beginPath(); x.moveTo(mx - hw, cy - 3);
      x.bezierCurveTo(mx - hw * 0.5, topC - 3, mx + hw * 0.5, topC - 3, mx + hw, cy - 3);
      x.lineTo(mx + hw, cy + th * 0.4);
      x.bezierCurveTo(mx + hw * 0.5, topC + th, mx - hw * 0.5, topC + th, mx - hw, cy + th * 0.4); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(160,140,140,0.5)'; x.lineWidth = 1;
      for (const k of [-0.5, -0.18, 0.18, 0.5]) { x.beginPath(); x.moveTo(mx + hw * k, topC); x.lineTo(mx + hw * k, topC + th * 0.9); x.stroke(); }
    }
    x.restore();
    // red lips: upper lip with a cupid's bow, fuller lower lip
    x.fillStyle = '#b81f30';
    x.beginPath(); x.moveTo(mx - hw - 2, cy);
    x.bezierCurveTo(mx - hw * 0.6, topC - 2, mx - hw * 0.25, topC - 9, mx, topC - 5);
    x.bezierCurveTo(mx + hw * 0.25, topC - 9, mx + hw * 0.6, topC - 2, mx + hw + 2, cy);
    x.bezierCurveTo(mx + hw * 0.5, topC - 1, mx - hw * 0.5, topC - 1, mx - hw - 2, cy); x.closePath(); x.fill();
    x.fillStyle = '#c42536';
    x.beginPath(); x.moveTo(mx - hw, cy + 1);
    x.bezierCurveTo(mx - hw * 0.55, botC, mx + hw * 0.55, botC, mx + hw, cy + 1);
    x.bezierCurveTo(mx + hw * 0.55, botC + 12, mx - hw * 0.55, botC + 12, mx - hw, cy + 1); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,190,190,0.45)'; x.beginPath(); x.ellipse(mx - hw * 0.15, botC + 5, hw * 0.25, 2.2, 0, 0, 7); x.fill();
    x.strokeStyle = '#7a1420'; x.lineWidth = 2;
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(mx + s * hw, cy); x.lineTo(mx + s * (hw + 5), cy - 3 - smile * 3); x.stroke(); }
  }
}
