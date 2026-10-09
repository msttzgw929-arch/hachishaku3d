// Hachishaku-sama: SDF-sculpted skinned body (surface nets), jiggly belly dome, procedural knit shading.
import * as THREE from 'three';
import { hairMaterial, cardGeometry, HairChain } from './hair.js';
import { Face } from './face.js';
import { sdEllipsoid, sdRoundCone, smin, surfaceNets } from './sdf.js';

const KNIT_COL = 0xf4f2ef, SKIN_COL = new THREE.Color(0xf6e4de);

// ---------- procedural rib knit (fine vertical ribs, fades with distance, sheen + wrap-ish light)
function knitMaterial({ ribs = 110, amp = 0.55, mode = 'radial', extra = {}, jiggle = null, skirt = null, key = 'k' }) {
  const m = new THREE.MeshPhysicalMaterial({ color: KNIT_COL, roughness: 0.78, metalness: 0, sheen: 0.7, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffffff), vertexColors: mode === 'body', ...extra });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRibN = { value: ribs }; sh.uniforms.uRibAmp = { value: amp };
    if (jiggle) Object.assign(sh.uniforms, jiggle);
    if (skirt) Object.assign(sh.uniforms, skirt);
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    const body = mode === 'body';
    vs = (body ? 'attribute float armW; attribute float armPh; attribute vec3 ribTan; attribute float cloth;\n' : '') +
      'varying vec3 vRest; varying vec3 vTanV; varying float vArmW; varying float vArmPh; varying float vCloth;\n' +
      (jiggle ? 'uniform vec3 uJig; uniform float uRip; uniform float uFloor; uniform float uTime; uniform float uBreath; uniform vec4 uDent; uniform float uDentD; uniform vec3 uDentS;\nfloat dentH(float d, float r, float D){ float g = exp(-(d*d)/(r*r)); float q = (d - 1.3*r)/(0.5*r); return -D*g + 0.32*D*exp(-q*q); }\nfloat dentHd(float d, float r, float D){ float g = exp(-(d*d)/(r*r)); float q = (d - 1.3*r)/(0.5*r); return D*2.0*d/(r*r)*g - 0.32*D*2.0*q/(0.5*r)*exp(-q*q); }\n' : '') +
      (skirt ? 'uniform vec2 uLegL; uniform vec2 uLegR; uniform float uTime; uniform float uSkTop; uniform float uSkOff;\n' : '') + vs;
    let tanExpr = body ? 'mix(normalize(vec3(position.z, 0.0, -position.x) + 1e-5), ribTan, armW)' : 'normalize(vec3(position.z, 0.0, -position.x) + 1e-5)';
    vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
      vRest = position; vArmW = ${body ? 'armW' : '0.0'}; vArmPh = ${body ? 'armPh' : '0.0'}; vCloth = ${body ? 'cloth' : '1.0'};
      ${jiggle ? `
      float w = smoothstep(-0.7, 1.0, position.z) * (0.5 + 0.5 * smoothstep(0.7, -0.9, position.y));
      transformed += uJig * w;
      transformed.xz *= 1.0 - uJig.y * 0.6 * w + uBreath * w;
      transformed.y *= 1.0 + uBreath * 0.5 * w;
      float rd = length(position.xy - vec2(0.0, -0.05));
      transformed += normal * uRip * sin(rd * 13.0 - uTime * 26.0) * exp(-rd * 1.2) * w * 0.03;
      float fl = uFloor + 0.05;
      if (transformed.y < fl) { float t = fl - transformed.y; transformed.y = fl - t * 0.2; transformed.xz *= 1.0 + t * 0.3; }
      if (uDentD > 0.0005 || uDentD < -0.0005) {
        vec3 pm = position * uDentS, pc = uDent.xyz * uDentS; float dd = length(pm - pc);
        float hh = dentH(dd, uDent.w, uDentD);
        transformed += normal * hh / uDentS;
      }` : ''}
      ${skirt ? `
      float hf = clamp(1.0 - position.y / uSkTop, 0.0, 1.0); hf = pow(hf, 1.6);
      float r = max(length(position.xz), 0.001);
      float wl = smoothstep(0.1, -0.7, position.x / r), wr = smoothstep(-0.1, 0.7, position.x / r);
      float front = 0.6 + 0.4 * (position.z / r);
      transformed.z += (uLegL.x * wl + uLegR.x * wr) * hf * 0.8 * front;
      transformed.y += (uLegL.y * wl + uLegR.y * wr) * hf * 0.2;
      transformed.xz *= 1.0 + sin(uTime * 2.0 + atan(position.x, position.z) * 5.0) * 0.01 * hf;
      transformed.z += uSkOff * clamp(1.0 - position.y / uSkTop, 0.0, 1.0);` : ''}
    `);
    if (jiggle) vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      if (uDentD > 0.0005 || uDentD < -0.0005) {
        vec3 pm0 = position * uDentS, pc0 = uDent.xyz * uDentS; vec3 dv = pm0 - pc0; float d0 = length(dv);
        vec3 nn = normalize(objectNormal); vec3 tg = dv - nn * dot(dv, nn); float tl = length(tg);
        if (tl > 1e-4) objectNormal = normalize(nn - (tg / tl) * dentHd(d0, uDent.w, uDentD) * 1.0);
      }`);
    // tangent through skinning
    const tanCode = `vec3 tanO = ${tanExpr};\n#ifdef USE_SKINNING\n tanO = (skinMatrix * vec4(tanO, 0.0)).xyz;\n#endif\n vTanV = normalize(normalMatrix * tanO);`;
    vs = vs.replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n' + tanCode);
    fs = 'uniform float uRibN; uniform float uRibAmp; varying vec3 vRest; varying vec3 vTanV; varying float vArmW; varying float vArmPh; varying float vCloth;\n' + fs;
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
      float ph = mix(atan(vRest.x, vRest.z) * uRibN, vArmPh, vArmW);
      float fw = fwidth(ph);
      float ribK = clamp(1.4 - fw * 0.5, 0.0, 1.0) * vCloth;
      float rib = sin(ph);
      diffuseColor.rgb *= 1.0 - 0.09 * ribK * (0.5 - 0.5 * rib);
      diffuseColor.rgb *= 1.0 - 0.04 * ribK * (0.5 + 0.5 * sin(vRest.y * 260.0 + rib));`);
    fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize(normal + vTanV * cos(ph) * uRibAmp * ribK);`);
    // soft wrap lighting (cheap subsurface feel)
    fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.06;`);
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'knit_' + key;
  return m;
}
function addSway(mat, U, top, len, key) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSway = U.uSway; sh.uniforms.uTime = U.uTime;
    sh.vertexShader = 'uniform vec3 uSway; uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float f = clamp((${top.toFixed(3)} - position.y) / ${len.toFixed(3)}, 0.0, 1.0); f = f * f;
      transformed += uSway * f;
      transformed.x += sin(uTime * 1.7 + position.y * 6.0) * 0.005 * f;`);
  };
  mat.customProgramCacheKey = () => key; return mat;
}
function lathe(pts, seg = 64) { return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); }

