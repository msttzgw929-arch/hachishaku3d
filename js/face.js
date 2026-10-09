// Anime-style face drawn on a canvas, with smoothly blended expression parameters.
import * as THREE from 'three';

export const EXPR = {
  //        open  lid  happy  brow  browY smile mOpen mW   blush pupil squeeze teeth
  neutral:  [0.95, 0.35, 0.0,  0.1,  0.0,  0.35, 0.0,  1.0, 0.15, 1.0, 0, 0.0],
  smug:     [0.85, 0.55, 0.0,  0.35, 0.05, 0.85, 0.18, 1.05,0.25, 1.0, 0, 1.0],
  delight:  [0.55, 0.0,  0.85, 0.5,  0.15, 1.0,  0.55, 1.1, 0.75, 1.0, 0, 1.0],
  angry:    [0.9,  0.25, 0.0, -1.0, -0.1, -0.45, 0.3,  1.0, 0.45, 0.85,0, 1.0],
  pout:     [0.8,  0.4,  0.0, -0.55,-0.05,-0.7,  0.0,  0.55,0.7,  1.0, 0, 0.0],
  surprised:[1.18, 0.0,  0.0,  1.0,  0.2,  0.0,  0.65, 0.55,0.3,  0.62,0, 0.3],
  hurt:     [0.3,  0.0,  0.0,  0.9,  0.05, -0.2, 0.6,  0.8, 0.95, 1.0, 1, 0.6],
  furious:  [1.0,  0.1,  0.0, -1.0, -0.12, 0.2,  0.55, 1.15,0.55, 0.6, 0, 1.0],
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
    const bl = Math.sin(Math.min(1, this.blink) * Math.PI); // 0..1..0
    open *= (1 - bl * 0.95);
    mOpen = Math.min(1, mOpen + this.talk * 0.55);
    // --- blush
    if (blush > 0.02) for (const s of [-1, 1]) {
      const g = x.createRadialGradient(256 + s * 128, 352, 0, 256 + s * 128, 352, 56);
      g.addColorStop(0, `rgba(255,120,140,${0.42 * blush})`); g.addColorStop(1, 'rgba(255,120,140,0)');
      x.fillStyle = g; x.fillRect(256 + s * 128 - 60, 292, 120, 120);
      if (blush > 0.5) { x.strokeStyle = `rgba(230,90,110,${(blush - 0.5) * 0.9})`; x.lineWidth = 2.5; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(256 + s * (110 + i * 13), 358); x.lineTo(256 + s * (118 + i * 13), 344); x.stroke(); } }
    }
    // --- nose
    x.strokeStyle = 'rgba(170,110,110,0.55)'; x.lineWidth = 3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(259, 330); x.lineTo(252, 348); x.stroke();
    // --- eyes
    for (const s of [-1, 1]) this.eye(x, 256 + s * 110, 282, s, open, lid, happy, pupil, squeeze);
    // --- brows
    for (const s of [-1, 1]) {
      const bx = 256 + s * 112, by = 200 - browY * 40 - Math.max(0, open - 1) * 30;
      const inner = by + (-brow) * 16 + (brow > 0 ? -brow * 4 : 0), outer = by + brow * 10 - 4;
      x.strokeStyle = '#2a1c1e'; x.lineWidth = 6; x.lineCap = 'round';
      x.beginPath(); x.moveTo(bx - s * 52, inner + 4); x.quadraticCurveTo(bx, Math.min(inner, outer) - 9, bx + s * 56, outer + 6); x.stroke();
    }
    // --- mouth
    x.save(); x.translate(256, 392); x.scale(1.45, 1.45); x.translate(-256, -392); this.mouth(x, 256, 392, smile, mOpen, mW, teeth); x.restore();
  }
  eye(x, ex, ey, s, open, lid, happy, pupil, squeeze) {
    x.save(); x.translate(ex, ey); x.scale(1.55, 1.55); x.translate(-ex, -ey);
    this.eye2(x, ex, ey, s, open, lid, happy, pupil, squeeze); x.restore();
  }
  eye2(x, ex, ey, s, open, lid, happy, pupil, squeeze) {
    const W = 50; // half width
    const lx = this.look[0] * 9, ly = this.look[1] * 6;
    x.lineCap = 'round'; x.lineJoin = 'round';
    if (squeeze > 0.5) { // >_<
      x.strokeStyle = '#1e1416'; x.lineWidth = 9;
      x.beginPath(); x.moveTo(ex - s * 38, ey - 22); x.lineTo(ex + s * 26, ey + 2); x.lineTo(ex - s * 38, ey + 22); x.stroke();
      // tear
      x.fillStyle = 'rgba(150,210,255,0.9)'; x.beginPath(); x.ellipse(ex + s * 40, ey + 26, 7, 11, 0, 0, 7); x.fill();
      return;
    }
    if (happy > 0.5) { // ^ ^ smiling eyes
      x.strokeStyle = '#1e1416'; x.lineWidth = 10;
      x.beginPath(); x.moveTo(ex - W, ey + 10); x.quadraticCurveTo(ex, ey - 34, ex + W, ey + 6); x.stroke();
      x.lineWidth = 4; x.beginPath(); x.moveTo(ex + s * W, ey + 6 * (s > 0 ? 1 : 1)); x.lineTo(ex + s * (W + 14), ey - 6); x.stroke();
      return;
    }
    const h = 38 * open;                    // opening height
    const topY = ey - h * (1 - lid * 0.55);  // upper lid apex (lid droops)
    const inner = [ex - s * W, ey + 4], outer = [ex + s * W, ey - 8];
    const lowY = ey + 8 + h * 0.32;
    x.save();
    // eye white clip
    x.beginPath(); x.moveTo(...inner);
    x.bezierCurveTo(ex - s * W * 0.5, topY, ex + s * W * 0.45, topY - 2, ...outer);
    x.bezierCurveTo(ex + s * W * 0.5, lowY, ex - s * W * 0.4, lowY + 2, ...inner); x.closePath();
    x.fillStyle = '#fbf7f6'; x.fill(); x.clip();
    // upper shadow on sclera
    x.fillStyle = 'rgba(160,120,140,0.35)'; x.fillRect(ex - W - 10, topY - 10, W * 2 + 20, 14);
    // iris
    const ir = 25 * Math.max(0.75, Math.min(1.05, open + 0.15)), icx = ex + lx + s * 3, icy = ey + 4 + ly;
    const g = x.createLinearGradient(0, icy - ir, 0, icy + ir);
    g.addColorStop(0, '#1a1410'); g.addColorStop(0.55, '#4a3a24'); g.addColorStop(1, '#a28a52');
    x.fillStyle = g; x.beginPath(); x.ellipse(icx, icy, ir * 0.82, ir, 0, 0, 7); x.fill();
    x.strokeStyle = '#140e0c'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#0b0807'; x.beginPath(); x.ellipse(icx, icy + 1, ir * 0.36 * pupil, ir * 0.48 * pupil, 0, 0, 7); x.fill();
    // highlights
    x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(icx - s * 8, icy - 10, 6, 7.5, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.arc(icx + s * 9, icy + 11, 3.5, 0, 7); x.fill();
    x.restore();
    // upper lash line (thick, winged)
    x.strokeStyle = '#140c0e'; x.lineWidth = 8;
    x.beginPath(); x.moveTo(inner[0], inner[1] + 1);
    x.bezierCurveTo(ex - s * W * 0.5, topY - 1, ex + s * W * 0.45, topY - 3, ...outer);
    x.lineTo(outer[0] + s * 14, outer[1] - 9); x.stroke();
    x.lineWidth = 3.5; x.beginPath(); x.moveTo(outer[0] - s * 4, outer[1] + 2); x.lineTo(outer[0] + s * 10, outer[1] + 1); x.stroke();
    // double eyelid crease
    x.strokeStyle = 'rgba(120,70,80,0.5)'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(ex - s * W * 0.7, topY - 2 - 8 * open); x.quadraticCurveTo(ex, topY - 13 - 8 * open, ex + s * W * 0.95, outer[1] - 12); x.stroke();
    // lower lash
    x.strokeStyle = 'rgba(60,30,36,0.7)'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(ex - s * W * 0.55, lowY + 1); x.quadraticCurveTo(ex + s * 8, lowY + 4, outer[0] - s * 4, outer[1] + 4); x.stroke();
  }
  mouth(x, mx, my, smile, open, w, teeth) {
    const hw = 30 * w + 8 * Math.max(0, smile);
    const curve = smile * 16;           // corners up when smiling
    const oh = open * 34;
    x.lineCap = 'round'; x.lineJoin = 'round';
    if (oh < 3) {
      x.strokeStyle = '#7a2c34'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(mx - hw, my - curve * 0.6); x.quadraticCurveTo(mx, my + curve * 0.9, mx + hw, my - curve * 0.6); x.stroke();
      if (smile > 0.5) { x.lineWidth = 3; x.beginPath(); x.moveTo(mx + hw - 2, my - curve * 0.6); x.lineTo(mx + hw + 6, my - curve * 0.6 - 6); x.stroke(); }
      return;
    }
    // open mouth shape
    const topC = my - curve * 0.5 - oh * 0.15, botC = my + oh + curve * 0.5;
    x.beginPath(); x.moveTo(mx - hw, my - curve * 0.6);
    x.quadraticCurveTo(mx, topC + curve * 0.5, mx + hw, my - curve * 0.6);
    x.quadraticCurveTo(mx + hw * 0.6, botC, mx, botC);
    x.quadraticCurveTo(mx - hw * 0.6, botC, mx - hw, my - curve * 0.6); x.closePath();
    x.fillStyle = '#5a1620'; x.fill();
    x.save(); x.clip();
    // tongue
    x.fillStyle = '#d0606a'; x.beginPath(); x.ellipse(mx, botC + 2, hw * 0.6, oh * 0.45, 0, 0, 7); x.fill();
    // upper teeth
    if (teeth > 0.1) { x.fillStyle = '#fffaf6'; x.beginPath(); x.moveTo(mx - hw, my - curve * 0.6 - 2); x.quadraticCurveTo(mx, topC + curve * 0.5 - 2, mx + hw, my - curve * 0.6 - 2); x.lineTo(mx + hw, my - curve * 0.6 + 7 * teeth); x.quadraticCurveTo(mx, topC + curve * 0.5 + 9 * teeth, mx - hw, my - curve * 0.6 + 7 * teeth); x.fill(); }
    x.restore();
    // lips (reddish, like the reference)
    x.strokeStyle = '#a8303c'; x.lineWidth = 4.5; x.stroke();
    x.strokeStyle = 'rgba(200,70,80,0.5)'; x.lineWidth = 6; x.beginPath(); x.moveTo(mx - hw * 0.5, botC + 5); x.quadraticCurveTo(mx, botC + 9, mx + hw * 0.5, botC + 5); x.stroke();
  }
}
