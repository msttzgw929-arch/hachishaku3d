// Tiny SDF toolkit + surface-nets mesher (smooth, high-poly, analytic normals).
export const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
export function sdEllipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = len3(x / rx, y / ry, z / rz), k1 = len3(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}
// round cone between a (radius ra) and b (radius rb)
export function sdRoundCone(px, py, pz, a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  let h = (pax * bax + pay * bay + paz * baz) / l2; h = Math.max(0, Math.min(1, h));
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}
export function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

// Surface nets. f(x,y,z) -> distance. Returns {positions, normals}, indices
export function surfaceNets(f, min, max, cell) {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const F = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[idx(i, j, k)] = f(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);
  const vmap = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { v[c] = F[idx(i + corners[c][0], j + corners[c][1], k + corners[c][2])]; if (v[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t; sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t; sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t; n++;
    }
    let x = min[0] + (i + sx / n) * cell, y = min[1] + (j + sy / n) * cell, z = min[2] + (k + sz / n) * cell;
    // project onto the surface (2 newton steps)
    for (let it = 0; it < 2; it++) {
      const d = f(x, y, z), e = cell * 0.25;
      const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = len3(gx, gy, gz) / (2 * e) + 1e-9;
      x -= d * gx / (2 * e) / (gl * gl); y -= d * gy / (2 * e) / (gl * gl); z -= d * gz / (2 * e) / (gl * gl);
    }
    vmap[idx(i, j, k)] = pos.length / 3; pos.push(x, y, z);
  }
  const ind = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = F[idx(i, j, k)] < 0;
    // edges along +x, +y, +z from this grid point
    const tests = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let ax = 0; ax < 3; ax++) {
      const t = tests[ax]; if (i + t[0] >= nx || j + t[1] >= ny || k + t[2] >= nz) continue;
      const b = F[idx(i + t[0], j + t[1], k + t[2])] < 0; if (a === b) continue;
      // the 4 cells sharing this edge
      let q;
      if (ax === 0) q = [idx(i, j - 1, k - 1), idx(i, j, k - 1), idx(i, j, k), idx(i, j - 1, k)];
      else if (ax === 1) q = [idx(i - 1, j, k - 1), idx(i - 1, j, k), idx(i, j, k), idx(i, j, k - 1)];
      else q = [idx(i - 1, j - 1, k), idx(i, j - 1, k), idx(i, j, k), idx(i - 1, j, k)];
      const vs = q.map(c => vmap[c]); if (vs.some(x => x < 0)) continue;
      const flip = (ax === 1) ? !a : a;
      if (flip) ind.push(vs[0], vs[1], vs[2], vs[0], vs[2], vs[3]); else ind.push(vs[0], vs[2], vs[1], vs[0], vs[3], vs[2]);
    }
  }
  // analytic normals
  const nor = new Float32Array(pos.length), e = cell * 0.3;
  for (let p = 0; p < pos.length; p += 3) {
    const x = pos[p], y = pos[p + 1], z = pos[p + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const l = len3(gx, gy, gz) + 1e-12; nor[p] = gx / l; nor[p + 1] = gy / l; nor[p + 2] = gz / l;
  }
  return { positions: new Float32Array(pos), normals: nor, indices: ind };
}