// ---------------- rest-pose skeleton description (body local units, feet at y=0)
const SH_Y = 2.06, SH_X = 0.245;
const ARM_U = [Math.sin(0.62), -Math.cos(0.62), 0];   // rest: upper arm down-out
const ARM_F = [Math.sin(1.42), -Math.cos(1.42), 0];   // rest: forearm almost horizontal (keeps it clear of the body)
const UA = 0.3, FA = 0.27;
function armPts(s) {
  const sh = [s * SH_X, SH_Y, -0.01];
  const dU = [ARM_U[0] * s, ARM_U[1], 0], dF = [ARM_F[0] * s, ARM_F[1], 0];
  const el = [sh[0] + dU[0] * UA, sh[1] + dU[1] * UA, sh[2]];
  const wr = [el[0] + dF[0] * FA, el[1] + dF[1] * FA, el[2]];
  const fi = [wr[0] + dF[0] * 0.055, wr[1] + dF[1] * 0.055, wr[2] + 0.005];
  return { sh, el, wr, fi, dU, dF, d: dF };
}
const ARMS = { L: armPts(1), R: armPts(-1) };

// primitives: [name, bone, cloth(1)/skin(0), fn]
function bodyPrims() {
  const P = [];
  const zf = 1.32; // torso is flatter front-to-back
  P.push(['hips', 'hips', 1, (x, y, z) => sdEllipsoid(x, y, z, 0, 1.12, -0.01, 0.235, 0.24, 0.18)]);
  P.push(['waist', 'spine', 1, (x, y, z) => sdRoundCone(x, y, z * zf, [0, 1.2, 0], [0, 1.72, -0.02], 0.19, 0.175)]);
  P.push(['ribcage', 'chest', 1, (x, y, z) => sdRoundCone(x, y, z * zf, [0, 1.7, -0.02], [0, 1.98, -0.03], 0.18, 0.15)]);
  for (const s of [-1, 1]) P.push(['bust', 'chest', 1, (x, y, z) => sdEllipsoid(x, y, z, s * 0.118, 1.85, 0.082, 0.14, 0.125, 0.11)]);
  P.push(['shoulders', 'chest', 1, (x, y, z) => sdRoundCone(x, y, z * 1.15, [-0.225, 2.045, -0.02], [0.225, 2.045, -0.02], 0.072, 0.072)]);
  P.push(['neck', 'neck', 0, (x, y, z) => sdRoundCone(x, y, z, [0, 2.02, -0.01], [0, 2.21, 0.0], 0.055, 0.047)]);
  P.push(['roll', 'roll', 1, (x, y, z) => sdEllipsoid(x, y, z, 0, 1.52, 0.08, 0.24, 0.16, 0.2)]);
  for (const [k, s] of [['L', 1], ['R', -1]]) {
    const A = ARMS[k];
    P.push(['ua' + k, 'upperArm' + k, 1, (x, y, z) => sdRoundCone(x, y, z, A.sh, A.el, 0.068, 0.055)]);
    P.push(['fa' + k, 'foreArm' + k, 1, (x, y, z) => sdRoundCone(x, y, z, A.el, A.wr, 0.055, 0.045)]);
    P.push(['cuff' + k, 'foreArm' + k, 1, (x, y, z) => sdRoundCone(x, y, z, [A.wr[0] - A.d[0] * 0.03, A.wr[1] - A.d[1] * 0.03, A.wr[2]], A.wr, 0.046, 0.046)]);
    P.push(['fist' + k, 'hand' + k, 0, (x, y, z) => sdEllipsoid(x, y, z, A.fi[0], A.fi[1], A.fi[2], 0.05, 0.06, 0.053)]);
  }
  return P;
}
function bodySDF(P) {
  const ix = Object.fromEntries(P.map((p, i) => [p[0], i]));
  return (x, y, z, out) => {
    const d = P.map(p => p[3](x, y, z));
    let t = smin(d[ix.hips], d[ix.waist], 0.12);
    t = smin(t, d[ix.ribcage], 0.1);
    let b = 1e9; for (let i = 0; i < P.length; i++) if (P[i][0] === 'bust') b = smin(b, d[i], 0.05);
    t = smin(t, b, 0.07);
    t = smin(t, d[ix.shoulders], 0.09);
    t = smin(t, d[ix.neck], 0.05);
    t = smin(t, d[ix.roll], 0.035);           // small k keeps a crease under the roll
    for (const k of ['L', 'R']) {
      let a = smin(d[ix['ua' + k]], d[ix['fa' + k]], 0.03);
      a = smin(a, d[ix['cuff' + k]], 0.01);
      a = smin(a, d[ix['fist' + k]], 0.012);
      t = smin(t, a, 0.045);
    }
    if (out) out.d = d;
    return t;
  };
}

