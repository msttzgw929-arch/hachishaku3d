// Procedural canvas textures (knit, hair, asphalt, facades, signs...)
import * as THREE from 'three';

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function rand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// Ribbed knit: colour + normal map
export function makeKnit() {
  const W = 256, H = 256;
  const col = canvas(W, H), cx = col.getContext('2d');
  const hgt = new Float32Array(W * H);
  const R = rand(7);
  const RIB = 8; // px per rib
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rx = (x % RIB) / RIB;               // 0..1 across rib
    const rib = Math.sin(rx * Math.PI);        // rounded rib
    // stitch "V" chevrons along rib
    const row = (y % 6) / 6;
    const side = rx < 0.5 ? rx * 2 : (1 - rx) * 2;
    const v = Math.abs(((row + side * 0.5) % 1) - 0.5) * 2;
    hgt[y * W + x] = rib * 0.75 + v * 0.18 * rib + (R() - 0.5) * 0.06;
  }
  const img = cx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const h = hgt[i];
    const c = 224 + h * 31;
    img.data[i * 4] = c; img.data[i * 4 + 1] = c; img.data[i * 4 + 2] = c * 0.985 + 2; img.data[i * 4 + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const nor = canvas(W, H), nx = nor.getContext('2d'); const nimg = nx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hL = hgt[y * W + (x + W - 1) % W], hR = hgt[y * W + (x + 1) % W];
    const hU = hgt[((y + H - 1) % H) * W + x], hD = hgt[((y + 1) % H) * W + x];
    let dx = (hL - hR) * 2.2, dy = (hD - hU) * 2.2, dz = 1;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const i = (y * W + x) * 4;
    nimg.data[i] = (dx * 0.5 + 0.5) * 255; nimg.data[i + 1] = (dy * 0.5 + 0.5) * 255; nimg.data[i + 2] = (dz * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255;
  }
  nx.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace;
  const nmap = new THREE.CanvasTexture(nor);
  for (const t of [map, nmap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return { map, nmap };
}

export function makeHair() {
  const W = 256, H = 256, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#121218'; x.fillRect(0, 0, W, H);
  const R = rand(3);
  for (let i = 0; i < 900; i++) {
    const px = R() * W, a = 0.04 + R() * 0.12, l = R() > 0.5;
    x.strokeStyle = l ? `rgba(120,120,150,${a})` : `rgba(0,0,0,${a * 2})`;
    x.lineWidth = 0.5 + R() * 1.5;
    x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + (R() - .5) * 6, H * .3, px + (R() - .5) * 6, H * .6, px + (R() - .5) * 4, H); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function makeAsphalt() {
  const W = 512, c = canvas(W, W), x = c.getContext('2d'); const R = rand(11);
  x.fillStyle = '#26272c'; x.fillRect(0, 0, W, W);
  const img = x.getImageData(0, 0, W, W);
  for (let i = 0; i < W * W; i++) { const n = (R() - 0.5) * 26; img.data[i * 4] += n; img.data[i * 4 + 1] += n; img.data[i * 4 + 2] += n; }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) { // wet patches / stains
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); const px = R() * W, py = R() * W, r = 20 + R() * 70;
    x.save(); x.translate(px, py); x.scale(r, r * (0.5 + R()));
    g.addColorStop(0, 'rgba(10,10,14,0.35)'); g.addColorStop(1, 'rgba(10,10,14,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore();
  }
  for (let i = 0; i < 25; i++) { x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1 + R() * 1.5; x.beginPath(); let px = R() * W, py = R() * W; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (R() - .5) * 50; py += (R() - .5) * 50; x.lineTo(px, py); } x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

// rough map for asphalt (wet puddles = low roughness)
export function makeAsphaltRough() {
  const W = 256, c = canvas(W, W), x = c.getContext('2d'); const R = rand(5);
  x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, W, W);
  for (let i = 0; i < 18; i++) { const px = R() * W, py = R() * W, r = 10 + R() * 40; const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, '#202020'); g.addColorStop(0.7, '#404040'); g.addColorStop(1, 'rgba(200,200,200,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// building facade with 8x8 window tiles. returns {map, emissive}
export function makeFacade(seed, base, style) {
  const T = 64, N = 8, W = T * N; const R = rand(seed);
  const c = canvas(W, W), x = c.getContext('2d'); const e = canvas(W, W), ex = e.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, W, W); ex.fillStyle = '#000'; ex.fillRect(0, 0, W, W);
  // concrete noise / grime streaks
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.08})`; x.fillRect(R() * W, R() * W, 2 + R() * 20, 2 + R() * 40); }
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,255,255,${R() * 0.04})`; x.fillRect(R() * W, R() * W, 2 + R() * 30, 2 + R() * 10); }
  const warm = ['#ffd9a0', '#ffe8c0', '#fff4e0', '#cfe6ff', '#ffc890', '#e0f0ff'];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const px = i * T, py = j * T;
    // floor slab line
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(px, py + T - 5, T, 3);
    let wx, wy, ww, wh;
    if (style === 0) { wx = px + 10; wy = py + 12; ww = T - 20; wh = T - 28; }
    else if (style === 1) { wx = px + 4; wy = py + 16; ww = T - 8; wh = T - 32; }
    else { wx = px + 18; wy = py + 10; ww = T - 36; wh = T - 22; }
    const lit = R() < 0.32;
    if (lit) {
      const col = warm[(R() * warm.length) | 0];
      x.fillStyle = col; x.fillRect(wx, wy, ww, wh);
      ex.fillStyle = col; ex.globalAlpha = 0.55 + R() * 0.45; ex.fillRect(wx, wy, ww, wh); ex.globalAlpha = 1;
      // curtain / blinds
      if (R() < 0.6) { x.fillStyle = 'rgba(80,50,30,0.35)'; ex.fillStyle = 'rgba(0,0,0,0.5)'; const cw = ww * (0.2 + R() * 0.3); x.fillRect(wx, wy, cw, wh); ex.fillRect(wx, wy, cw, wh); }
      if (R() < 0.4) { ex.fillStyle = 'rgba(0,0,0,0.45)'; for (let b = 0; b < wh; b += 4) ex.fillRect(wx, wy + b, ww, 1.5); }
    } else {
      const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh); g.addColorStop(0, '#1c2230'); g.addColorStop(1, '#0c0f16'); x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(140,160,200,0.12)'; x.fillRect(wx + 2, wy + 2, ww * 0.4, wh - 4);
    }
    x.strokeStyle = 'rgba(30,30,30,0.9)'; x.lineWidth = 2; x.strokeRect(wx, wy, ww, wh);
    if (style !== 1) { x.beginPath(); x.moveTo(wx + ww / 2, wy); x.lineTo(wx + ww / 2, wy + wh); x.stroke(); }
    // AC unit / balcony rail
    if (R() < 0.12) { x.fillStyle = '#b8b8b0'; x.fillRect(wx + ww - 18, py + T - 20, 16, 12); x.fillStyle = '#555'; x.beginPath(); x.arc(wx + ww - 10, py + T - 14, 4, 0, 7); x.fill(); }
  }
  const map = new THREE.CanvasTexture(c), em = new THREE.CanvasTexture(e);
  for (const t of [map, em]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return { map, emissive: em };
}

