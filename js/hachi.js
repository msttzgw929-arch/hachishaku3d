// Procedurally modelled Hachishaku-sama with a huge jiggly belly.
import * as THREE from 'three';
import { makeKnit, makeHair } from './textures.js';
import { Face } from './face.js';

const KNIT = makeKnit();
const HAIRTEX = makeHair();

function knitMat(rx, ry, extra = {}) {
  const map = KNIT.map.clone(); map.repeat.set(rx, ry); map.needsUpdate = true;
  const nmap = KNIT.nmap.clone(); nmap.repeat.set(rx, ry); nmap.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color: 0xf3f1ee, map, normalMap: nmap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.82, metalness: 0, ...extra });
}

// injects soft-body deformation into a standard material
function addJiggle(mat, U, key) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform vec3 uJig; uniform float uRip; uniform float uFloor; uniform float uTime; uniform float uBreath;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float w = smoothstep(-0.7, 1.0, position.z) * (0.5 + 0.5 * smoothstep(0.7, -0.9, position.y));
      transformed += uJig * w;
      transformed.xz *= 1.0 - uJig.y * 0.6 * w + uBreath * w;
      transformed.y *= 1.0 + uBreath * 0.5 * w;
      float rd = length(position.xy - vec2(0.0, -0.05));
      transformed += normal * uRip * sin(rd * 13.0 - uTime * 26.0) * exp(-rd * 1.2) * w * 0.035;
      float fl = uFloor + 0.06;
      if (transformed.y < fl) { float t = fl - transformed.y; transformed.y = fl - t * 0.18; transformed.xz *= 1.0 + t * 0.35; }
      `);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
function addSway(mat, U, top, len, key) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSway = U.uSway; sh.uniforms.uTime = U.uTime;
    sh.vertexShader = 'uniform vec3 uSway; uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float f = clamp((${top.toFixed(3)} - position.y) / ${len.toFixed(3)}, 0.0, 1.0); f = f * f;
      transformed += uSway * f;
      transformed.x += sin(uTime * 1.7 + position.y * 6.0) * 0.006 * f;
      `);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
