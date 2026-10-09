// Silky long black hair: layered alpha strand cards, Kajiya-Kay style anisotropic sheen band,
// tapered tips, and spring-chain secondary motion (per-strand variation).
import * as THREE from 'three';

function strandTexture(opaque) {
  const W = 512, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  let s = 12345; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  if (opaque) { x.fillStyle = 'rgb(150,150,158)'; x.fillRect(0, 0, W, H); }
  else { // dense near the root, thinning toward the tip
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(150,150,158,1)'); g.addColorStop(0.55, 'rgba(150,150,158,0.9)'); g.addColorStop(0.8, 'rgba(150,150,158,0.25)'); g.addColorStop(0.95, 'rgba(150,150,158,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  for (let i = 0; i < 420; i++) {
    const px = R() * W, w = 0.8 + R() * 2.6, end = opaque ? H : H * (0.72 + R() * 0.28), v = 120 + R() * 135;
    const g = x.createLinearGradient(0, 0, 0, end);
    g.addColorStop(0, `rgba(${v},${v},${v + 8},0.9)`); g.addColorStop(0.85, `rgba(${v},${v},${v + 8},0.8)`); g.addColorStop(1, `rgba(${v},${v},${v + 8},0)`);
    x.strokeStyle = g; x.lineWidth = w; x.beginPath(); x.moveTo(px, 0);
    x.bezierCurveTo(px + (R() - 0.5) * 6, end * 0.33, px + (R() - 0.5) * 6, end * 0.66, px + (R() - 0.5) * 4, end); x.stroke();
  }
  // soft side fade so card edges never show
  if (!opaque) { x.globalCompositeOperation = 'destination-in'; const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.12, 'rgba(0,0,0,1)'); g.addColorStop(0.88, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function hairMaterial({ opaque = false, chain = null, U, key, repeatX = 1 }) {
  const map = strandTexture(opaque); map.repeat.set(repeatX, 1);
  const m = new THREE.MeshStandardMaterial({ color: 0x1a1a22, map, roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide,
    alphaTest: opaque ? 0 : 0.42, alphaToCoverage: !opaque, transparent: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uHL = U.uHL;
    if (chain) sh.uniforms.uChain = chain.uniform;
    sh.vertexShader = 'attribute vec3 hTan; attribute float aT; attribute float aSeed; uniform float uTime;\n' + (chain ? 'uniform vec3 uChain[7];\n' : '') +
      'varying vec3 vHT; varying float vSeed; varying float vT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vSeed = aSeed; vT = aT;
      ${chain ? `float fT = clamp(aT, 0.0, 1.0) * 6.0; int ci = int(min(floor(fT), 5.0));
      vec3 off = mix(uChain[ci], uChain[ci + 1], fT - float(ci));
      transformed += off * (0.85 + 0.3 * aSeed);
      transformed += vec3(sin(uTime * 1.3 + aSeed * 6.28 + aT * 2.2), 0.0, cos(uTime * 1.05 + aSeed * 4.0 + aT * 1.7)) * 0.005 * aT * aT;` : ''}
      vHT = normalize(mat3(modelViewMatrix) * hTan);`);
    sh.fragmentShader = 'uniform float uHL; uniform float uTime; varying vec3 vHT; varying float vSeed; varying float vT;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        vec3 T = normalize(vHT); vec3 Vd = normalize(vViewPosition); vec3 N = normalize(normal);
        vec3 L = normalize(Vd + vec3(0.12, 0.42, 0.0)); vec3 Hh = normalize(L + Vd);
        float j = (vSeed - 0.5) * 0.05;
        vec3 T1 = normalize(T + N * (-0.05 + j)), T2 = normalize(T + N * (0.3 + j));
        float d1 = dot(T1, Hh), d2 = dot(T2, Hh);
        float s1 = pow(max(0.0, sqrt(max(0.0, 1.0 - d1 * d1))), 70.0);
        float s2 = pow(max(0.0, sqrt(max(0.0, 1.0 - d2 * d2))), 26.0);
        float nz = 0.85 + 0.15 * sin(vMapUv.x * 40.0 + vSeed * 3.0);
        float lit = clamp(dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(0.33)) / max(dot(diffuseColor.rgb, vec3(0.33)), 0.002), 0.0, 1.6);
        float ndl = smoothstep(-0.2, 0.6, dot(N, L));
        outgoingLight += uHL * ndl * (0.3 + 0.7 * lit) * (vec3(0.85, 0.88, 1.0) * s1 * 0.26 + vec3(0.32, 0.36, 0.6) * s2 * 0.08 * nz);
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'hair_' + key;
  return m;
}

// strand-card mesh builder: each card follows a path (array of Vector3, root->tip), 3 verts across (rounded)
export function cardGeometry(cards) {
  const P = [], UV = [], TN = [], AT = [], SD = [], I = [];
  let base = 0;
  for (const cd of cards) {
    const pts = cd.pts, n = pts.length, seed = cd.seed;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const tan = new THREE.Vector3().subVectors(b, a).normalize();
      const out = cd.out(t).clone(); const side = new THREE.Vector3().crossVectors(tan, out).normalize();
      const w = cd.width * (1 - 0.55 * Math.pow(t, 2.2));
      for (let k = 0; k < 3; k++) {
        const u = k / 2, sx = (u - 0.5) * w;
        const bulge = (k === 1 ? 1 : 0) * w * 0.18;
        const p = pts[i].clone().addScaledVector(side, sx).addScaledVector(out, bulge);
        P.push(p.x, p.y, p.z); UV.push(cd.u0 + u * cd.du, t); TN.push(tan.x, tan.y, tan.z); AT.push(cd.tScale * t + cd.t0); SD.push(seed);
      }
      if (i < n - 1) for (let k = 0; k < 2; k++) { const q = base + i * 3 + k; I.push(q, q + 3, q + 1, q + 1, q + 3, q + 4); }
    }
    base += n * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('hTan', new THREE.Float32BufferAttribute(TN, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(AT, 1)); g.setAttribute('aSeed', new THREE.Float32BufferAttribute(SD, 1));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}

// spring chain simulated in world space, reported as offsets in the anchor's local space
export class HairChain {
  constructor(anchor, rest, { k0 = 160, k1 = 22, damp = 4.5, clampFn = null } = {}) {
    this.anchor = anchor; this.rest = rest.map(v => v.clone()); this.n = rest.length; // 7 nodes
    this.p = rest.map(() => new THREE.Vector3()); this.v = rest.map(() => new THREE.Vector3());
    this.uniform = { value: rest.map(() => new THREE.Vector3()) };
    this.k = rest.map((_, i) => k0 + (k1 - k0) * (i / (this.n - 1))); this.damp = damp; this.clampFn = clampFn;
    this.len = rest.map((r, i) => i ? r.distanceTo(rest[i - 1]) : 0); this.init = false;
    this._m = new THREE.Matrix4(); this._mi = new THREE.Matrix4(); this._t = new THREE.Vector3();
  }
  update(dt, impulse) {
    const a = this.anchor; a.updateWorldMatrix(true, false);
    const M = a.matrixWorld, Mi = this._mi.copy(M).invert();
    const sc = new THREE.Vector3().setFromMatrixScale(M).x;
    if (!this.init) { this.init = true; for (let i = 0; i < this.n; i++) this.p[i].copy(this.rest[i]).applyMatrix4(M); }
    dt = Math.min(dt, 1 / 30);
    const steps = 2, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.p[0].copy(this.rest[0]).applyMatrix4(M);
      for (let i = 1; i < this.n; i++) {
        const tgt = this._t.copy(this.rest[i]).applyMatrix4(M);
        const v = this.v[i];
        v.addScaledVector(tgt.sub(this.p[i]), this.k[i] * h);
        v.y -= 1.5 * h * sc * (i / this.n);
        if (impulse) v.addScaledVector(impulse, h * (i / (this.n - 1)));
        v.multiplyScalar(Math.exp(-this.damp * h));
        this.p[i].addScaledVector(v, h);
        // keep segment length (inextensible strands)
        const d = this._t.subVectors(this.p[i], this.p[i - 1]); const L = this.len[i] * sc, dl = d.length() || 1;
        this.p[i].copy(this.p[i - 1]).addScaledVector(d, L / dl);
      }
    }
    const U = this.uniform.value;
    for (let i = 0; i < this.n; i++) {
      U[i].copy(this.p[i]).applyMatrix4(Mi).sub(this.rest[i]);
      if (i === 0) U[i].set(0, 0, 0);
      if (this.clampFn) this.clampFn(U[i], i);
    }
  }
}
