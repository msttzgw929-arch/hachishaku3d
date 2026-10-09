// Night-time Japanese town: roads, alleys, breakable buildings, props, debris physics, path grid.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const R = rng(20260109);
const pick = (a) => a[(R() * a.length) | 0];

export const ROADS = [-126, -98, -70, -42, -14, 14, 42, 70, 98, 126];
const ROAD_W = 8, HALF = 140;
export const BOUND = 138;

const SIGNS = [['クリニック', '#4cc4ff'], ['ラーメン', '#ff3b3b'], ['スナック夜蝶', '#ff4fd8'], ['カラオケ', '#ffd23b'], ['居酒屋', '#ff7a2b'], ['くすり', '#3bff8a'],
  ['焼き鳥', '#ff5a3b'], ['喫茶', '#ffb84c'], ['質屋', '#5ab0ff'], ['マッサージ', '#ff6fa8'], ['ホテル', '#b45aff'], ['古本', '#9cff5a'], ['麻雀', '#3bffd2'], ['整骨院', '#5af0ff'], ['バー', '#ff3b9a'], ['うどん', '#ffe03b']];
const SHOPS = [['コンビニ', '#3bd16f', '24時間営業'], ['ラーメン', '#ff3b3b', '深夜営業'], ['居酒屋', '#ff8a2b', '飲み放題'], ['スナック', '#d05aff', 'ご新規様歓迎'], ['CLINIC', '#4cc4ff', '内科・小児科'], ['薬局', '#3bff8a', 'お薬'], ['カラオケ', '#ffd23b', '1時間390円']];

export class World {
  constructor(scene) {
    this.scene = scene;
    this.buildings = []; this.props = []; this.debris = []; this.dust = []; this.lamps = []; this.wires = [];
    this.group = new THREE.Group(); scene.add(this.group);
    this.makeMaterials();
    this.makeGround();
    this.makeBuildings();
    this.makeStreetProps();
    this.makeSkyline();
    this.buildGrid();
  }