export class Hachi {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.U = { uTime: { value: 0 } };
    this.bellyU = { uJig: { value: new THREE.Vector3() }, uRip: { value: 0 }, uFloor: { value: -9 }, uTime: this.U.uTime, uBreath: { value: 0 }, uDent: { value: new THREE.Vector4(0, 0, 1, 0.5) }, uDentD: { value: 0 }, uDentS: { value: new THREE.Vector3(1, 1, 1) } };
    this.skirtU = { uLegL: { value: new THREE.Vector2() }, uLegR: { value: new THREE.Vector2() }, uTime: this.U.uTime, uSkTop: { value: 1.42 }, uSkOff: { value: 0 } };
    this.face = new Face();
    this.build();
    this.phase = 0; this.lastStep = 0; this.speed = 0;
    this.jig = new THREE.Vector3(); this.jigV = new THREE.Vector3();
    this.rollP = new THREE.Vector3(); this.rollV = new THREE.Vector3();
    this.rip = 0; this.stage = 0; this.growV = 0; this.lift = 0;
    this.headYaw = 0; this.headPitch = 0; this.hug = 0; this.swayV = new THREE.Vector3(); this.sway = new THREE.Vector3();
    this.onStep = null;
    this.setStage(0, true);
  }

  buildBody() {
    const P = bodyPrims(), f = bodySDF(P);
    const t0 = performance.now();
    const g = surfaceNets((x, y, z) => f(x, y, z), [-0.86, 0.84, -0.32], [0.86, 2.42, 0.42], 0.0145);
    const n = g.positions.length / 3;
    // fix winding using normals
    const I = g.indices, Pp = g.positions, N = g.normals;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = Pp[b] - Pp[a], uy = Pp[b + 1] - Pp[a + 1], uz = Pp[b + 2] - Pp[a + 2];
      const vx = Pp[c] - Pp[a], vy = Pp[c + 1] - Pp[a + 1], vz = Pp[c + 2] - Pp[a + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      if (fx * (N[a] + N[b] + N[c]) + fy * (N[a + 1] + N[b + 1] + N[c + 1]) + fz * (N[a + 2] + N[b + 2] + N[c + 2]) < 0) { const tmp = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = tmp; }
    }
    // bones
    const B = {}; const mk = (name, parent, p) => { const b = new THREE.Bone(); b.name = name; B[name] = b; b.userData.rest = new THREE.Vector3(...p); if (parent) { B[parent].add(b); const pr = B[parent].userData.abs; b.position.set(p[0] - pr.x, p[1] - pr.y, p[2] - pr.z); } else b.position.set(...p); b.userData.abs = new THREE.Vector3(...p); return b; };
    mk('hips', null, [0, 1.1, 0]); mk('spine', 'hips', [0, 1.38, 0]); mk('chest', 'spine', [0, 1.72, -0.02]); mk('roll', 'spine', [0, 1.53, 0.17]);
    mk('neck', 'chest', [0, 2.1, -0.01]); mk('head', 'neck', [0, 2.18, 0.0]);
    for (const k of ['L', 'R']) { const A = ARMS[k]; mk('upperArm' + k, 'chest', A.sh); mk('foreArm' + k, 'upperArm' + k, A.el); mk('hand' + k, 'foreArm' + k, A.wr); }
    const names = Object.keys(B); const bi = Object.fromEntries(names.map((nm, i) => [nm, i]));
    // skin weights from soft primitive membership
    const skinI = new Uint16Array(n * 4), skinW = new Float32Array(n * 4), col = new Float32Array(n * 3);
    const armW = new Float32Array(n), armPh = new Float32Array(n), ribTan = new Float32Array(n * 3), cloth = new Float32Array(n);
    const out = {};
    for (let v = 0; v < n; v++) {
      const x = Pp[v * 3], y = Pp[v * 3 + 1], z = Pp[v * 3 + 2];
      f(x, y, z, out); const d = out.d; let dm = Infinity; for (const q of d) dm = Math.min(dm, q);
      const acc = {}; let clothAcc = 0, wsum = 0, armAcc = { L: 0, R: 0 }, uaAcc = 0, faAcc = 0;
      for (let i = 0; i < P.length; i++) {
        const [nm, bone, cl] = P[i]; const kk = (nm.startsWith('fist') || nm === 'neck') ? 0.012 : 0.028;
        const w = Math.exp(-(d[i] - dm) / kk); if (w < 1e-4) continue;
        let bones = [[bone, 1]];
        if (nm === 'waist') { const t = THREE.MathUtils.smoothstep(y, 1.2, 1.55); bones = [['hips', 1 - t], ['spine', t]]; }
        if (nm === 'ribcage') { const t = THREE.MathUtils.smoothstep(y, 1.62, 1.85); bones = [['spine', 1 - t], ['chest', t]]; }
        if (nm === 'shoulders') { const t = THREE.MathUtils.smoothstep(Math.abs(x), 0.14, 0.27); bones = [['chest', 1 - t], ['upperArm' + (x > 0 ? 'L' : 'R'), t]]; }
        if (nm.startsWith('ua')) { const A = ARMS[nm.slice(2)]; const al = (x - A.sh[0]) * A.dU[0] + (y - A.sh[1]) * A.dU[1]; const t = THREE.MathUtils.smoothstep(al, -0.03, 0.08); bones = [['chest', 1 - t], [bone, t]]; uaAcc += w; }
        if (nm.startsWith('fa') || nm.startsWith('cuff') || nm.startsWith('fist')) faAcc += w;
        for (const [bb, ww] of bones) acc[bb] = (acc[bb] || 0) + w * ww;
        clothAcc += w * cl; wsum += w;
        if (nm.endsWith('L') && (nm.startsWith('ua') || nm.startsWith('fa') || nm.startsWith('cuff') || nm.startsWith('fist'))) armAcc.L += w;
        if (nm.endsWith('R') && (nm.startsWith('ua') || nm.startsWith('fa') || nm.startsWith('cuff') || nm.startsWith('fist'))) armAcc.R += w;
      }
      const list = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 4); const s = list.reduce((a, b) => a + b[1], 0);
      list.forEach(([bb, ww], j) => { skinI[v * 4 + j] = bi[bb]; skinW[v * 4 + j] = ww / s; });
      const c = clothAcc / wsum; cloth[v] = c;
      const cr = 0.955 * c + SKIN_COL.r * (1 - c), cg = 0.948 * c + SKIN_COL.g * (1 - c), cb = 0.938 * c + SKIN_COL.b * (1 - c);
      col[v * 3] = cr; col[v * 3 + 1] = cg; col[v * 3 + 2] = cb;
      // arm rib frame (ribs run along the arm)
      const aw = (armAcc.L + armAcc.R) / wsum; armW[v] = THREE.MathUtils.smoothstep(aw, 0.3, 0.7);
      const A = armAcc.L > armAcc.R ? ARMS.L : ARMS.R;
      const up = uaAcc >= faAcc; const D = up ? A.dU : A.dF, O = up ? A.sh : A.el;
      const px = x - O[0], py = y - O[1], pz = z - O[2];
      const along = px * D[0] + py * D[1] + pz * D[2];
      let rx = px - D[0] * along, ry = py - D[1] * along, rz = pz - D[2] * along;
      // basis around arm axis: e1 = forward (z), e2 = d x e1 ; seam on the inside of the arm
      const e2x = D[1] * 1 - 0, e2y = -D[0] * 1, e2z = 0; // d x (0,0,1)
      const a1 = rz, a2 = rx * e2x + ry * e2y + rz * e2z;
      const sgn = A === ARMS.L ? 1 : -1;
      armPh[v] = Math.atan2(a2 * sgn, a1) * 26;
      // tangent = d x radial
      const tx = D[1] * rz - D[2] * ry, ty = D[2] * rx - D[0] * rz, tz = D[0] * ry - D[1] * rx; const tl = Math.hypot(tx, ty, tz) + 1e-9;
      ribTan[v * 3] = tx / tl; ribTan[v * 3 + 1] = ty / tl; ribTan[v * 3 + 2] = tz / tl;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(Pp, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
    geo.setAttribute('armW', new THREE.BufferAttribute(armW, 1));
    geo.setAttribute('armPh', new THREE.BufferAttribute(armPh, 1));
    geo.setAttribute('ribTan', new THREE.BufferAttribute(ribTan, 3));
    geo.setAttribute('cloth', new THREE.BufferAttribute(cloth, 1));
    geo.setIndex(I);
    const mat = knitMaterial({ ribs: 120, amp: 0.5, mode: 'body', key: 'body' });
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.add(B.hips);
    mesh.bind(new THREE.Skeleton(names.map(nm => B[nm])));
    mesh.frustumCulled = false;
    this.B = B; this.bodyMesh = mesh; this.sdf = f;
    this.buildMs = performance.now() - t0; this.bodyTris = I.length / 3;
    return mesh;
  }

  build() {
    const shadow = (m) => { m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; };
    this.upper = this.buildBody(); this.body.add(this.upper);
    const B = this.B;
    const skin = new THREE.MeshPhysicalMaterial({ color: SKIN_COL, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0xffd8d0) });

    // ---------- skirt (long dress below the belly, to the ground)
    const sk = lathe([[0.62, 0.0], [0.64, 0.025], [0.63, 0.2], [0.58, 0.5], [0.5, 0.85], [0.38, 1.15], [0.27, 1.38], [0.22, 1.48]], 96);
    sk.scale(1, 1, 0.8); sk.translate(0, 0, 0.03);
    { const p = sk.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, Math.max(0, p.getY(i))); }
    this.skirt = new THREE.Mesh(sk, knitMaterial({ ribs: 170, amp: 0.45, skirt: this.skirtU, key: 'skirt', extra: { side: THREE.DoubleSide } }));
    this.body.add(this.skirt);

    // ---------- feet
    const shoeMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f0ec, roughness: 0.3, clearcoat: 0.6 });
    this.feet = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.13, 8, 16), shoeMat); shoe.rotation.x = Math.PI / 2; shoe.position.set(0, 0.04, 0.05); shoe.scale.set(1, 1, 0.7);
      const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 12), shoeMat); heel.position.set(0, 0.03, -0.05);
      const ankle = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.3, 16), skin); ankle.position.set(0, 0.2, -0.02);
      g.add(shoe, heel, ankle); g.position.x = s * 0.13; this.body.add(g); this.feet.push(g);
    }

    // ---------- belly dome: perfectly round, heavy, jiggly
    const bg = new THREE.SphereGeometry(1, 160, 120);
    { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y < 0) { const k = 1 + (-y) * 0.05; x *= k; z *= k; } p.setXYZ(i, x, y, z); } bg.computeVertexNormals(); }
    this.belly = new THREE.Mesh(bg, knitMaterial({ ribs: 190, amp: 0.4, jiggle: this.bellyU, key: 'belly' }));
    this.body.add(this.belly);
    // upper belly roll: a smaller round bulge riding on top of the dome (visible crease where they meet)
    this.rollU = { uJig: { value: new THREE.Vector3() }, uRip: { value: 0 }, uFloor: { value: -9 }, uTime: this.U.uTime, uBreath: { value: 0 }, uDent: { value: new THREE.Vector4(0, 0, 1, 0.5) }, uDentD: { value: 0 }, uDentS: { value: new THREE.Vector3(1, 1, 1) } };
    this.rollMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 72), knitMaterial({ ribs: 150, amp: 0.4, jiggle: this.rollU, key: 'roll' }));
    this.body.add(this.rollMesh);

    // ---------- head (child of head bone)
    const head = this.head = new THREE.Group(); head.position.set(0, 0.105, 0.012); B.head.add(head);
    const rH = 0.118; this.rH = rH;
    const deformHead = (g, r) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); y *= 1.1; if (y < 0) { const q = y / r; const t = 1 + q * 0.18 - q * q * 0.2; x *= t; z *= 1 + q * 0.08; } if (z > 0) { z *= 1.0 - 0.06 * Math.max(0, -y / r); } p.setXYZ(i, x, y, z); } g.computeVertexNormals(); return g; };
    head.add(new THREE.Mesh(deformHead(new THREE.SphereGeometry(rH, 72, 54), rH), skin));
    const fg = deformHead(new THREE.SphereGeometry(rH * 1.003, 72, 54), rH);
    { const p = fg.attributes.position, uv = fg.attributes.uv; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (z > 0) uv.setXY(i, x / (2 * rH * 0.9) + 0.5, y / (2 * rH * 1.0) + 0.5 + 0.03); else uv.setXY(i, -1, -1); } }
    this.face.tex.wrapS = this.face.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.faceMesh = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: this.face.tex, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.faceMesh.renderOrder = 2; head.add(this.faceMesh);

    // ---------- hair: silky black hime cut (strand cards + Kajiya-Kay sheen + spring chains)
    this.hairU = { uTime: this.U.uTime, uHL: { value: 0.9 } };
    const capR = rH * 1.085;
    const downTan = (g) => { const p = g.attributes.position, n = g.attributes.normal, T = []; const d = new THREE.Vector3(), nn = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { nn.fromBufferAttribute(n, i); d.set(0, -1, 0).addScaledVector(nn, nn.y).normalize(); if (d.lengthSq() < 0.5) d.set(0, 0, 1); T.push(d.x, d.y, d.z); }
      g.setAttribute('hTan', new THREE.Float32BufferAttribute(T, 3)); return g; };
    const capMat = hairMaterial({ opaque: true, U: this.hairU, key: 'cap', repeatX: 6 });
    head.add(new THREE.Mesh(downTan(deformHead(new THREE.SphereGeometry(capR, 96, 40, 0, Math.PI * 2, 0, 1.28), rH)), capMat));
    head.add(new THREE.Mesh(downTan(deformHead(new THREE.SphereGeometry(capR * 1.01, 96, 48, Math.PI / 2 + 0.74, Math.PI * 2 - 1.48, 0, 2.55), rH)), capMat));
    // blunt bang fringe: short cards along the cut edge
    { const cards = []; const yc = 0; for (let k = 0; k < 26; k++) { const th = -0.95 + 1.9 * (k + 0.5) / 26; const pts = [];
        for (let i = 0; i <= 6; i++) { const t = i / 6; const ang = 1.0 + t * 0.32; const r = capR * 1.005 + 0.002 * t; pts.push(new THREE.Vector3(Math.sin(th) * Math.sin(ang) * r, Math.cos(ang) * r * 1.1 + yc, Math.cos(th) * Math.sin(ang) * r * (1 - 0.06 * t))); }
        cards.push({ pts, seed: Math.random(), width: 0.026, u0: Math.random(), du: 0.2, t0: 0, tScale: 0.15, out: () => new THREE.Vector3(Math.sin(th), 0, Math.cos(th)) }); }
      const fg = cardGeometry(cards); const fr = new THREE.Mesh(fg, hairMaterial({ U: this.hairU, key: 'fringe' })); head.add(fr); }
    // long back hair (anchored on the neck bone), 3 layers of cards
    const NB = B.neck.userData.abs, HC = new THREE.Vector3(0, B.head.userData.abs.y - NB.y + 0.105, 0.012 + 0.01);
    const backPath = (th, layer, len, jit) => { const pts = [];
      for (let i = 0; i <= 22; i++) { const t = i / 22; const ys = HC.y + 0.1 - t * len;
        const dy = (ys - HC.y) / 1.12; const head = Math.sqrt(Math.max(0, 0.1395 * 0.1395 - dy * dy));
        let Rr = ys > HC.y ? head : 0.1395; Rr += 0.008 * layer + jit * 0.004;
        const fan = ssr(HC.y - 0.22, HC.y - 0.62, ys);
        const push = ssr(HC.y - 0.25, HC.y - 0.5, ys);
        const x = Math.sin(th) * Rr * (1 + 1.25 * fan), z = HC.z - Math.cos(th) * Rr * 0.95 - (0.055 + 0.03 * Math.abs(th)) * push - 0.02 * fan;
        pts.push(new THREE.Vector3(x + Math.sin(t * 7 + jit * 9) * 0.003, ys, z)); }
      return pts; };
    { const cards = []; let rs = 7;
      const R = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
      for (let layer = 0; layer < 4; layer++) { const N = 28 - layer * 3; for (let k = 0; k < N; k++) {
        const th = -1.05 + 2.1 * (k + 0.5 + (R() - 0.5) * 0.6) / N; const len = 1.2 + R() * 0.12 - Math.abs(th) * 0.06;
        const jit = R() - 0.5; const pts = backPath(th, layer, len, jit);
        cards.push({ pts, seed: R(), width: 0.065 + R() * 0.025, u0: R(), du: 0.36, t0: 0, tScale: len / 1.25, out: () => new THREE.Vector3(Math.sin(th), 0, -Math.cos(th)) }); } }
      const rest = []; const ref = backPath(0, 1, 1.25, 0); for (let i = 0; i <= 6; i++) rest.push(ref[Math.round(i / 6 * 22)].clone());
      this.backChain = new HairChain(B.neck, rest, { k0: 190, k1: 26, damp: 4.2, clampFn: (v) => { v.z = Math.min(v.z, 0.03); } });
      const m = new THREE.Mesh(cardGeometry(cards), hairMaterial({ U: this.hairU, chain: this.backChain, key: 'back' })); m.frustumCulled = false; B.neck.add(m); }
    // front side locks: fall in front of the shoulders and over the chest
    { const F0 = this.sdf; const fz = (x, y) => { let z = 0.42; while (z > -0.1 && F0(x, y, z) > 0) z -= 0.002; return z; };
      this.lockChains = [];
      for (const s of [-1, 1]) {
        const lockPath = (xo, zo, len) => { const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; const y = 0.28 - t * len; const x = s * (0.104 + xo + t * 0.035); const ay = NB.y + y;
            const zb = ay < 2.16 ? fz(x, ay) + 0.022 : 0.03; pts.push(new THREE.Vector3(x, y, Math.max(0.03, zb) - NB.z + zo)); }
          for (let it = 0; it < 2; it++) for (let i = 1; i < 20; i++) pts[i].z = (pts[i - 1].z + pts[i].z * 2 + pts[i + 1].z) / 4;
          return pts; };
        const cards = []; let rs = s > 0 ? 11 : 23; const R = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
        for (let k = 0; k < 11; k++) { const xo = (k / 10) * 0.045 - 0.006 + (R() - 0.5) * 0.006, zo = (R() - 0.3) * 0.012 + (k % 2) * 0.006, len = 0.7 + R() * 0.1 - Math.abs(k - 5) * 0.008;
          cards.push({ pts: lockPath(xo, zo, len), seed: R(), width: 0.026 + R() * 0.01, u0: R(), du: 0.18, t0: 0, tScale: len / 0.78, out: () => new THREE.Vector3(0, 0.2, 1).normalize() }); }
        const ref = lockPath(0.02, 0, 0.78), rest = []; for (let i = 0; i <= 6; i++) rest.push(ref[Math.round(i / 6 * 20)].clone());
        const ch = new HairChain(B.neck, rest, { k0: 220, k1: 40, damp: 5, clampFn: (v) => { v.z = Math.max(v.z, -0.005); } }); this.lockChains.push(ch);
        const m = new THREE.Mesh(cardGeometry(cards), hairMaterial({ U: this.hairU, chain: ch, key: 'lock' + s })); m.frustumCulled = false; B.neck.add(m);
      } }

    // ---------- hat: big flat wide brim
    const hatMat = new THREE.MeshPhysicalMaterial({ color: 0xf5f4f0, roughness: 0.8, sheen: 0.5, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide });
    const hat = this.hat = new THREE.Group(); hat.position.set(0, 0.07, -0.005); hat.rotation.x = -0.08; head.add(hat);
    hat.add(new THREE.Mesh(lathe([[0.118, 0.013], [0.3, 0.002], [0.42, -0.025], [0.49, -0.055], [0.497, -0.064], [0.42, -0.036], [0.3, -0.01], [0.118, 0.0]], 128), hatMat));
    hat.add(new THREE.Mesh(lathe([[0.0, 0.14], [0.06, 0.137], [0.105, 0.122], [0.13, 0.08], [0.137, 0.0]], 72), hatMat));
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.1375, 0.1385, 0.035, 72, 1, true), new THREE.MeshStandardMaterial({ color: 0xe6e4de, roughness: 0.6, side: THREE.DoubleSide })); rib.position.y = 0.022; hat.add(rib);

    // ---------- polo collar + placket buttons (placed on the SDF surface, parented to the chest bone)
    const F = this.sdf, CH = B.chest.userData.abs;
    const toChest = (v) => new THREE.Vector3(v.x - CH.x, v.y - CH.y, v.z - CH.z);
    const radial = (y, th) => { let r = 0.02; while (r < 0.4 && F(Math.sin(th) * r, y, -0.01 + Math.cos(th) * r) < 0) r += 0.002; return r; };
    const frontZ = (x, y) => { let z = 0.42; while (z > -0.1 && F(x, y, z) > 0) z -= 0.0015; return z; };
    const nrm = (x, y, z) => { const e = 0.003; return new THREE.Vector3(F(x + e, y, z) - F(x - e, y, z), F(x, y + e, z) - F(x, y - e, z), F(x, y, z + e) - F(x, y, z - e)).normalize(); };
    const colMat = knitMaterial({ ribs: 60, amp: 0.3, key: 'collar', extra: { side: THREE.DoubleSide } });
    { // stand-up collar band hugging the neck base, open at the front
      const pts = []; for (let i = 0; i <= 48; i++) { const th = 0.32 + (Math.PI * 2 - 0.64) * i / 48; const y = 2.09 - 0.035 * Math.max(0, Math.cos(th)); const r = Math.min(radial(y, th), 0.068) + 0.004; pts.push(toChest(new THREE.Vector3(Math.sin(th) * r, y, -0.01 + Math.cos(th) * r))); }
      const band = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.013, 10, false), colMat); B.chest.add(band);
    }
    for (const s of [-1, 1]) { // fold-over collar points lying on the chest
      const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.quadraticCurveTo(s * 0.03, 0.014, s * 0.058, 0.012); fs.quadraticCurveTo(s * 0.05, -0.02, s * 0.03, -0.056); fs.quadraticCurveTo(s * 0.012, -0.03, 0, -0.012); fs.closePath();
      const flap = new THREE.Mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.0025, bevelSegments: 3, curveSegments: 12 }), colMat);
      const x0 = s * 0.012, y0 = 2.075, z0 = frontZ(x0 + s * 0.03, y0 - 0.025);
      const n = nrm(x0 + s * 0.03, y0 - 0.025, z0);
      flap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      flap.position.copy(toChest(new THREE.Vector3(x0, y0, frontZ(x0, y0) + 0.004)));
      B.chest.add(flap);
    }
    const btnMat = new THREE.MeshPhysicalMaterial({ color: 0xe8e5df, roughness: 0.25, clearcoat: 1 });
    const ys = [2.015, 1.975, 1.935];
    for (const y of ys) { const z = frontZ(0, y); const b = new THREE.Mesh(new THREE.SphereGeometry(0.0078, 16, 12), btnMat); b.scale.z = 0.45; b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm(0, y, z)); b.position.copy(toChest(new THREE.Vector3(0, y, z + 0.005))); B.chest.add(b); }
    { const y = 1.97, z = frontZ(0, y); const plk = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.115, 0.003), colMat); plk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm(0, y, z)); plk.position.copy(toChest(new THREE.Vector3(0, y, z + 0.002))); B.chest.add(plk); }

    shadow(this.root); this.faceMesh.castShadow = false;
    this.root.traverse(o => { if (o.isMesh && o.material && o.material.alphaToCoverage) o.castShadow = false; });
  }

  setStage(n, instant = false) {
    this.stage = n;
    this.gxT = 1 + 0.25 * n;                 // belly dome radius factor: unbounded, stays round
    this.scaleT = 1.3 * (1 + 0.08 * n);      // she slowly grows taller too
    if (instant) { this.gx = this.gxT; this.bodyScale = this.scaleT; }
    else { this.growV += 1.6; this.jigV.y += 1.2; this.rip = 1; }
  }
  get R() { return 0.6 * this.gx; }
  get radius() { return this.R * this.bodyScale; }
  domeY() { const R = this.R; return R * 0.93 + Math.max(0.03, 0.1 - (R - 0.6) * 0.3); }
  bellyCenter(out) { const z = (-0.17 + this.R) * this.bodyScale; out.set(Math.sin(this.root.rotation.y) * z, 0, Math.cos(this.root.rotation.y) * z).add(this.root.position); out.y = 0; return out; }
  get height() { return (2.62 + this.lift) * this.bodyScale; }
  get headWorldY() { return (2.30 + this.lift) * this.bodyScale; }
  get gy() { return this.gx; }

  // ---- belly dent (player sinking in during a restraint)
  surfacePoint(target, out, nOut) {
    const b = this.rollMesh; b.updateWorldMatrix(true, false);
    const pl = b.worldToLocal(_dp.copy(target)); if (pl.lengthSq() < 1e-6) pl.set(0, 0, 1); pl.normalize();
    out.copy(pl).applyMatrix4(b.matrixWorld);
    if (nOut) nOut.set(pl.x / (b.scale.x * b.scale.x), pl.y / (b.scale.y * b.scale.y), pl.z / (b.scale.z * b.scale.z)).transformDirection(b.matrixWorld);
    return out;
  }
  setDent(target, rWorld, dWorld) { this.dentT = target ? (this.dentT || new THREE.Vector3()).copy(target) : this.dentT; this.dentR = rWorld; this.dentD = dWorld; }
  slap() { this.jigV.z -= 1.2 + Math.random() * 0.3; this.jigV.x += (Math.random() - 0.5) * 0.8; this.jigV.y += 0.5; this.rip = Math.min(1.4, this.rip + 0.8); this.rollV.z -= 0.5; }
  bump(s = 1) { this.jigV.z -= 0.6 * s; this.jigV.y -= 0.6 * s; this.rip = Math.min(1.2, this.rip + 0.5 * s); this.rollV.y -= 0.2 * s; }

  update(dt, o) {
    const t = (this.U.uTime.value += dt), B = this.B;
    const gk = 1 - Math.exp(-dt * 3.2);
    this.gx += (this.gxT - this.gx) * gk; this.bodyScale += (this.scaleT - this.bodyScale) * gk * 0.8;
    this.growV *= Math.exp(-dt * 3); const pump = Math.sin(t * 18) * this.growV * 0.02;
    this.body.scale.setScalar(this.bodyScale);
    const sp = this.speed += ((o.speed || 0) - this.speed) * (1 - Math.exp(-dt * 6));
    const stride = 0.6;
    this.phase += (sp / this.bodyScale) / stride * Math.PI * dt;
    const ph = this.phase, walkAmt = Math.min(1, sp / 1.2);
    const stepIdx = Math.floor(ph / Math.PI);
    if (stepIdx !== this.lastStep && walkAmt > 0.15) {
      this.lastStep = stepIdx; const side = (stepIdx & 1) ? 1 : -1;
      this.jigV.y -= 0.55 * walkAmt; this.jigV.x += side * 0.26 * walkAmt; this.jigV.z += 0.1;
      this.rollV.y -= 0.3 * walkAmt;
      this.onStep && this.onStep(side, walkAmt);
    }
    // feet + skirt hem
    const fl = Math.sin(ph) * 0.28 * walkAmt, fr = -fl;
    const liftL = Math.max(0, Math.cos(ph)) * 0.08 * walkAmt, liftR = Math.max(0, -Math.cos(ph)) * 0.08 * walkAmt;
    this.feet[0].position.set(-0.13, liftL, fl); this.feet[1].position.set(0.13, liftR, fr);
    this.feet[0].rotation.x = -liftL * 2.5; this.feet[1].rotation.x = -liftR * 2.5;
    this.skirtU.uLegL.value.set(fl, liftL); this.skirtU.uLegR.value.set(fr, liftR);

    // belly dome placement (round in all directions) and upper-body lift
    const R = this.R, cy = this.domeY(), cz = -0.17 + R;
    this.lift = Math.max(-0.35, cy + 1.14 * R - 1.6 + 0.1 * Math.max(0, R - 0.6));
    const bob = Math.abs(Math.cos(ph)) * 0.03 * walkAmt;
    B.hips.position.y = 1.1 + this.lift + bob - 0.015 * walkAmt + Math.sin(t * 1.6) * 0.003;
    B.hips.rotation.set(0.02 * walkAmt, Math.sin(ph) * 0.06 * walkAmt, Math.sin(ph) * 0.035 * walkAmt);
    B.spine.rotation.set(0.0, -Math.sin(ph) * 0.04 * walkAmt, -Math.sin(ph) * 0.02 * walkAmt);
    B.chest.rotation.set(Math.sin(t * 1.9) * 0.01, -Math.sin(ph) * 0.03 * walkAmt, -Math.sin(ph) * 0.015 * walkAmt);
    this.belly.position.set(0, cy + bob * 0.5, cz);
    this.belly.scale.set(R * 1.1, R * 0.93, R * 1.02);
    this.bellyU.uFloor.value = -(cy + bob * 0.5) / (R * 0.93);
    const skg = Math.max(1, R * 1.1 / 0.62);
    this.skirt.scale.set(skg, (1.48 + this.lift) / 1.48, skg * 0.9 + 0.1);
    this.skirtU.uSkTop.value = 1.48;
 this.skirtU.uSkOff.value = Math.max(0, cz * 0.75) / (skg * 0.9 + 0.1);

    // springs: belly dome + upper roll bone
    const k = 70 / Math.sqrt(this.gx), c = 3.0;
    this.jigV.addScaledVector(this.jig, -k * dt).multiplyScalar(Math.exp(-c * dt)); this.jig.addScaledVector(this.jigV, dt);
    this.rollV.addScaledVector(this.rollP, -120 * dt).multiplyScalar(Math.exp(-5 * dt)); this.rollP.addScaledVector(this.rollV, dt);
    this.rip *= Math.exp(-dt * 2.2);
    this.bellyU.uJig.value.copy(this.jig).multiplyScalar(0.1);
    this.bellyU.uRip.value = this.rip; this.bellyU.uBreath.value = Math.sin(t * 1.9) * 0.007 + pump;
    { const front = cz + 0.8 * R, back = 0.05, rz = (front - back) / 2;
      this.rollMesh.position.set(this.rollP.x * 0.03 + this.jig.x * 0.02, cy + 0.68 * R + bob * 0.7 + this.rollP.y * 0.04 + this.jig.y * 0.01, back + rz + this.rollP.z * 0.03);
      this.rollMesh.scale.set(0.8 * R, 0.46 * R, rz);
      this.rollU.uJig.value.set(this.rollP.x * 0.12, this.rollP.y * 0.12, this.rollP.z * 0.12).addScaledVector(this.jig, 0.04);
      this.rollU.uRip.value = this.rip * 0.5; this.rollU.uBreath.value = this.bellyU.uBreath.value; }
    for (const [m, U] of [[this.rollMesh, this.rollU], [this.belly, this.bellyU]]) {
      if (this.dentT && Math.abs(this.dentD || 0) > 1e-4) {
        m.updateWorldMatrix(true, false);
        const pl = m.worldToLocal(_dp.copy(this.dentT));
        U.uDent.value.set(pl.x, pl.y, pl.z, this.dentR / this.bodyScale); U.uDentD.value = this.dentD / this.bodyScale; U.uDentS.value.copy(m.scale);
      } else U.uDentD.value = 0;
    }
    B.roll.position.set(0 + this.rollP.x * 0.02, 1.53 - 1.38 + this.rollP.y * 0.03 + this.jig.y * 0.004, 0.17 + this.rollP.z * 0.02);

    // arms: reference pose (fists up at shoulder height) + swing; hug pose
    this.hug += ((o.mode === 'hug' ? 1 : 0) - this.hug) * (1 - Math.exp(-dt * 6));
    const stun = o.mode === 'stun';
    for (const [kk, s] of [['L', 1], ['R', -1]]) {
      const sw = Math.sin(ph + (s > 0 ? 0 : Math.PI)) * walkAmt;
      const cheer = Math.sin(t * 2.2 + s) * 0.03 + (stun ? Math.sin(t * 14 + s) * 0.12 : 0);
      // desired directions in chest space
      const ua = new THREE.Vector3(s * 0.4, -0.9, 0.08 + sw * 0.18).normalize();
      const fa = new THREE.Vector3(s * 0.18, 0.95 + cheer, -0.02 + sw * 0.12).normalize();
      const uaH = new THREE.Vector3(s * 0.32, -0.45, 0.85).normalize();
      const faH = new THREE.Vector3(-s * 0.35, -0.2, 0.9).normalize();
      ua.lerp(uaH, this.hug).normalize(); fa.lerp(faH, this.hug).normalize();
      const rest = new THREE.Vector3(s * ARM_U[0], ARM_U[1], 0), restF = new THREE.Vector3(s * ARM_F[0], ARM_F[1], 0);
      const qu = new THREE.Quaternion().setFromUnitVectors(rest, ua);
      B['upperArm' + kk].quaternion.copy(qu);
      const local = fa.clone().applyQuaternion(qu.clone().invert());
      B['foreArm' + kk].quaternion.setFromUnitVectors(restF, local);
      B['hand' + kk].rotation.set(0.25, 0, -s * 0.2);
    }

    // head tracking
    let yaw = 0, pitch = 0.05;
    if (o.look) {
      const lp = B.head.getWorldPosition(_v); const dx = o.look.x - lp.x, dz = o.look.z - lp.z, dy = o.look.y - lp.y;
      const ang = Math.atan2(dx, dz) - this.root.rotation.y; const a = Math.atan2(Math.sin(ang), Math.cos(ang));
      yaw = THREE.MathUtils.clamp(a, -1.0, 1.0);
      pitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.2, 0.6);
      this.face.look[0] = THREE.MathUtils.clamp((a - yaw) * 1.5, -1, 1);
      this.face.look[1] = THREE.MathUtils.clamp(pitch * 1.5 - 0.3, -1, 1);
    }
    const hk = 1 - Math.exp(-dt * 5);
    this.headYaw += (yaw - this.headYaw) * hk; this.headPitch += (pitch - this.headPitch) * hk;
    B.neck.rotation.set(this.headPitch * 0.4, this.headYaw * 0.35, 0, 'YXZ');
    B.head.rotation.set(this.headPitch * 0.6, this.headYaw * 0.65, Math.sin(t * 0.9) * 0.03 + (stun ? Math.sin(t * 9) * 0.08 : 0), 'YXZ');

    // hair: spring chains (inertia from walking/turning + belly bounce)
    { const yaw = this.root.rotation.y, j = this.jigV; const imp = _hv.set(j.x * Math.cos(yaw) + j.z * Math.sin(yaw), j.y, -j.x * Math.sin(yaw) + j.z * Math.cos(yaw)).multiplyScalar(0.35 * this.bodyScale);
      this.backChain.update(dt, imp); for (const c of this.lockChains) c.update(dt, imp); }

    this.face.talk = o.talk || 0; this.face.update(dt);
  }
}
const ssr = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const _dp = new THREE.Vector3();
const _v = new THREE.Vector3(), _hv = new THREE.Vector3();