function addSkirt(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uLegL: U.uLegL, uLegR: U.uLegR, uTime: U.uTime, uSkTop: U.uSkTop });
    sh.vertexShader = 'uniform vec2 uLegL; uniform vec2 uLegR; uniform float uTime; uniform float uSkTop;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float hf = clamp(1.0 - position.y / uSkTop, 0.0, 1.0); hf = pow(hf, 1.6);
      float r = max(length(position.xz), 0.001);
      float wl = smoothstep(0.1, -0.7, position.x / r), wr = smoothstep(-0.1, 0.7, position.x / r);
      float front = 0.6 + 0.4 * (position.z / r);
      transformed.z += (uLegL.x * wl + uLegR.x * wr) * hf * 0.85 * front;
      transformed.y += (uLegL.y * wl + uLegR.y * wr) * hf * 0.25;
      transformed.xz *= 1.0 + sin(uTime * 2.0 + atan(position.x, position.z) * 5.0) * 0.012 * hf;
      `);
  };
  mat.customProgramCacheKey = () => 'skirt';
  return mat;
}

function lathe(pts, seg = 48) { return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); }

export class Hachi {
  constructor() {
    this.root = new THREE.Group();          // world placement, yaw
    this.body = new THREE.Group();          // scaled by size
    this.root.add(this.body);
    this.pelvis = new THREE.Group(); this.body.add(this.pelvis);  // bobbing upper body
    this.U = { uTime: { value: 0 } };
    this.bellyU = { uJig: { value: new THREE.Vector3() }, uRip: { value: 0 }, uFloor: { value: -9 }, uTime: this.U.uTime, uBreath: { value: 0 } };
    this.rollU = { uJig: { value: new THREE.Vector3() }, uRip: { value: 0 }, uFloor: { value: -9 }, uTime: this.U.uTime, uBreath: { value: 0 } };
    this.hairU = { uSway: { value: new THREE.Vector3() }, uTime: this.U.uTime };
    this.skirtU = { uLegL: { value: new THREE.Vector2() }, uLegR: { value: new THREE.Vector2() }, uTime: this.U.uTime, uSkTop: { value: 1.4 } };
    this.face = new Face();
    this.build();
    // state
    this.phase = 0; this.lastStep = 0; this.speed = 0;
    this.jig = new THREE.Vector3(); this.jigV = new THREE.Vector3();
    this.roll = new THREE.Vector3(); this.rollV = new THREE.Vector3();
    this.rip = 0; this.stage = 0; this.gx = 1; this.gy = 1; this.bodyScale = 1;
    this.gxT = 1; this.gyT = 1; this.scaleT = 1; this.growV = 0;
    this.headYaw = 0; this.headPitch = 0; this.mode = 'walk'; this.hug = 0; this.armsUp = 1;
    this.talk = 0; this.onStep = null; this.swayV = new THREE.Vector3(); this.sway = new THREE.Vector3();
    this.setStage(0, true);
  }

  build() {
    const P = this.pelvis;
    const skin = new THREE.MeshStandardMaterial({ color: 0xf7e8e4, roughness: 0.6 });
    this.skin = skin;
    const shadow = (m) => { m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; };

    // ---------- skirt (long dress below the belly, to the ground)
    const sk = lathe([[0.7, 0.0], [0.72, 0.03], [0.71, 0.2], [0.66, 0.5], [0.57, 0.85], [0.44, 1.15], [0.3, 1.42]], 64);
    sk.scale(1, 1, 0.72); sk.translate(0, 0, 0.06);
    this.skirt = new THREE.Mesh(sk, addSkirt(knitMat(36, 9, { side: THREE.DoubleSide }), this.skirtU));
    this.body.add(this.skirt);

    // ---------- legs / feet (peeking out under the hem)
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf0eeea, roughness: 0.35 });
    this.feet = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.13, 6, 12), shoeMat);
      shoe.rotation.x = Math.PI / 2; shoe.position.set(0, 0.04, 0.05); shoe.scale.set(1, 1, 0.7);
      const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 8), shoeMat); heel.position.set(0, 0.03, -0.05);
      const ankle = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.3, 12), skin); ankle.position.set(0, 0.2, -0.02);
      g.add(shoe, heel, ankle); g.position.x = s * 0.13; this.body.add(g); this.feet.push(g);
    }

    // ---------- torso
    const tor = lathe([[0, 1.0], [0.28, 1.02], [0.29, 1.25], [0.24, 1.5], [0.23, 1.68], [0.25, 1.82], [0.27, 1.93], [0.265, 2.03], [0.22, 2.11], [0.13, 2.17], [0.06, 2.2], [0, 2.21]], 48);
    tor.scale(1, 1, 0.7);
    P.add(new THREE.Mesh(tor, knitMat(30, 10)));
    // shoulders
    const sh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.42, 6, 16), knitMat(10, 4)); sh.rotation.z = Math.PI / 2; sh.position.set(0, 2.08, -0.01); sh.scale.set(1, 1, 0.85); P.add(sh);
    // modest chest volume
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), knitMat(8, 6)); b.position.set(s * 0.1, 1.9, 0.08); b.scale.set(1.15, 1.0, 0.85); P.add(b); }
    // neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.05, 0.2, 16), skin); neck.position.set(0, 2.25, 0.0); P.add(neck);
    // polo collar
    const colMat = knitMat(12, 1, { color: 0xf6f5f2 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.016, 8, 24), colMat); band.rotation.x = Math.PI / 2 - 0.25; band.position.set(0, 2.205, 0.0); band.scale.set(1, 0.85, 1); P.add(band);
    for (const s of [-1, 1]) {
      const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(s * 0.085, -0.012); fs.lineTo(s * 0.06, -0.075); fs.lineTo(0, -0.035); fs.closePath();
      const fgeo = new THREE.ExtrudeGeometry(fs, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 });
      const flap = new THREE.Mesh(fgeo, colMat); flap.position.set(s * 0.012, 2.2, 0.085); flap.rotation.set(-0.45, s * 0.35, 0); P.add(flap);
    }
    const plk = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.13, 0.01), colMat); plk.position.set(0, 2.1, 0.115); plk.rotation.x = 0.28; P.add(plk);
    const btnMat = new THREE.MeshStandardMaterial({ color: 0xdedbd5, roughness: 0.3 });
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), btnMat); b.position.set(0, 2.145 - i * 0.04, 0.124 + i * 0.011); b.scale.z = 0.5; P.add(b); }

    // ---------- belly (upper roll + huge lower belly)
    const bg = new THREE.SphereGeometry(1, 96, 64);
    { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y < 0) { x *= 1 + (-y) * 0.06; z *= 1 + (-y) * 0.1; } if (z < 0) z *= 0.75; p.setXYZ(i, x, y, z); } bg.computeVertexNormals(); }
    this.belly = new THREE.Mesh(bg, addJiggle(knitMat(56, 18), this.bellyU, 'belly'));
    this.belly.renderOrder = 1;
    P.add(this.belly);
    const rg = new THREE.SphereGeometry(1, 64, 40);
    { const p = rg.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y < 0) { x *= 1 + (-y) * 0.08; } if (z < 0) z *= 0.6; p.setXYZ(i, x, y, z); } rg.computeVertexNormals(); }
    this.roll = null;
    this.rollMesh = new THREE.Mesh(rg, addJiggle(knitMat(40, 10), this.rollU, 'roll'));
    P.add(this.rollMesh);

    // ---------- arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sho = new THREE.Group(); sho.position.set(s * 0.3, 2.06, -0.01); P.add(sho);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.28, 6, 14), knitMat(8, 6)); up.position.y = -0.17; sho.add(up);
      const elb = new THREE.Group(); elb.position.y = -0.33; sho.add(elb);
      const fo = new THREE.Mesh(new THREE.CapsuleGeometry(0.054, 0.25, 6, 14), knitMat(8, 6)); fo.position.y = -0.15; elb.add(fo);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.013, 6, 16), knitMat(8, 1)); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.3; elb.add(cuff);
      const hand = new THREE.Group(); hand.position.y = -0.33; elb.add(hand);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.058, 16, 12), skin); fist.scale.set(0.9, 1.1, 0.95); fist.position.y = -0.03; hand.add(fist);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.035, 4, 8), skin); thumb.position.set(-s * 0.03, -0.03, 0.035); thumb.rotation.z = s * 0.6; hand.add(thumb);
      for (let k = 0; k < 4; k++) { const kn = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), skin); kn.position.set(-0.03 + k * 0.02, -0.065, 0.025); hand.add(kn); }
      this.arms.push({ sho, elb, hand, s });
    }

    // ---------- head
    const hp = this.headPivot = new THREE.Group(); hp.position.set(0, 2.24, 0.0); P.add(hp);
    const head = this.head = new THREE.Group(); head.position.set(0, 0.11, 0.015); hp.add(head);
    const rH = 0.125; this.rH = rH;
    const deformHead = (g, r) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); y *= 1.08; if (y < 0) { const q = y / r; const t = 1 + q * 0.12 - q * q * 0.16; x *= t; z *= 1 + q * 0.1; } if (z > 0 && y < 0) z *= 1 - (Math.abs(x) / r) * 0.1; p.setXYZ(i, x, y, z); } g.computeVertexNormals(); return g; };
    const hg = deformHead(new THREE.SphereGeometry(rH, 64, 48), rH);
    head.add(new THREE.Mesh(hg, skin));
    // face decal = same shape, planar UV from front
    const fg = deformHead(new THREE.SphereGeometry(rH * 1.004, 64, 48), rH);
    { const p = fg.attributes.position, uv = fg.attributes.uv; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (z > 0) uv.setXY(i, x / (2 * rH * 0.9) + 0.5, y / (2 * rH * 1.0) + 0.5 + 0.03); else uv.setXY(i, -1, -1); } }
    this.face.tex.wrapS = this.face.tex.wrapT = THREE.ClampToEdgeWrapping;
    const faceMat = new THREE.MeshStandardMaterial({ map: this.face.tex, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.faceMesh = new THREE.Mesh(fg, faceMat); this.faceMesh.renderOrder = 2; head.add(this.faceMesh);
    // ears hidden under hair

    // ---------- hair
    const hairMat = (top, len, key, rx = 4, ry = 1) => { const t = HAIRTEX.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return addSway(new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.38, metalness: 0.08, side: THREE.DoubleSide }), this.hairU, top, len, key); };
    const capR = rH * 1.085;
    // crown + blunt bangs (hime cut)
    const cap = deformHead(new THREE.SphereGeometry(capR, 64, 32, 0, Math.PI * 2, 0, 1.3), rH);
    head.add(new THREE.Mesh(cap, hairMat(-5, 1, 'hcap', 6, 1)));
    // back/sides of head (opening for face)
    const back = deformHead(new THREE.SphereGeometry(capR * 1.01, 64, 40, Math.PI / 2 + 0.78, Math.PI * 2 - 1.56, 0, 2.5), rH);
    head.add(new THREE.Mesh(back, hairMat(-5, 1, 'hback', 6, 1)));
    // long straight back hair (attached to upper body)
    const lh = new THREE.CylinderGeometry(rH * 1.12, 0.33, 1.0, 40, 14, true, 0.85, Math.PI * 2 - 1.7);
    lh.translate(0, -0.5, 0); lh.scale(1, 1, 0.78);
    { const p = lh.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const t = Math.min(1, -y / 0.25); p.setZ(i, p.getZ(i) - 0.0 * t); } }
    const lhm = new THREE.Mesh(lh, hairMat(0.0, 1.0, 'hlong', 8, 1)); lhm.position.set(0, 2.41, -0.02); P.add(lhm);
    // front locks over the shoulders down the chest
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.075, 0.62, 0.025, 2, 14, 1); g.translate(0, -0.31, 0);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = -p.getY(i); const z = 0.03 + Math.sin(Math.min(1, y / 0.55) * Math.PI) * 0.07 + y * 0.05; p.setZ(i, p.getZ(i) + z); p.setX(i, p.getX(i) + s * y * 0.06); } g.computeVertexNormals();
      const m = new THREE.Mesh(g, hairMat(0.0, 0.62, 'hfront', 1, 1)); m.position.set(s * 0.15, 2.34, 0.06); P.add(m);
    }

    // ---------- hat
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xf6f5f1, roughness: 0.85, side: THREE.DoubleSide });
    const hat = this.hat = new THREE.Group(); hat.position.set(0, 0.075, -0.005); hat.rotation.x = -0.1; head.add(hat);
    hat.add(new THREE.Mesh(lathe([[0.125, 0.012], [0.3, 0.004], [0.44, -0.022], [0.5, -0.045], [0.505, -0.052], [0.44, -0.032], [0.3, -0.006], [0.125, 0.0]], 72), hatMat));
    hat.add(new THREE.Mesh(lathe([[0.0, 0.2], [0.07, 0.198], [0.118, 0.18], [0.138, 0.11], [0.143, 0.0]], 48), hatMat));
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.1445, 0.1455, 0.04, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xe4e2dc, roughness: 0.6, side: THREE.DoubleSide })); rib.position.y = 0.025; hat.add(rib);

    shadow(this.root);
    this.faceMesh.castShadow = false;
  }

  setStage(n, instant = false) {
    this.stage = n;
    this.gxT = 1 + 0.22 * n;                         // belly width/depth: unbounded growth
    this.gyT = 1 + 0.9 * (1 - Math.exp(-n / 4));   // height saturates (spreads instead)
    this.scaleT = 1.12 * (1 + 0.16 * n);               // whole body slowly grows too
    if (instant) { this.gx = this.gxT; this.gy = this.gyT; this.bodyScale = this.scaleT; }
    else { this.growV += 1.6; this.jigV.y += 1.2; this.rip = 1; }
  }
  // world-space radius of belly (xz)
  get radius() { return 0.74 * this.gx * this.bodyScale; }
  bellyCenter(out) { // world xz center of the belly
    const z = (-0.22 + 0.68 * Math.pow(this.gx, 0.85)) * this.bodyScale;
    out.set(Math.sin(this.root.rotation.y) * z, 0, Math.cos(this.root.rotation.y) * z).add(this.root.position); out.y = 0; return out;
  }
  get height() { return (2.75 + (this.lift || 0)) * this.bodyScale; }
  get headWorldY() { return (2.5 + (this.lift || 0)) * this.bodyScale; }

  slap() { this.jigV.z -= 1.2 + Math.random() * 0.3; this.jigV.x += (Math.random() - 0.5) * 0.8; this.jigV.y += 0.5; this.rip = Math.min(1.4, this.rip + 0.8); this.rollV.z -= 0.6; }
  bump(s = 1) { this.jigV.z -= 0.6 * s; this.jigV.y -= 0.6 * s; this.rip = Math.min(1.2, this.rip + 0.5 * s); }

  update(dt, o) {
    // o: {speed (m/s), look: Vector3 world | null, mode: 'walk'|'hug'|'idle'|'stun', talk 0..1}
    const t = (this.U.uTime.value += dt);
    // growth springs (overshoot a bit = "boing")
    const gk = 1 - Math.exp(-dt * 3.2);
    this.gx += (this.gxT - this.gx) * gk; this.gy += (this.gyT - this.gy) * gk; this.bodyScale += (this.scaleT - this.bodyScale) * gk * 0.8;
    this.growV *= Math.exp(-dt * 3);
    const pump = Math.sin(t * 18) * this.growV * 0.03;

    this.body.scale.setScalar(this.bodyScale);
    const sp = this.speed += ((o.speed || 0) - this.speed) * (1 - Math.exp(-dt * 6));
    const stride = 0.62;                                 // local units per half-cycle
    this.phase += (sp / this.bodyScale) / stride * Math.PI * dt;
    const ph = this.phase, walkAmt = Math.min(1, sp / 1.2);
    // footstep events
    const stepIdx = Math.floor(ph / Math.PI);
    if (stepIdx !== this.lastStep && walkAmt > 0.15) {
      this.lastStep = stepIdx; const side = (stepIdx & 1) ? 1 : -1;
      this.jigV.y -= 0.55 * walkAmt; this.jigV.x += side * 0.28 * walkAmt; this.jigV.z += 0.12;
      this.rollV.y -= 0.35 * walkAmt;
      this.onStep && this.onStep(side, walkAmt);
    }
    // legs (feet) + skirt
    const fl = Math.sin(ph) * 0.3 * walkAmt, fr = -fl;
    const liftL = Math.max(0, Math.cos(ph)) * 0.09 * walkAmt, liftR = Math.max(0, -Math.cos(ph)) * 0.09 * walkAmt;
    this.feet[0].position.set(-0.13, liftL, fl); this.feet[1].position.set(0.13, liftR, fr);
    this.feet[0].rotation.x = -liftL * 2.5; this.feet[1].rotation.x = -liftR * 2.5;
    this.skirtU.uLegL.value.set(fl, liftL); this.skirtU.uLegR.value.set(fr, liftR);
    // pelvis bob/sway
    const bob = Math.abs(Math.cos(ph)) * 0.035 * walkAmt;
    // as the belly grows taller, her upper body rides higher (dress stretches) so her face stays visible
    const ryL = 0.6 * this.gy, cyL = Math.max(0.96 - 0.3 * (this.gy - 1), ryL * 0.78);
    const lift = Math.max(0, cyL + ryL - 1.56) * 1.25;
    this.lift = lift;
    this.pelvis.position.y = lift + bob - 0.02 * walkAmt + Math.sin(t * 1.6) * 0.004;
    this.pelvis.rotation.z = Math.sin(ph) * 0.03 * walkAmt;
    this.pelvis.rotation.y = Math.sin(ph) * 0.04 * walkAmt;
    this.pelvis.rotation.x = 0.03 * walkAmt;

    // belly springs
    const k = 75 / Math.sqrt(this.gx), c = 3.2;
    this.jigV.addScaledVector(this.jig, -k * dt).multiplyScalar(Math.exp(-c * dt)); this.jig.addScaledVector(this.jigV, dt);
    this.rollV.addScaledVector(this.roll, -110 * dt).multiplyScalar(Math.exp(-4 * dt)); this.roll.addScaledVector(this.rollV, dt);
    this.rip *= Math.exp(-dt * 2.2);
    this.bellyU.uJig.value.copy(this.jig).multiplyScalar(0.11);
    this.bellyU.uRip.value = this.rip; this.bellyU.uBreath.value = Math.sin(t * 1.9) * 0.008 + pump;
    this.rollU.uJig.value.copy(this.roll).multiplyScalar(0.08).addScaledVector(this.jig, 0.04);
    this.rollU.uRip.value = this.rip * 0.4; this.rollU.uBreath.value = Math.sin(t * 1.9 - 0.4) * 0.006 + pump * 0.6;

    // belly placement
    const gx = this.gx, gy = this.gy;
    const rx = 0.78 * gx, ry = 0.6 * gy, rz = 0.68 * Math.pow(gx, 0.85);
    const cy = Math.max(0.96 - 0.3 * (gy - 1), ry * 0.78);
    const cz = -0.22 + rz;
    this.belly.position.set(0, cy - lift - (this.pelvis.position.y - lift) * 0.6, cz);
    this.belly.scale.set(rx, ry, rz);
    this.bellyU.uFloor.value = (-cy + (this.pelvis.position.y - lift) * 0.6 - (this.pelvis.position.y - lift)) / ry;
    const rgx = Math.pow(gx, 0.75);
    this.rollMesh.position.set(0, 1.56, 0.17 + 0.1 * (rgx - 1));
    this.rollMesh.scale.set(0.58 * rgx, 0.22 * Math.pow(gy, 0.4), 0.46 * rgx);
    const skg = 1 + 0.55 * (gx - 1);
    this.skirt.scale.set(skg, (1.42 + lift) / 1.42, skg);
    this.skirtU.uSkTop.value = 1.42;

    // arms: ref pose (fists up) with swing; hug pose when catching
    this.hug += ((o.mode === 'hug' ? 1 : 0) - this.hug) * (1 - Math.exp(-dt * 6));
    const reach = Math.max(0.0, gx - 1) * 0.35;
    for (const a of this.arms) {
      const s = a.s, sw = Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 0.3 * walkAmt;
      const wave = o.mode === 'stun' ? Math.sin(t * 14 + s) * 0.3 : 0;
      // walk pose
      let ux = -0.15 + sw, uz = s * (0.55 + reach), ex = -1.9 + sw * 0.5 + wave, ey = 0;
      // hug pose
      const hx = -1.05, hz = s * (0.3 + reach * 0.6), hex = -0.45;
      ux += (hx - ux) * this.hug; uz += (hz - uz) * this.hug; ex += (hex - ex) * this.hug;
      a.sho.rotation.set(ux, 0, uz); a.elb.rotation.set(ex, 0, -s * 0.15 * (1 - this.hug)); a.elb.rotation.order = 'XYZ';
      a.hand.rotation.set(0.3, 0, 0);
      a.elb.rotation.y = s * 0.6 * (1 - this.hug);
    }

    // head tracking
    let yaw = 0, pitch = 0.06;
    if (o.look) {
      const lp = this.headPivot.getWorldPosition(_v); const dx = o.look.x - lp.x, dz = o.look.z - lp.z, dy = o.look.y - lp.y;
      const ang = Math.atan2(dx, dz) - this.root.rotation.y; yaw = Math.atan2(Math.sin(ang), Math.cos(ang));
      yaw = THREE.MathUtils.clamp(yaw, -1.0, 1.0);
      pitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.2, 0.55);
      this.face.look[0] = THREE.MathUtils.clamp((Math.atan2(Math.sin(ang), Math.cos(ang)) - yaw) * 1.5, -1, 1);
      this.face.look[1] = THREE.MathUtils.clamp(pitch * 1.5 - 0.3, -1, 1);
    }
    const hk = 1 - Math.exp(-dt * 5);
    this.headYaw += (yaw - this.headYaw) * hk; this.headPitch += (pitch - this.headPitch) * hk;
    this.headPivot.rotation.set(this.headPitch * 0.6, this.headYaw * 0.75, Math.sin(t * 0.9) * 0.03 + (o.mode === 'stun' ? Math.sin(t * 9) * 0.08 : 0), 'YXZ');
    this.head.rotation.set(this.headPitch * 0.4, this.headYaw * 0.25, 0);

    // hair sway: lag behind motion + step bounce
    const target = new THREE.Vector3(Math.sin(ph) * 0.02 * walkAmt - this.headYaw * 0.03, 0, -0.05 * walkAmt - 0.015 + this.headPitch * 0.04);
    this.swayV.addScaledVector(target.sub(this.sway), 40 * dt).multiplyScalar(Math.exp(-5 * dt)); this.sway.addScaledVector(this.swayV, dt);
    this.hairU.uSway.value.copy(this.sway);

    // face
    this.face.talk = o.talk || 0; this.face.update(dt);
  }
}
const _v = new THREE.Vector3();