export function makeSignTex(text, color, vertical, bg = '#0a0a12', sub = '') {
  const W = vertical ? 128 : 512, H = vertical ? 512 : 128;
  const c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.strokeStyle = color; x.lineWidth = 6; x.shadowColor = color; x.shadowBlur = 16; x.strokeRect(8, 8, W - 16, H - 16);
  x.fillStyle = '#fff'; x.shadowBlur = 22;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const font = '"Noto Sans CJK JP","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif';
  if (vertical) {
    const chars = [...text]; const fs = Math.min(92, (H - 40) / chars.length);
    x.font = `900 ${fs}px ${font}`;
    chars.forEach((ch, i) => { x.fillStyle = color; x.fillText(ch, W / 2, 24 + fs / 2 + i * fs); x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillText(ch, W / 2, 24 + fs / 2 + i * fs); });
  } else {
    x.font = `900 ${Math.min(80, 440 / [...text].length)}px ${font}`;
    x.fillStyle = color; x.fillText(text, W / 2, H / 2 - (sub ? 10 : 0)); x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillText(text, W / 2, H / 2 - (sub ? 10 : 0));
    if (sub) { x.font = `700 22px ${font}`; x.fillStyle = color; x.fillText(sub, W / 2, H - 26); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function makeVending(seed) {
  const W = 128, H = 256, c = canvas(W, H), x = c.getContext('2d'); const R = rand(seed);
  const bodyCols = ['#d01c24', '#1c4fd0', '#f2f2f2', '#1a9a4a'];
  x.fillStyle = bodyCols[seed % 4]; x.fillRect(0, 0, W, H);
  x.fillStyle = '#dff4ff'; x.fillRect(8, 10, W - 16, 140);
  const cans = ['#e33', '#36f', '#fc3', '#3c6', '#f80', '#fff', '#a3f', '#333'];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) {
    x.fillStyle = cans[(R() * cans.length) | 0]; x.fillRect(12 + i * 18, 16 + r * 34, 12, 22);
    x.fillStyle = '#222'; x.fillRect(12 + i * 18, 40 + r * 34, 12, 4); x.fillStyle = '#3f3'; x.fillRect(13 + i * 18, 41 + r * 34, 3, 2);
  }
  x.fillStyle = '#111'; x.fillRect(16, 200, W - 32, 26);
  x.fillStyle = '#333'; x.fillRect(W - 30, 160, 16, 30);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const e = canvas(W, H), ex = e.getContext('2d'); ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H); ex.drawImage(c, 8, 10, W - 16, 140, 8, 10, W - 16, 140);
  const em = new THREE.CanvasTexture(e); em.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive: em };
}

export function makeGlow() {
  const c = canvas(128, 128), x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
export function makeDust() {
  const c = canvas(64, 64), x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(200,190,180,0.9)'); g.addColorStop(0.6, 'rgba(160,150,140,0.35)'); g.addColorStop(1, 'rgba(120,110,100,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