  makeMaterials() {
    const bases = ['#6b6862', '#7d776c', '#55585e', '#8a8073', '#5e5a55', '#6f7277', '#7a6a5d', '#4b4e55'];
    this.facades = bases.map((b, i) => { const t = TX.makeFacade(100 + i, b, i % 3); return new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0.95, roughness: 0.85 }); });
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0x2c2d31, roughness: 0.95 });
    this.concrete = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.9 });
    this.metal = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.6 });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.8 });
    this.rubbleMat = new THREE.MeshStandardMaterial({ color: 0x4d4a46, roughness: 1 });
    this.glowTex = TX.makeGlow(); this.dustTex = TX.makeDust();
    this.vendMats = [0, 1, 2, 3].map(i => { const t = TX.makeVending(i); return new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.4 }); });
    this.signMats = SIGNS.map(([t, c]) => new THREE.MeshStandardMaterial({ map: TX.makeSignTex(t, c, true), emissiveMap: TX.makeSignTex(t, c, true), emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.4 }));
    this.shopMats = SHOPS.map(([t, c, sub]) => { const tx = TX.makeSignTex(t, c, false, '#101018', sub); return new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 1.2 }); });
    // shop window (lit interior)
    const c = TX.canvas(256, 128), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#fff6e0'); g.addColorStop(1, '#d8c8a0'); x.fillStyle = g; x.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 14; i++) { x.fillStyle = `hsl(${R() * 360},50%,${40 + R() * 30}%)`; x.fillRect(R() * 240, 40 + R() * 60, 10 + R() * 30, 20 + R() * 40); }
    x.fillStyle = '#333'; for (let i = 0; i < 256; i += 64) x.fillRect(i, 0, 4, 128);
    const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace;
    this.windowMat = new THREE.MeshStandardMaterial({ map: st, emissiveMap: st, emissive: 0xffffff, emissiveIntensity: 0.42, roughness: 0.3 });
    // shutter
    const c2 = TX.canvas(64, 64), x2 = c2.getContext('2d'); x2.fillStyle = '#7d8086'; x2.fillRect(0, 0, 64, 64); for (let i = 0; i < 64; i += 4) { x2.fillStyle = 'rgba(0,0,0,0.35)'; x2.fillRect(0, i, 64, 1.5); }
    x2.fillStyle = 'rgba(255,60,90,0.35)'; x2.font = 'bold 14px sans-serif'; x2.fillText('ﾗｸｶﾞｷ', 6, 40);
    const shT = new THREE.CanvasTexture(c2); shT.colorSpace = THREE.SRGBColorSpace; shT.wrapS = THREE.RepeatWrapping;
    this.shutterMat = new THREE.MeshStandardMaterial({ map: shT, roughness: 0.6, metalness: 0.4 });
  }

  makeGround() {
    const asp = TX.makeAsphalt(), rough = TX.makeAsphaltRough();
    asp.repeat.set(66, 66); rough.repeat.set(38, 38);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 60, HALF * 2 + 60), new THREE.MeshStandardMaterial({ map: asp, roughnessMap: rough, roughness: 0.75, metalness: 0.15, color: 0xb0b0b8 }));
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; this.group.add(g);
    // block pavements (concrete tiles), road markings
    const pav = [], marks = [];
    const bl = this.blocks = [];
    const edges = [-HALF, ...ROADS, HALF];
    for (let i = 0; i < edges.length - 1; i++) for (let j = 0; j < edges.length - 1; j++) {
      const x0 = edges[i] + (i === 0 ? 0 : ROAD_W / 2), x1 = edges[i + 1] - (i === edges.length - 2 ? 0 : ROAD_W / 2);
      const z0 = edges[j] + (j === 0 ? 0 : ROAD_W / 2), z1 = edges[j + 1] - (j === edges.length - 2 ? 0 : ROAD_W / 2);
      bl.push({ x0, x1, z0, z1 });
      const p = new THREE.BoxGeometry(x1 - x0, 0.14, z1 - z0); p.translate((x0 + x1) / 2, 0.07, (z0 + z1) / 2);
      const uv = p.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (x1 - x0) / 2, uv.getY(k) * (z1 - z0) / 2);
      pav.push(p);
    }
    const tc = TX.canvas(128, 128), tx = tc.getContext('2d'); tx.fillStyle = '#56575a'; tx.fillRect(0, 0, 128, 128); tx.strokeStyle = '#3a3b3e'; tx.lineWidth = 3; tx.strokeRect(0, 0, 128, 128); tx.strokeRect(0, 0, 64, 64); tx.strokeRect(64, 64, 64, 64);
    for (let k = 0; k < 300; k++) { tx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; tx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
    const tt = new THREE.CanvasTexture(tc); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.Mesh(mergeGeometries(pav), new THREE.MeshStandardMaterial({ map: tt, roughness: 0.7, metalness: 0.1 }));
    pm.receiveShadow = true; this.group.add(pm);
    for (const r of ROADS) {
      for (let t = -HALF; t < HALF; t += 6) {
        if (ROADS.some(q => Math.abs(t + 1.5 - q) < ROAD_W / 2 + 1)) continue;
        const a = new THREE.PlaneGeometry(0.18, 3); a.rotateX(-Math.PI / 2); a.translate(r, 0.02, t + 1.5); marks.push(a);
        const b = new THREE.PlaneGeometry(3, 0.18); b.rotateX(-Math.PI / 2); b.translate(t + 1.5, 0.02, r); marks.push(b);
      }
      for (const q of ROADS) for (let k = -3; k <= 3; k++) { // crosswalks
        for (const [dx, dz, rot] of [[k * 0.9, ROAD_W / 2 + 1.4, 0], [k * 0.9, -ROAD_W / 2 - 1.4, 0], [ROAD_W / 2 + 1.4, k * 0.9, 1], [-ROAD_W / 2 - 1.4, k * 0.9, 1]]) {
          const c = new THREE.PlaneGeometry(rot ? 2.2 : 0.45, rot ? 0.45 : 2.2); c.rotateX(-Math.PI / 2); c.translate(r + dx, 0.02, q + dz); marks.push(c);
        }
      }
    }
    const mm = new THREE.Mesh(mergeGeometries(marks), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.6, emissive: 0x222222 }));
    mm.receiveShadow = true; this.group.add(mm);
    // sky dome
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {}, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.09,0.07,0.16), vec3(0.015,0.02,0.06), smoothstep(0.0,0.5,h)); c += vec3(0.25,0.08,0.18)*exp(-abs(h)*14.0)*0.6; gl_FragColor = vec4(c,1.0); }'
    }));
    this.group.add(sky);
    // moon
    const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xfff2d8, fog: false }));
    moon.position.set(-160, 170, -260); moon.lookAt(0, 0, 0); this.group.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x8899ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
    halo.scale.set(80, 80, 1); halo.position.copy(moon.position); this.group.add(halo);
  }

  makeBuildings() {
    this.parks = [];
    for (const b of this.blocks) {
      const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      // open spaces: a central plaza, scattered parks and small plazas
      if (Math.abs(cx) < 5 && Math.abs(cz) < 5) { this.makePlaza(b, true); continue; }
      const edge = b.x0 <= -HALF + 0.1 || b.x1 >= HALF - 0.1 || b.z0 <= -HALF + 0.1 || b.z1 >= HALF - 0.1;
      const r = R();
      if (!edge && r < 0.11) { this.makePark(b); continue; }
      if (!edge && r < 0.17) { this.makePlaza(b, false); continue; }
      // split block into lots with narrow alleys (2.8 - 3.6 m); some blocks get a denser 3x3 alley grid
      const n = R() < 0.32 ? 3 : 2;
      const cuts = (a0, a1) => { const out = []; let prev = a0; for (let k = 1; k < n; k++) { const al = 2.8 + R() * 0.8; const c = a0 + (a1 - a0) * (k / n + (R() - 0.5) * 0.12); out.push([prev, c - al / 2]); prev = c + al / 2; } out.push([prev, a1]); return out; };
      const xs = cuts(b.x0, b.x1), zs = cuts(b.z0, b.z1);
      for (const [x0, x1] of xs) for (const [z0, z1] of zs) {
        const lw = x1 - x0, ld = z1 - z0;
        if (lw < 3 || ld < 3) continue;
        const parts = [];
        if (Math.max(lw, ld) > 12 && R() < 0.7) {
          if (lw > ld) { const m = x0 + lw * (0.4 + R() * 0.2); parts.push([x0, m - 0.7, z0, z1], [m + 0.7, x1, z0, z1]); }
          else { const m = z0 + ld * (0.4 + R() * 0.2); parts.push([x0, x1, z0, m - 0.7], [x0, x1, m + 0.7, z1]); }
        } else parts.push([x0, x1, z0, z1]);
        for (const p of parts) {
          if (R() < 0.08) { this.makeParking(p); continue; }
          this.makeBuilding(p);
        }
      }
    }
  }

  parkAssets() {
    if (this._pa) return this._pa;
    const col = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const strip = (g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };
    const trunk = strip(new THREE.CylinderGeometry(0.16, 0.24, 2.6, 8)); trunk.translate(0, 1.3, 0); col(trunk, 0x3a2a20);
    const leaves = [];
    for (const [x, y, z, r, c] of [[0, 3.4, 0, 1.7, 0x1f3b26], [0.8, 3.0, 0.3, 1.2, 0x24452c], [-0.7, 3.1, -0.4, 1.25, 0x1b3522], [0.1, 4.3, 0.1, 1.15, 0x2a4f33]]) { const g = strip(new THREE.IcosahedronGeometry(r, 1)); g.translate(x, y, z); leaves.push(col(g, c)); }
    const tree = mergeGeometries([trunk, ...leaves]);
    // cherry tree variant (pink, like a Japanese park at night)
    const sak = mergeGeometries([trunk.clone(), ...leaves.map((g, i) => col(g.clone(), [0xc98aa0, 0xd99ab0, 0xb87890, 0xe8b0c4][i]))]);
    const benchParts = [new THREE.BoxGeometry(1.8, 0.08, 0.5), new THREE.BoxGeometry(1.8, 0.45, 0.06), new THREE.BoxGeometry(0.08, 0.45, 0.45), new THREE.BoxGeometry(0.08, 0.45, 0.45)];
    benchParts[0].translate(0, 0.45, 0); benchParts[1].translate(0, 0.75, -0.22); benchParts[2].translate(-0.8, 0.22, 0); benchParts[3].translate(0.8, 0.22, 0);
    const bench = mergeGeometries(benchParts.map(strip).map((g, i) => col(g, i < 2 ? 0x6b4a32 : 0x3a3a3e)));
    const torii = (() => { const p = [new THREE.CylinderGeometry(0.22, 0.25, 4.2, 10), new THREE.CylinderGeometry(0.22, 0.25, 4.2, 10), new THREE.BoxGeometry(5.0, 0.35, 0.5), new THREE.BoxGeometry(4.2, 0.25, 0.35)];
      p[0].translate(-1.7, 2.1, 0); p[1].translate(1.7, 2.1, 0); p[2].translate(0, 4.35, 0); p[3].translate(0, 3.5, 0); return mergeGeometries(p.map(strip).map((g, i) => col(g, i === 2 ? 0x1a1a1a : 0xb3261e))); })();
    const fountain = (() => { const p = [new THREE.CylinderGeometry(3.0, 3.1, 0.6, 32), new THREE.CylinderGeometry(0.5, 0.7, 1.6, 16), new THREE.CylinderGeometry(1.2, 0.9, 0.25, 24)];
      p[0].translate(0, 0.3, 0); p[1].translate(0, 0.8, 0); p[2].translate(0, 1.6, 0); return mergeGeometries(p.map(strip).map(g => col(g, 0x8a8a90))); })();
    const lampP = (() => { const a = strip(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8)); a.translate(0, 1.6, 0); return col(a, 0x2a2a2e); })();
    const veg = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const sakMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, emissive: 0x2a0c18, emissiveIntensity: 0.6 });
    const globe = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d0, emissiveIntensity: 3 });
    const water = new THREE.MeshStandardMaterial({ color: 0x2a6a8a, emissive: 0x0a3a5a, emissiveIntensity: 0.8, roughness: 0.1, metalness: 0.3 });
    const gc = TX.canvas(128, 128), gx = gc.getContext('2d'); gx.fillStyle = '#1d3320'; gx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) { gx.fillStyle = `rgba(${40 + Math.random() * 40},${70 + Math.random() * 60},${40 + Math.random() * 30},0.6)`; gx.fillRect(Math.random() * 128, Math.random() * 128, 1, 2 + Math.random() * 2); }
    const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.colorSpace = THREE.SRGBColorSpace;
    const grass = new THREE.MeshStandardMaterial({ map: gt, roughness: 0.95 });
    const path = new THREE.MeshStandardMaterial({ color: 0x8a7f6c, roughness: 0.9 });
    return (this._pa = { tree, sak, bench, torii, fountain, lampP, veg, sakMat, globe, water, grass, path });
  }
  addParkLamp(x, z) {
    const A = this.parkAssets();
    const m = new THREE.Mesh(A.lampP, A.veg); m.position.set(x, 0, z);
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), A.globe); g.position.y = 3.3; m.add(g); this.group.add(m);
    const lp = this.addProp(m, 0.15, 1, 'lamp');
    this.lamps.push({ pos: new THREE.Vector3(x, 3.3, z), obj: null, color: new THREE.Color(0xfff0d0), power: 1.0, prop: lp });
  }
  addBench(x, z, rot) { const A = this.parkAssets(); const m = new THREE.Mesh(A.bench, A.veg); m.position.set(x, 0.14, z); m.rotation.y = rot; m.castShadow = true; this.group.add(m); this.addProp(m, 0.6, 1, 'small'); }
  makePark(b) {
    const A = this.parkAssets(); const m = 0.8, x0 = b.x0 + m, x1 = b.x1 - m, z0 = b.z0 + m, z1 = b.z1 - m, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    const gg = new THREE.BoxGeometry(w, 0.12, d); const uv = gg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 4, uv.getY(k) * d / 4);
    const gm = new THREE.Mesh(gg, A.grass); gm.position.set(cx, 0.2, cz); gm.receiveShadow = true; this.group.add(gm);
    for (const [pw, pd] of [[w, 2.4], [2.4, d]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.04, pd), A.path); p.position.set(cx, 0.27, cz); p.receiveShadow = true; this.group.add(p); }
    const sakura = R() < 0.5;
    for (let gx = x0 + 2.5; gx < x1 - 1.5; gx += 4.6) for (let gz = z0 + 2.5; gz < z1 - 1.5; gz += 4.6) {
      if (Math.abs(gx - cx) < 2.4 || Math.abs(gz - cz) < 2.4 || R() < 0.2) continue;
      const tx = gx + (R() - 0.5) * 1.6, tz = gz + (R() - 0.5) * 1.6, sk = sakura && R() < 0.75;
      const t = new THREE.Mesh(sk ? A.sak : A.tree, sk ? A.sakMat : A.veg); t.position.set(tx, 0.2, tz); t.rotation.y = R() * 6.28; t.scale.setScalar(0.8 + R() * 0.5); t.castShadow = true; this.group.add(t);
      this.addProp(t, 0.45, 1, 'tree');
    }
    for (const [bx, bz, r] of [[cx + 3.2, cz + 1.8, Math.PI], [cx - 3.2, cz - 1.8, 0], [cx + 1.8, cz - 3.2, -Math.PI / 2], [cx - 1.8, cz + 3.2, Math.PI / 2]]) if (R() < 0.8) this.addBench(bx, bz, r);
    this.addParkLamp(cx + 1.6, cz + 1.6); this.addParkLamp(cx - 1.6, cz - 1.6);
    if (R() < 0.45) { const t = new THREE.Mesh(A.torii, A.veg); t.position.set(cx, 0.2, z1 - 1.2); t.castShadow = true; this.group.add(t); this.addProp(t, 0.4, 2, 'torii', false); }
    this.parks.push({ kind: 'park', cx, cz, w, d });
  }
  makePlaza(b, big) {
    const A = this.parkAssets(); const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    // tiled plaza floor (slightly lighter inlay ring)
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 7.2, 48), new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 0.8 })); ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.15, cz); ring.receiveShadow = true; this.group.add(ring);
    const f = new THREE.Mesh(A.fountain, A.veg); f.position.set(cx, 0.14, cz); f.castShadow = true; f.receiveShadow = true; this.group.add(f); this.addProp(f, 3.1, big ? 3 : 2, 'fountain');
    const wtr = new THREE.Mesh(new THREE.CircleGeometry(2.85, 32), A.water); wtr.rotation.x = -Math.PI / 2; wtr.position.y = 0.5; f.add(wtr);
    this.lamps.push({ pos: new THREE.Vector3(cx, 1.2, cz), obj: null, color: new THREE.Color(0x6ac8ff), power: 0.7, prop: this.props[this.props.length - 1] });
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.39; this.addBench(cx + Math.cos(a) * 5.4, cz + Math.sin(a) * 5.4, -a - Math.PI / 2); }
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) this.addParkLamp(cx + sx * (w / 2 - 2), cz + sz * (d / 2 - 2));
    for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(A.tree, A.veg); const a = k / 4 * Math.PI * 2; t.position.set(cx + Math.cos(a) * (w / 2 - 3.5), 0.14, cz + Math.sin(a) * (d / 2 - 3.5)); t.scale.setScalar(0.85); t.castShadow = true; this.group.add(t); this.addProp(t, 0.45, 1, 'tree'); }
    if (big) for (let k = 0; k < 3; k++) this.addVendingFree(b.x0 + 2 + k * 1.1, b.z1 - 1.2, Math.PI);
    this.parks.push({ kind: 'plaza', cx, cz, w, d });
  }

  nearestRoadSide(cx, cz, hw, hd) {
    // returns face normal (nx,nz) of the side that faces the closest road
    let best = null, bd = 1e9;
    for (const r of ROADS) {
      const cands = [[Math.abs(r - (cx + hw)), 1, 0, r > cx], [Math.abs(r - (cx - hw)), -1, 0, r < cx], [Math.abs(r - (cz + hd)), 0, 1, r > cz], [Math.abs(r - (cz - hd)), 0, -1, r < cz]];
      for (const [dd, nx, nz, ok] of cands) if (ok && dd < bd) { bd = dd; best = [nx, nz]; }
    }
    return { n: best || [0, 1], dist: bd };
  }

  makeBuilding([x0, x1, z0, z1]) {
    const m = 0.2; x0 += m; x1 -= m; z0 += m; z1 -= m;
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const centrality = 1 - Math.min(1, Math.hypot(cx, cz) / 150);
    const h = Math.round((5 + R() * 9 + R() * R() * 22 * (0.4 + centrality)) / 3.2) * 3.2 + 0.4;
    const grp = new THREE.Group(); grp.position.set(cx, 0, cz);
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const off = [R(), R()];
    for (let f = 0; f < 6; f++) {
      const fw = (f < 2) ? d : w; const fh = (f === 2 || f === 3) ? d : h;
      for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, off[0] + uv.getX(i) * fw / 32, off[1] + uv.getY(i) * fh / 25.6); }
    }
    geo.translate(0, h / 2, 0);
    const fm = pick(this.facades);
    const mesh = new THREE.Mesh(geo, [fm, fm, this.roofMat, this.roofMat, fm, fm]);
    mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh);
    // parapet & roof clutter
    const par = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.5, d + 0.2), this.concrete); par.position.y = h + 0.25; grp.add(par);
    if (R() < 0.5) { const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 12), this.metal); tank.position.set((R() - 0.5) * w * 0.5, h + 1.3, (R() - 0.5) * d * 0.5); grp.add(tank); }
    const side = this.nearestRoadSide(cx, cz, w / 2, d / 2); const [nx, nz] = side.n;
    const faceW = nx ? d : w, faceOff = nx ? w / 2 : d / 2;
    const rotY = Math.atan2(nx, nz);
    const front = new THREE.Group(); front.rotation.y = rotY; grp.add(front);
    // ground floor: shop or shutter
    const kind = R();
    if (kind < 0.55) {
      const sm = pick(this.shopMats);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(faceW * 0.8, 2.2), this.windowMat); win.position.set(0, 1.3, faceOff + 0.02); front.add(win);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(faceW * 0.85, 0.8, 0.15), [this.dark, this.dark, this.dark, this.dark, sm, this.dark]); sign.position.set(0, 2.85, faceOff + 0.1); front.add(sign);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(faceW * 0.85, 0.06, 1.0), new THREE.MeshStandardMaterial({ color: pick([0x8a1e1e, 0x1e4a8a, 0x2a6a2a, 0x6a2a6a]), roughness: 0.7 })); awn.position.set(0, 2.42, faceOff + 0.55); awn.rotation.x = 0.2; front.add(awn);
      if (R() < 0.6) this.addVending(grp, rotY, faceOff + 0.55, faceW * 0.5 - 0.6);
    } else {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(faceW * 0.7, 2.6), this.shutterMat); sh.material.map.repeat.set(1, 1); sh.position.set(0, 1.3, faceOff + 0.02); front.add(sh);
      if (R() < 0.35) this.addVending(grp, rotY, faceOff + 0.55, -faceW * 0.5 + 0.7);
    }
    // vertical neon signs
    const nSigns = h > 9 ? 1 + (R() < 0.5 ? 1 : 0) : (R() < 0.6 ? 1 : 0);
    for (let s = 0; s < nSigns; s++) {
      const sh = Math.min(h - 4, 3.2 + R() * 4); if (sh < 2) break;
      const mat = pick(this.signMats);
      const sg = new THREE.Mesh(new THREE.BoxGeometry(0.22, sh, 0.85), [mat, mat, this.dark, this.dark, this.dark, this.dark]);
      const lx = (s === 0 ? 1 : -1) * (faceW / 2 - 0.6);
      sg.position.set(lx, 3.6 + sh / 2 + R() * Math.max(0, h - sh - 5) * 0.5, faceOff + 0.55); front.add(sg);
      this.lamps.push({ pos: new THREE.Vector3(), obj: sg, color: new THREE.Color(SIGNS[this.signMats.indexOf(mat)][1]), power: 0.9, building: null });
    }
    // AC units / pipes on side walls
    for (let k = 0; k < 2; k++) { if (R() < 0.5) continue; const ac = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.35), this.concrete); ac.position.set((R() - 0.5) * (faceW - 2), 3.5 + R() * (h - 5), faceOff + 0.18); front.add(ac); }
    this.group.add(grp);
    const toughness = h < 10 ? 1 : h < 17 ? 2 : 3;
    const bld = { grp, mesh, mat: fm, x0, x1, z0, z1, w, d, h, cx, cz, alive: true, toughness, collapse: -1 };
    grp.userData.b = bld;
    for (const l of this.lamps) if (l.obj && l.building === null && l.obj.parent && l.obj.parent.parent === grp) l.building = bld;
    this.buildings.push(bld);
  }

  addVending(grp, rotY, off, lx) {
    const mat = pick(this.vendMats);
    const v = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.85, 0.75), [this.metal, this.metal, this.metal, this.metal, mat, this.metal]);
    const lp = new THREE.Vector3(lx, 0.925, off).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    v.position.copy(lp).add(grp.position); v.rotation.y = rotY; v.castShadow = true;
    this.group.add(v);
    this.addProp(v, 0.55, 1, 'vend');
    this.lamps.push({ pos: v.position.clone().add(new THREE.Vector3(Math.sin(rotY), 0.3, Math.cos(rotY))), obj: null, color: new THREE.Color(0xd8f0ff), power: 0.55, prop: this.props[this.props.length - 1] });
  }

  addProp(mesh, r, minStage, kind, solid = true) {
    const p = { mesh, r, alive: true, minStage, kind, solid, x: mesh.position.x, z: mesh.position.z };
    this.props.push(p); return p;
  }

  makeParking([x0, x1, z0, z1]) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const fence = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.9, 0.05), this.metal); fence.position.set(cx, 0.45, z0 + 0.2); this.group.add(fence);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.1), this.shopMats[6]); sign.position.set(x0 + 1, 2.4, z0 + 0.3); this.group.add(sign);
    for (let i = 0; i < 3; i++) this.addVendingFree(x0 + 1.2 + i * 1.1, z1 - 0.8, Math.PI);
  }
  addVendingFree(x, z, rotY) {
    const mat = pick(this.vendMats);
    const v = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.85, 0.75), [this.metal, this.metal, this.metal, this.metal, mat, this.metal]);
    v.position.set(x, 0.925, z); v.rotation.y = rotY; v.castShadow = true; this.group.add(v); this.addProp(v, 0.55, 1, 'vend');
  }

  makeStreetProps() {
    // utility poles (one side) + street lamps (other side) along every road
    const poleGeo = (() => {
      const a = new THREE.CylinderGeometry(0.13, 0.18, 9, 8); a.translate(0, 4.5, 0);
      const b = new THREE.BoxGeometry(1.8, 0.12, 0.12); b.translate(0, 8.2, 0);
      const c = new THREE.BoxGeometry(1.2, 0.1, 0.1); c.translate(0, 7.4, 0);
      const t = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10); t.translate(0.4, 6.4, 0);
      const s = new THREE.BoxGeometry(0.35, 1.4, 0.04); s.translate(0, 2.6, 0.18);
      return mergeGeometries([a, b, c, t, s]);
    })();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x7c7a74, roughness: 0.85 });
    const lampGeo = (() => { const a = new THREE.CylinderGeometry(0.07, 0.09, 6, 8); a.translate(0, 3, 0); const b = new THREE.BoxGeometry(0.1, 0.1, 1.4); b.translate(0, 6, 0.6); return mergeGeometries([a, b]); })();
    const headGeo = new THREE.BoxGeometry(0.35, 0.12, 0.6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b0, emissiveIntensity: 4 });
    const poolMat = new THREE.MeshBasicMaterial({ map: this.glowTex, color: 0x5a4a30, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const poolGeo = new THREE.PlaneGeometry(9, 9); poolGeo.rotateX(-Math.PI / 2);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x111111 });
    for (const r of ROADS) for (const axis of [0, 1]) {
      let prev = null;
      for (let t = -HALF + 6; t < HALF - 4; t += 16) {
        if (ROADS.some(q => Math.abs(t - q) < ROAD_W / 2 + 1.5)) { prev = null; continue; }
        // pole
        const px = axis ? t : r - ROAD_W / 2 + 0.5, pz = axis ? r - ROAD_W / 2 + 0.5 : t;
        const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(px, 0, pz); pole.rotation.y = axis ? 0 : Math.PI / 2; pole.castShadow = true; this.group.add(pole);
        const pr = this.addProp(pole, 0.25, 1, 'pole');
        if (prev) {
          for (const off of [-0.8, 0.8, 0.4]) {
            const pts = []; const a = prev.mesh.position, b = pole.position;
            const o = new THREE.Vector3(axis ? 0 : off, 0, axis ? off : 0);
            for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * u + o.x, 8.15 - Math.sin(u * Math.PI) * 0.9 - (off === 0.4 ? 0.8 : 0), a.z + (b.z - a.z) * u + o.z)); }
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat); this.group.add(line);
            this.wires.push({ line, a: prev, b: pr });
          }
        }
        prev = pr;
        // lamp across the street
        const lx = axis ? t + 8 : r + ROAD_W / 2 - 0.5, lz = axis ? r + ROAD_W / 2 - 0.5 : t + 8;
        if (ROADS.some(q => Math.abs((axis ? lx : lz) - q) < ROAD_W / 2 + 1.5)) continue;
        const lamp = new THREE.Mesh(lampGeo, poleMat); lamp.position.set(lx, 0, lz); lamp.rotation.y = axis ? Math.PI : -Math.PI / 2;
        const head = new THREE.Mesh(headGeo, headMat); head.position.set(0, 5.92, 1.2); lamp.add(head); this.group.add(lamp);
        const lpw = new THREE.Vector3(0, 5.8, 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), lamp.rotation.y).add(lamp.position);
        const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.set(lpw.x, 0.03, lpw.z); this.group.add(pool);
        const lp = this.addProp(lamp, 0.2, 1, 'lamp'); lp.pool = pool;
        this.lamps.push({ pos: lpw, obj: null, color: new THREE.Color(0xffd9a0), power: 1.3, prop: lp });
      }
    }
    // misc: trash bags, cones, bicycles-ish crates in alleys
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.3, metalness: 0.1 });
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5a1a, roughness: 0.6, emissive: 0x220800 });
    for (let i = 0; i < 190; i++) {
      const b = pick(this.buildings); const side = (R() * 4) | 0;
      const x = side < 2 ? (side ? b.x1 + 0.5 : b.x0 - 0.5) : b.x0 + R() * b.w, z = side >= 2 ? (side === 3 ? b.z1 + 0.5 : b.z0 - 0.5) : b.z0 + R() * b.d;
      const m = R() < 0.6 ? new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bagMat) : new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 10), coneMat);
      m.position.set(x, 0.3, z); m.scale.y = 0.9; this.group.add(m); this.addProp(m, 0.3, 0, 'small', false);
    }
  }

  makeSkyline() {
    // distant towers with lit windows (like the reference background)
    const geos = [];
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2 + R() * 0.05, rad = 205 + R() * 55;
      const w = 10 + R() * 18, h = 30 + R() * 90;
      const g = new THREE.BoxGeometry(w, h, w); const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 20, uv.getY(k) * h / 16);
      g.translate(Math.cos(a) * rad, h / 2, Math.sin(a) * rad); geos.push(g);
    }
    const t = TX.makeFacade(999, '#15171d', 1);
    const mat = new THREE.MeshBasicMaterial({ map: t.emissive, color: 0x8c8ca8, fog: false });
    const m = new THREE.Mesh(mergeGeometries(geos), mat); this.group.add(m);
    // aircraft warning lights
    for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff2020, blending: THREE.AdditiveBlending, fog: false, depthWrite: false })); const a = R() * 6.28; s.position.set(Math.cos(a) * 220, 60 + R() * 60, Math.sin(a) * 220); s.scale.set(4, 4, 1); this.group.add(s); }
  }

  // ---------- path grid
  buildGrid() {
    this.CS = 2; this.GN = Math.ceil((HALF * 2) / this.CS);
    this.grid = new Int8Array(this.GN * this.GN); // building toughness per cell (0 free)
    this.refreshGrid();
  }
  refreshGrid() {
    const { CS, GN } = this; this.grid.fill(0);
    for (const b of this.buildings) if (b.alive) {
      const i0 = Math.max(0, Math.floor((b.x0 - 0.6 + HALF) / CS)), i1 = Math.min(GN - 1, Math.floor((b.x1 + 0.6 + HALF) / CS));
      const j0 = Math.max(0, Math.floor((b.z0 - 0.6 + HALF) / CS)), j1 = Math.min(GN - 1, Math.floor((b.z1 + 0.6 + HALF) / CS));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const x = -HALF + (i + 0.5) * CS, z = -HALF + (j + 0.5) * CS;
        if (x > b.x0 - 0.6 && x < b.x1 + 0.6 && z > b.z0 - 0.6 && z < b.z1 + 0.6) this.grid[j * GN + i] = Math.max(this.grid[j * GN + i], b.toughness);
      }
    }
  }
  cellOf(x, z) { return [THREE.MathUtils.clamp(Math.floor((x + HALF) / this.CS), 0, this.GN - 1), THREE.MathUtils.clamp(Math.floor((z + HALF) / this.CS), 0, this.GN - 1)]; }
  findPath(sx, sz, tx, tz, stage) {
    const { GN, CS, grid } = this; const N = GN * GN;
    const [si, sj] = this.cellOf(sx, sz), [ti, tj] = this.cellOf(tx, tz);
    const start = sj * GN + si, goal = tj * GN + ti;
    const g = this._g || (this._g = new Float32Array(N)), came = this._c || (this._c = new Int32Array(N)), closed = this._cl || (this._cl = new Uint8Array(N));
    g.fill(1e9); closed.fill(0); came.fill(-1);
    const heap = []; const push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
    const cost = (n) => { const t = grid[n]; if (!t) return 1; if (t <= stage) return 2.5; return 0; };
    g[start] = 0; push(start, 0); let iter = 0;
    while (heap.length && iter++ < 6000) {
      const n = pop(); if (closed[n]) continue; closed[n] = 1; if (n === goal) break;
      const i = n % GN, j = (n / GN) | 0;
      for (let d = 0; d < 8; d++) {
        const di = [1, -1, 0, 0, 1, 1, -1, -1][d], dj = [0, 0, 1, -1, 1, -1, 1, -1][d];
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue;
        const m = nj * GN + ni; const c = cost(m); if (!c) continue;
        if (d >= 4 && (!cost(j * GN + ni) || !cost(nj * GN + i))) continue;
        const ng = g[n] + c * (d >= 4 ? 1.414 : 1);
        if (ng < g[m]) { g[m] = ng; came[m] = n; push(m, ng + Math.hypot(ti - ni, tj - nj)); }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const path = []; let n = goal; while (n !== -1 && n !== start) { path.push(new THREE.Vector3(-HALF + (n % GN + 0.5) * CS, 0, -HALF + (((n / GN) | 0) + 0.5) * CS)); n = came[n]; }
    return path.reverse();
  }

  // ---------- queries
  segmentBlocked(ax, az, bx, bz, stage = -1, pad = 0) {
    for (const b of this.buildings) {
      if (!b.alive || b.toughness <= stage) continue;
      if (segAABB(ax, az, bx, bz, b.x0 - pad, b.z0 - pad, b.x1 + pad, b.z1 + pad)) return true;
    }
    return false;
  }
  // push circle out of solid boxes. filter(b) => solid?
  collide(pos, r, filter) {
    for (const b of this.buildings) {
      if (!b.alive || (filter && !filter(b))) continue;
      const qx = Math.max(b.x0, Math.min(pos.x, b.x1)), qz = Math.max(b.z0, Math.min(pos.z, b.z1));
      let dx = pos.x - qx, dz = pos.z - qz; const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-8) { // inside: push out along smallest axis
          const l = pos.x - b.x0, rr = b.x1 - pos.x, t = pos.z - b.z0, bb = b.z1 - pos.z; const m = Math.min(l, rr, t, bb);
          if (m === l) pos.x = b.x0 - r; else if (m === rr) pos.x = b.x1 + r; else if (m === t) pos.z = b.z0 - r; else pos.z = b.z1 + r;
        } else { const d = Math.sqrt(d2); pos.x = qx + dx / d * r; pos.z = qz + dz / d * r; }
      }
    }
    pos.x = THREE.MathUtils.clamp(pos.x, -BOUND, BOUND); pos.z = THREE.MathUtils.clamp(pos.z, -BOUND, BOUND);
  }
  collideProps(pos, r) {
    for (const p of this.props) {
      if (!p.alive || !p.solid) continue;
      const dx = pos.x - p.x, dz = pos.z - p.z, rr = r + p.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); pos.x = p.x + dx / d * rr; pos.z = p.z + dz / d * rr; }
    }
  }

  // ---------- destruction
  smash(b, from, cb) {
    if (!b.alive) return;
    b.alive = false; b.collapse = 0; b.from = from.clone();
    const dir = new THREE.Vector3(b.cx - from.x, 0, b.cz - from.z).normalize();
    b.dir = dir;
    // debris chunks
    const n = Math.min(46, 16 + Math.round(b.w * b.d * b.h / 60));
    for (let i = 0; i < n; i++) {
      const s = 0.5 + Math.random() * 1.6 * Math.min(1.6, b.h / 10);
      const m = new THREE.Mesh(this._chunkGeo || (this._chunkGeo = new THREE.BoxGeometry(1, 1, 1)), Math.random() < 0.35 ? b.mat : (Math.random() < 0.5 ? this.concrete : this.rubbleMat));
      m.scale.set(s * (0.6 + Math.random()), s * (0.5 + Math.random() * 0.8), s * (0.6 + Math.random()));
      m.position.set(b.x0 + Math.random() * b.w, 1 + Math.random() * b.h, b.z0 + Math.random() * b.d);
      m.castShadow = true; this.group.add(m);
      const v = dir.clone().multiplyScalar(2 + Math.random() * 7); v.x += (Math.random() - 0.5) * 12; v.z += (Math.random() - 0.5) * 12; v.y = 3 + Math.random() * 9;
      this.debris.push({ m, v, av: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8), t: 0, life: 6 + Math.random() * 2, hy: m.scale.y / 2 });
    }
    // rubble pile
    for (let i = 0; i < 7; i++) {
      const rb = new THREE.Mesh(this._chunkGeo, this.rubbleMat); const s = Math.min(b.w, b.d) * (0.25 + Math.random() * 0.35);
      rb.scale.set(s, 0.4 + Math.random() * 0.9, s * (0.7 + Math.random() * 0.6)); rb.rotation.y = Math.random() * 3; rb.position.set(b.x0 + Math.random() * b.w, rb.scale.y * 0.3, b.z0 + Math.random() * b.d); rb.receiveShadow = true;
      this.group.add(rb);
    }
    this.spawnDust(new THREE.Vector3(b.cx, 1, b.cz), Math.max(b.w, b.d) * 1.2, 40);
    // kill attached lamps (signs) + props standing inside
    for (const l of this.lamps) if (l.building === b) l.dead = true;
    for (const p of this.props) if (p.alive && p.x > b.x0 - 0.8 && p.x < b.x1 + 0.8 && p.z > b.z0 - 0.8 && p.z < b.z1 + 0.8) this.knock(p, from, 0.6);
    this.gridDirty = true;
    cb && cb(b);
  }
  knock(p, from, power = 1) {
    if (!p.alive) return; p.alive = false;
    const dir = new THREE.Vector3(p.x - from.x, 0, p.z - from.z).normalize();
    const v = dir.multiplyScalar(5 + Math.random() * 6 * power); v.y = 3 + Math.random() * 5 * power;
    const m = p.mesh;
    if (m.geometry.boundingBox === null) m.geometry.computeBoundingBox();
    this.debris.push({ m, v, av: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6), t: 0, life: 7, hy: 0.3, prop: true, base: p.kind === 'pole' || p.kind === 'lamp' });
    if (p.pool) p.pool.visible = false;
    for (const l of this.lamps) if (l.prop === p) l.dead = true;
    for (const w of this.wires) if (w.a === p || w.b === p) w.line.visible = false;
  }
  spawnDust(pos, size, n) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dustTex, color: 0xa89e92, transparent: true, opacity: 0.85, depthWrite: false }));
      s.position.set(pos.x + (Math.random() - 0.5) * size, pos.y + Math.random() * 4, pos.z + (Math.random() - 0.5) * size);
      const sc = 3 + Math.random() * 4; s.scale.set(sc, sc, 1); this.group.add(s);
      this.dust.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3), t: 0, life: 2.5 + Math.random() * 2, sc });
    }
  }

  update(dt) {
    for (const b of this.buildings) {
      if (b.collapse < 0) continue;
      b.collapse += dt; const t = b.collapse;
      if (t < 1.6) {
        const k = t / 1.6;
        b.grp.scale.y = Math.max(0.02, 1 - k * k);
        b.grp.rotation.x = b.dir.z * k * 0.25; b.grp.rotation.z = -b.dir.x * k * 0.25;
        b.grp.position.y = -k * 1.2;
      } else { b.grp.visible = false; b.collapse = -1; }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.t += dt; const m = d.m;
      if (d.t < d.life - 1.5) {
        d.v.y -= 22 * dt; m.position.addScaledVector(d.v, dt);
        m.rotation.x += d.av.x * dt; m.rotation.y += d.av.y * dt; m.rotation.z += d.av.z * dt;
        const floor = d.base ? 0.2 : d.hy;
        if (m.position.y < floor) { m.position.y = floor; d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.av.multiplyScalar(0.6); if (Math.abs(d.v.y) < 1) d.v.y = 0; }
      } else {
        m.position.y -= dt * 1.2; // sink away
      }
      if (d.t > d.life) { m.parent && m.parent.remove(m); if (!d.prop) { /* shared geo */ } this.debris.splice(i, 1); }
    }
    while (this.debris.length > 420) { const d = this.debris.shift(); d.m.parent && d.m.parent.remove(d.m); }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i]; d.t += dt; d.s.position.addScaledVector(d.v, dt); d.v.multiplyScalar(Math.exp(-dt * 0.8));
      const k = d.t / d.life; const sc = d.sc * (1 + k * 2.5); d.s.scale.set(sc, sc, 1); d.s.material.opacity = 0.75 * (1 - k);
      if (d.t > d.life) { d.s.parent.remove(d.s); d.s.material.dispose(); this.dust.splice(i, 1); }
    }
    if (this.gridDirty) { this.gridDirty = false; this.refreshGrid(); }
  }
  // hide far-away objects (they are lost in the fog anyway) to keep draw calls low
  cull(p, D = 72) {
    const D2 = D * D;
    for (const b of this.buildings) if (b.alive || b.collapse >= 0) { const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dz = Math.max(b.z0 - p.z, 0, p.z - b.z1); b.grp.visible = dx * dx + dz * dz < D2; }
    for (const q of this.props) if (q.alive) { const dx = q.x - p.x, dz = q.z - p.z, v = dx * dx + dz * dz < D2; q.mesh.visible = v; if (q.pool) q.pool.visible = v; }
    for (const w of this.wires) if (w.a.alive && w.b.alive) { const dx = w.a.x - p.x, dz = w.a.z - p.z; w.line.visible = dx * dx + dz * dz < D2 * 0.7; }
  }
  // world positions of light sources (for dynamic light pool)
  lightSources() {
    return this.lamps.filter(l => !l.dead).map(l => { if (l.obj) { l.pos.set(0, 0, 1.3); l.obj.localToWorld(l.pos); } return l; });
  }
}

function segAABB(ax, az, bx, bz, x0, z0, x1, z1) {
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
    const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}
