// Minimap (heading-up, corner) + full-screen north-up map. Canvas 2D; the city layer is cached and only redrawn when a building is destroyed.
const EXT = 150, PPM = 4; // world half-extent (m), pixels per metre in the cached layer
export class Minimap {
  constructor(world, mini, full) {
    this.world = world; this.mini = mini; this.full = full;
    this.layer = document.createElement('canvas'); this.layer.width = this.layer.height = EXT * 2 * PPM;
    this.alive = -1; this.t = 0;
  }
  w2c(x, z) { return [(x + EXT) * PPM, (z + EXT) * PPM]; }
  drawLayer() {
    const c = this.layer.getContext('2d'), W = this.layer.width;
    c.fillStyle = '#05060c'; c.fillRect(0, 0, W, W);
    c.fillStyle = '#3a3d4c'; c.fillRect(10 * PPM, 10 * PPM, W - 20 * PPM, W - 20 * PPM); // streets / alleys (everything that isn't a block)
    for (const p of this.world.parks) {
      const [x, y] = this.w2c(p.cx - p.w / 2, p.cz - p.d / 2);
      c.fillStyle = p.kind === 'park' ? '#1f5a30' : '#5a5466'; c.fillRect(x, y, p.w * PPM, p.d * PPM);
      if (p.kind === 'plaza') { c.fillStyle = '#3d8fc0'; c.beginPath(); c.arc(x + p.w * PPM / 2, y + p.d * PPM / 2, 3 * PPM, 0, 7); c.fill(); }
    }
    let n = 0;
    for (const b of this.world.buildings) {
      const [x, y] = this.w2c(b.x0, b.z0), w = (b.x1 - b.x0) * PPM, h = (b.z1 - b.z0) * PPM;
      if (b.alive) { n++; const v = Math.min(1, b.h / 30); c.fillStyle = `rgb(${120 + v * 70},${126 + v * 70},${150 + v * 70})`; c.fillRect(x + 1, y + 1, w - 2, h - 2); }
      else { c.fillStyle = '#6b3a2a'; c.fillRect(x + 1, y + 1, w - 2, h - 2); c.strokeStyle = '#a0583a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 3, y + 3); c.lineTo(x + w - 3, y + h - 3); c.moveTo(x + w - 3, y + 3); c.lineTo(x + 3, y + h - 3); c.stroke(); }
    }
    this.alive = n;
  }
  refresh() { let n = 0; for (const b of this.world.buildings) if (b.alive) n++; if (n !== this.alive) this.drawLayer(); }
  marker(c, x, y, sc, herR, mn = 5) {
    const pulse = (Math.sin(this.t * 6) + 1) / 2;
    c.fillStyle = `rgba(255,40,80,${0.25 + 0.25 * (1 - pulse)})`; c.beginPath(); c.arc(x, y, Math.max(mn * 1.5, herR * sc) + mn + pulse * mn * 2, 0, 7); c.fill();
    c.fillStyle = '#ff2a5a'; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, Math.max(mn, herR * sc), 0, 7); c.fill(); c.stroke();
  }
  arrow(c, x, y, ang, s) {
    c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = '#5ff2ff'; c.strokeStyle = '#003'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.7, s * 0.8); c.lineTo(0, s * 0.4); c.lineTo(-s * 0.7, s * 0.8); c.closePath(); c.fill(); c.stroke(); c.restore();
  }
  // player: {x,z,yaw}; her: {x,z,r}
  draw(dt, pl, her) {
    this.t += dt; this.refresh();
    const cv = this.mini, c = cv.getContext('2d'), S = cv.width, R = S / 2, zoom = 2.2 / PPM * (S / 150); // ~70 m across
    c.clearRect(0, 0, S, S); c.save(); c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.clip();
    c.fillStyle = '#05060c'; c.fillRect(0, 0, S, S);
    c.translate(R, R); c.rotate(pl.yaw); c.scale(zoom, zoom);
    const [px, py] = this.w2c(pl.x, pl.z); c.drawImage(this.layer, -px, -py);
    // her, in layer space
    const [hx, hy] = this.w2c(her.x, her.z); const sc = PPM;
    c.restore(); c.save(); c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.clip(); c.translate(R, R); c.rotate(pl.yaw);
    let mx = (hx - px) * zoom, my = (hy - py) * zoom; const ml = Math.hypot(mx, my), lim = R - 12;
    const off = ml > lim; if (off) { mx *= lim / ml; my *= lim / ml; }
    c.translate(mx, my); c.rotate(-pl.yaw); this.marker(c, 0, 0, off ? 0 : sc * zoom, off ? 0 : her.r, S / 30);
    c.restore();
    this.arrow(c, R, R, 0, S / 13);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.stroke();
    // north tick
    c.fillStyle = '#ffd36a'; c.font = `bold ${Math.round(S / 12)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', R + Math.sin(pl.yaw) * (R - S / 14), R - Math.cos(pl.yaw) * (R - S / 14));
  }
  drawFull(dt, pl, her) {
    this.t += dt; this.refresh();
    const cv = this.full, dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#05060c'; c.fillRect(0, 0, W, H);
    const s = Math.min(W, H) * 0.94 / this.layer.width, ox = (W - this.layer.width * s) / 2, oy = (H - this.layer.height * s) / 2;
    c.setTransform(s, 0, 0, s, ox, oy); c.drawImage(this.layer, 0, 0); c.setTransform(1, 0, 0, 1, 0, 0);
    const [hx, hy] = this.w2c(her.x, her.z); this.marker(c, ox + hx * s, oy + hy * s, PPM * s, her.r);
    const [px, py] = this.w2c(pl.x, pl.z); this.arrow(c, ox + px * s, oy + py * s, -pl.yaw, 11 * dpr);
  }
}
