import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World, ROADS } from './world.js';
import { Hachi } from './hachi.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const Q = new URLSearchParams(location.search);

// ---------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0d1022, 0.021);
scene.background = new THREE.Color(0x05060c);
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 420);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0x5a6aa8, 0x221a26, 0.85));
const moon = new THREE.DirectionalLight(0x9aaee0, 0.75);
moon.position.set(-30, 60, -20); moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048); const sc = moon.shadow.camera; sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 160;
moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.04;
scene.add(moon); scene.add(moon.target);

const rt = new THREE.WebGLRenderTarget(innerWidth * pixelRatio, innerHeight * pixelRatio, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.45, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// dynamic light pool (nearest street lamps / neon / vending machines)
const LIGHTS = [];
for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xffffff, 0, 26, 2); scene.add(l); LIGHTS.push(l); }

const world = new World(scene);
const hachi = new Hachi();
scene.add(hachi.root);
// soft key light on her so she reads in the dark (like the reference rim/neon lighting)
const herLight = new THREE.PointLight(0xdfe8ff, 6, 9, 1.6); scene.add(herLight);
const herRim = new THREE.PointLight(0x5ac8ff, 4, 8, 1.6); scene.add(herRim);

const audio = new Audio();
audio.onSub = (txt) => { if (txt) { $('subtext').textContent = txt; $('subtitle').classList.remove('hidden'); clearTimeout(subT); } else { subT = setTimeout(() => $('subtitle').classList.add('hidden'), 700); } };
let subT = 0;

// heavy footsteps: sound + camera shake that grow with her size
hachi.onStep = (side, amt) => {
  if (S.mode !== 'play' && S.mode !== 'grab') return;
  const size = hachi.bodyScale * Math.sqrt(hachi.gx) / 1.12;
  const p = hachi.root.position; const d = Math.hypot(p.x - S.pos.x, p.z - S.pos.z);
  audio.footstep(new THREE.Vector3(p.x, 0.2, p.z), size);
  S.shake = Math.max(S.shake, Math.min(0.7, size * 0.55 / (1 + d * 0.22)) * amt);
};
// first-person hands (visible when slapping)
const hands = new THREE.Group(); camera.add(hands);
const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2d2c0, roughness: 0.6 });
const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x3a5a9a, roughness: 0.8 });
const handObjs = [-1, 1].map(s => {
  const g = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 4, 10), sleeveMat); arm.rotation.x = Math.PI / 2; arm.position.z = 0.18; g.add(arm);
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), skinMat); palm.scale.set(1, 0.45, 1.25); g.add(palm);
  for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.06, 3, 6), skinMat); f.rotation.x = Math.PI / 2; f.position.set(-0.03 + k * 0.02, 0, -0.09); g.add(f); }
  g.position.set(s * 0.26, -0.3, -0.34); g.scale.setScalar(0.75); g.userData = { s, t: 1 }; hands.add(g); return g;
});
hands.visible = false;

// ---------------- state
const S = {
  mode: 'title', time: 0, hearts: 3, irritation: 0, stage: 0, maxStage: 0, buildings: 0, escapes: 0, catches: 0,
  pos: new THREE.Vector3(), yaw: 0, pitch: 0, vel: new THREE.Vector3(), knock: new THREE.Vector3(), stamina: 100, exhausted: false, invuln: 0,
  bob: 0, stepAcc: 0, shake: 0,
  h: { pos: hachi.root.position, yaw: 0, path: null, pathT: 0, wp: 0, stun: 0, lunge: 0, lungeCd: 3, lostT: 0, sawPlayer: false, wasNear: false, tauntT: 6, smashCd: 0, exprT: 0, expr: null, stuckT: 0, lastPos: new THREE.Vector3(), speed: 0 },
  grab: null, overT: 0, angryT: 0,
};
window.__game = { S, hachi, world, audio, camera, renderer, scene, get info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, buildings: world.buildings.length, props: world.props.length, parks: world.parks.length }; } };

// ---------------- input
const keys = {};
let mouseDX = 0, mouseDY = 0, sprintTouch = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); if (S.mode === 'grab') slap(); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && S.mode === 'play' && (isTouch || stickUI)) pause();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
renderer.domElement.addEventListener('mousedown', (e) => {
  if (isTouch) return;
  if (S.mode === 'grab') { slap(); return; }
  if ((S.mode === 'play') && !stickUI && document.pointerLockElement !== renderer.domElement) lockPointer();
});
document.addEventListener('mousedown', (e) => { if (S.mode === 'grab' && !isTouch && e.target !== renderer.domElement && !e.target.closest('button')) slap(); });
addEventListener('mousemove', (e) => { if (document.pointerLockElement === renderer.domElement) { mouseDX += e.movementX; mouseDY += e.movementY; } });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && S.mode === 'play' && !isTouch && !stickUI && !S.ignoreUnlock) pause();
  S.ignoreUnlock = false;
});
function lockPointer() { if (isTouch || stickUI) return; try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }

// ---- dual virtual sticks (left: move, right: look). Pointer events -> works for touch, and for mouse when enabled on desktop (T key)
let stickUI = isTouch;
function setStickUI(on) { stickUI = on; document.body.classList.toggle('sticks', on); if (S.mode === 'play') $('touch').classList.toggle('hidden', !on); if (on && document.pointerLockElement) { S.ignoreUnlock = true; document.exitPointerLock(); } }
if (isTouch) document.body.classList.add('sticks');
addEventListener('keydown', (e) => { if (e.code === 'KeyT' && !isTouch && (S.mode === 'play' || S.mode === 'title')) setStickUI(!stickUI); });
const STICK_R = 58, DZ = 0.12;
const sticks = { L: { el: null, id: null, ox: 0, oy: 0, x: 0, y: 0 }, R: { el: null, id: null, ox: 0, oy: 0, x: 0, y: 0 } };
const lookVel = { x: 0, y: 0 };
function stickEls() { if (!sticks.L.el) { sticks.L.el = $('stickL'); sticks.R.el = $('stickR'); } }
function stickDown(st, e) {
  stickEls(); st.id = e.pointerId; st.ox = e.clientX; st.oy = e.clientY; st.x = st.y = 0;
  const el = st.el; el.classList.add('active'); el.style.left = (e.clientX - 65) + 'px'; el.style.top = (e.clientY - 65) + 'px'; el.style.right = el.style.bottom = 'auto';
}
function stickMove(st, e) {
  let dx = e.clientX - st.ox, dy = e.clientY - st.oy; const l = Math.hypot(dx, dy); if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
  st.el.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
  const m = Math.min(1, l / STICK_R); const k = m < DZ ? 0 : (m - DZ) / (1 - DZ); const n = l > 0 ? 1 / Math.max(l, 1e-6) : 0;
  st.x = dx * n * k; st.y = dy * n * k;
}
function stickUp(st) { stickEls(); st.id = null; st.x = st.y = 0; const el = st.el; el.classList.remove('active'); el.firstElementChild.style.transform = ''; el.style.left = el.style.top = el.style.right = el.style.bottom = ''; }
function resetSticks() { for (const k of ['L', 'R']) if (sticks[k].el || $('stickL')) stickUp(sticks[k]); }
document.body.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && !stickUI) return;
  if (e.target.closest('button') || e.target.closest('.panel') || e.target.closest('.screen')) return;
  if (S.mode === 'grab') { if (e.pointerType !== 'mouse') slap(); return; }
  if (S.mode !== 'play') return;
  const st = e.clientX < innerWidth * 0.45 ? sticks.L : sticks.R;
  if (st.id === null) { stickDown(st, e); try { document.body.setPointerCapture(e.pointerId); } catch (_) { } }
  e.preventDefault();
}, { passive: false });
document.body.addEventListener('pointermove', (e) => { for (const k of ['L', 'R']) if (sticks[k].id === e.pointerId) stickMove(sticks[k], e); });
const pEnd = (e) => { for (const k of ['L', 'R']) if (sticks[k].id === e.pointerId) stickUp(sticks[k]); };
document.body.addEventListener('pointerup', pEnd); document.body.addEventListener('pointercancel', pEnd);
$('sprint-btn').addEventListener('touchstart', (e) => { sprintTouch = !sprintTouch; $('sprint-btn').classList.toggle('on', sprintTouch); e.preventDefault(); e.stopPropagation(); }, { passive: false });
$('pause-btn').addEventListener('click', () => { if (S.mode === 'play') pause(); });

// ---------------- UI
$('start-btn').onclick = () => startGame();
$('howto-btn').onclick = () => $('howto').classList.remove('hidden');
$('howto-close').onclick = () => $('howto').classList.add('hidden');
$('resume-btn').onclick = () => resume();
$('quit-btn').onclick = () => toTitle();
$('retry-btn').onclick = () => startGame();
$('title-btn').onclick = () => toTitle();
const best = () => +(localStorage.getItem('hachi3d_best') || 0);
function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; }
function showBest() { $('best').textContent = best() ? `ベスト記録：${fmt(best())}` : ''; }
showBest();
let annT = 0;
function announce(html, dur = 2.6) { const a = $('announce'); a.innerHTML = html; a.classList.add('show'); annT = dur; }
function flash(color = '#fff', a = 0.6) { const f = $('flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; }); }

// ---------------- game flow
function placeHachiTitle() {
  // title scene: she stands in an alley, camera slowly circles low
  hachi.setStage(0, true);
  hachi.root.position.set(ROADS[4] + 0, 0, ROADS[4] - 9);
  hachi.root.rotation.y = 0;
}
function resetGame() {
  S.time = 0; S.hearts = 3; S.irritation = 0; S.stage = 0; S.maxStage = 0; S.buildings = 0; S.escapes = 0; S.catches = 0;
  S.stamina = 100; S.exhausted = false; S.invuln = 2; S.vel.set(0, 0, 0); S.knock.set(0, 0, 0);
  S.pos.set(ROADS[4] + 0, 0, ROADS[5] - 2); S.yaw = Math.PI; S.pitch = 0.05;
  hachi.setStage(0, true);
  const h = S.h; h.pos.set(ROADS[4], 0, ROADS[4] - 4); h.yaw = 0; hachi.root.rotation.y = 0; h.path = null; h.stun = 0; h.lunge = 0; h.lungeCd = 4; h.lostT = 0; h.wasNear = false; h.tauntT = 7; h.smashCd = 0; h.stuckT = 0;
  hachi.face.set('smug');
}
async function startGame() {
  $('title').classList.add('hidden'); $('over').classList.add('hidden'); $('pause').classList.add('hidden');
  lockPointer();
  await audio.init();
  resetGame();
  S.mode = 'play';
  $('hud').classList.remove('hidden'); if (stickUI) $('touch').classList.remove('hidden');
  setTimeout(() => { if (S.mode === 'play') { audio.say('spot', headPos()); setExpr('delight', 1.4); } }, 900);
  announce('逃げろ！<small>八尺様に捕まるな！</small>', 2.2);
}
function pause() { if (S.mode !== 'play') return; S.mode = 'pause'; $('pause').classList.remove('hidden'); if (audio.ctx) audio.ctx.suspend(); }
function resume() { $('pause').classList.add('hidden'); S.mode = 'play'; if (audio.ctx) audio.ctx.resume(); lockPointer(); }
function toTitle() {
  S.mode = 'title'; ['hud', 'touch', 'grab', 'over', 'pause', 'subtitle'].forEach(i => $(i).classList.add('hidden')); $('title').classList.remove('hidden'); showBest();
  if (audio.ctx) audio.ctx.resume(); audio.stopVoice(); hands.visible = false; placeHachiTitle();
  if (document.pointerLockElement) { S.ignoreUnlock = true; document.exitPointerLock(); }
}
function gameOver() {
  S.mode = 'over'; document.body.classList.remove('grabbing'); hands.visible = false;
  $('grab').classList.add('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  $('score-time').textContent = fmt(S.time); $('score-lv').textContent = 'Lv.' + S.maxStage; $('score-bld').textContent = S.buildings; $('score-esc').textContent = S.escapes;
  const nb = S.time > best(); if (nb) localStorage.setItem('hachi3d_best', S.time.toFixed(1));
  $('score-best').textContent = nb ? '★ ベスト記録更新！ ★' : `ベスト：${fmt(best())}`;
  $('over').classList.remove('hidden');
  if (document.pointerLockElement) { S.ignoreUnlock = true; document.exitPointerLock(); }
}

function headPos() { return new THREE.Vector3(S.h.pos.x, hachi.headWorldY, S.h.pos.z); }
function setExpr(name, dur = 0) { hachi.face.set(name); S.h.expr = name; S.h.exprT = dur; }

// ---------------- capture / slap
function startGrab() {
  S.catches++; S.hearts--;
  S.irritation = Math.max(0, S.irritation - 35);
  const final = S.hearts <= 0;
  S.mode = 'grab';
  const need = Math.min(12, 7 + S.catches);
  S.grab = { hits: 0, need, t: 0, limit: 7.5, final, slapAnim: 0 };
  hands.visible = !final;
  audio.sting(); flash('#ff2050', 0.35); S.shake = 0.5;
  audio.say(final ? 'over' : 'catch', headPos(), true);
  setExpr('delight', 99);
  hachi.bump(1.2);
  if (!final) { $('grab').classList.remove('hidden'); updateGrabUI(); }
  resetSticks();
}
function updateGrabUI() { const g = S.grab; $('grab-bar').style.width = (100 * g.hits / g.need) + '%'; $('grab-count').textContent = `${g.hits} / ${g.need}`; $('grab-timer').style.width = (100 * (1 - g.t / g.limit)) + '%'; }
let slapSide = 1;
function slap() {
  const g = S.grab; if (!g || g.final || g.done) return;
  g.hits++; slapSide = -slapSide; const h = handObjs[slapSide > 0 ? 1 : 0]; h.userData.t = 0;
  hachi.slap(); audio.slap(); S.shake = Math.max(S.shake, 0.18);
  S.dent.v -= 1.9 * hachi.bodyScale; // pop out a little, then sink back with a wobble
  setExpr('hurt', 0.45);
  if (Math.random() < 0.5 || g.hits === 1) audio.say('slap', headPos());
  updateGrabUI();
  if (g.hits >= g.need) { g.done = true; setTimeout(escapeGrab, 120); }
}
function escapeGrab() {
  S.mode = 'play'; S.escapes++; $('grab').classList.add('hidden'); hands.visible = false;
  const dir = new THREE.Vector3(S.pos.x - S.h.pos.x, 0, S.pos.z - S.h.pos.z).normalize();
  S.knock.copy(dir).multiplyScalar(11 + hachi.radius * 2.5); S.invuln = 2.6; S.h.stun = 1.6; S.yaw = Math.atan2(-dir.x, -dir.z) + Math.PI;
  audio.escape(); audio.say('escape', headPos(), true); setExpr('surprised', 1.0); S.h.nextExpr = 'pout';
  hachi.slap(); flash('#5ff2ff', 0.25);
  S.dent.v -= 2.6 * hachi.bodyScale; hachi.jigV.z += 2.4; hachi.jigV.y += 1.6; hachi.jigV.x += (Math.random() - 0.5) * 1.5; hachi.rip = 1.4; // big spring-back jiggle
  S.irritation = Math.min(99, S.irritation + 12);
  announce('脱出成功！', 1.4);
}

// ---------------- irritation / growth
function stageUp() {
  S.stage++; S.maxStage = Math.max(S.maxStage, S.stage); S.irritation = 0;
  hachi.setStage(S.stage); audio.grow(); S.shake = 0.6;
  audio.say('irritate', headPos(), true); setExpr(S.stage >= 3 ? 'furious' : 'angry', 3.2);
  const msg = S.stage === 1 ? 'お腹がふくらんだ！' : S.stage < 4 ? 'お腹がさらに巨大化！' : 'お腹がとまらない！！';
  announce(`イライラ Lv.${S.stage}<small>${msg}${S.stage === 1 ? '（小さな建物なら壊せる）' : S.stage === 2 ? '（中くらいの建物も壊せる）' : S.stage === 3 ? '（もう何でも壊せる）' : ''}</small>`, 3);
  flash('#ff3b6b', 0.3);
}

// ---------------- update
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), bc = new THREE.Vector3();
let heartT = 0, lightT = 0;
function updatePlayer(dt) {
  // look
  const sens = 0.0022;
  S.yaw -= mouseDX * sens; S.pitch -= mouseDY * sens; mouseDX = mouseDY = 0;
  { // right stick: rate-based look with smoothing and an expo curve for fine aim
    const rx = sticks.R.x, ry = sticks.R.y, kk = 1 - Math.exp(-dt * 12);
    lookVel.x += (rx * Math.abs(rx) * 2.9 - lookVel.x) * kk; lookVel.y += (ry * Math.abs(ry) * 2.1 - lookVel.y) * kk;
    S.yaw -= lookVel.x * dt; S.pitch -= lookVel.y * dt;
  }
  S.pitch = THREE.MathUtils.clamp(S.pitch, -1.2, 1.48);
  // keyboard yaw for arrows left/right? -> strafe. (simple controls)
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  mx += sticks.L.x; mz += sticks.L.y;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const wantSprint = (keys.ShiftLeft || keys.ShiftRight || sprintTouch) && ml > 0.1;
  const sprint = wantSprint && !S.exhausted;
  if (sprint) { S.stamina -= dt * 20; if (S.stamina <= 0) { S.stamina = 0; S.exhausted = true; } }
  else { S.stamina = Math.min(100, S.stamina + dt * (ml > 0.1 ? 11 : 18)); if (S.exhausted && S.stamina > 35) S.exhausted = false; }
  const speed = sprint ? 6.1 : 3.5;
  const sin = Math.sin(S.yaw), cos = Math.cos(S.yaw);
  const tx = (mx * cos + mz * sin) * speed, tz = (-mx * sin + mz * cos) * speed;
  const k = 1 - Math.exp(-dt * 12);
  S.vel.x += (tx - S.vel.x) * k; S.vel.z += (tz - S.vel.z) * k;
  S.pos.addScaledVector(S.vel, dt).addScaledVector(S.knock, dt);
  S.knock.multiplyScalar(Math.exp(-dt * 4));
  world.collide(S.pos, 0.32); world.collideProps(S.pos, 0.32);
  const sp = Math.hypot(S.vel.x, S.vel.z);
  S.bob += sp * dt * 2.2;
  S.stepAcc += sp * dt; if (S.stepAcc > (sprint ? 1.25 : 0.95)) { S.stepAcc = 0; audio.playerStep(sprint); }
  S.invuln = Math.max(0, S.invuln - dt);
}

function hachiTargetSpeed() {
  const base = 3.75 + S.irritation * 0.005;
  return base * Math.max(0.62, 1 - 0.055 * S.stage);
}

function updateHachi(dt) {
  const h = S.h, r = hachi.radius;
  h.smashCd = Math.max(0, h.smashCd - dt);
  const dx = S.pos.x - h.pos.x, dz = S.pos.z - h.pos.z; const dist = Math.hypot(dx, dz);
  hachi.bellyCenter(bc);
  const bdist = Math.hypot(S.pos.x - bc.x, S.pos.z - bc.z) - r;
  // line of sight
  const los = !world.segmentBlocked(h.pos.x, h.pos.z, S.pos.x, S.pos.z, -1);
  if (los) { if (h.lostT > 5 && dist < 45 && !(audio.cur && audio.cur.playing)) { audio.say('spot', headPos()); setExpr('delight', 1.2); } h.lostT = 0; } else h.lostT += dt;
  // escaped from close range?
  if (dist < 7) h.wasNear = true;
  if (h.wasNear && (dist > 24 || h.lostT > 4)) { h.wasNear = false; audio.say('escape', headPos()); setExpr('surprised', 0.9); h.nextExpr = 'pout'; S.irritation = Math.min(99, S.irritation + 8); }
  // movement
  let speed = 0; let want = null;
  if (h.stun > 0) { h.stun -= dt; }
  else if (S.mode === 'play') {
    const direct = !world.segmentBlocked(h.pos.x, h.pos.z, S.pos.x, S.pos.z, S.stage, Math.min(1.2, r * 0.5));
    if (direct) { want = tmp.set(dx, 0, dz); h.path = null; }
    else {
      h.pathT -= dt;
      if (!h.path || h.pathT <= 0) { h.path = world.findPath(h.pos.x, h.pos.z, S.pos.x, S.pos.z, S.stage); h.pathT = 0.5; h.wp = 0; }
      if (h.path && h.path.length) {
        // advance waypoints / shortcut when visible
        while (h.wp < h.path.length - 1 && !world.segmentBlocked(h.pos.x, h.pos.z, h.path[h.wp + 1].x, h.path[h.wp + 1].z, S.stage, 0.6)) h.wp++;
        const w = h.path[h.wp]; if (Math.hypot(w.x - h.pos.x, w.z - h.pos.z) < 1 && h.wp < h.path.length - 1) h.wp++;
        want = tmp.set(w.x - h.pos.x, 0, w.z - h.pos.z);
      } else want = tmp.set(dx, 0, dz);
    }
    speed = hachiTargetSpeed();
    h.lungeCd -= dt;
    if (h.lunge > 0) { h.lunge -= dt; speed *= 1.55; }
    else if (dist < 6 && h.lungeCd <= 0 && los) { h.lunge = 0.75; h.lungeCd = 5 + Math.random() * 3; }
    if (S.invuln > 0 && bdist < 3) speed *= 0.3;
  }
  if (want && want.lengthSq() > 0.01) {
    want.normalize();
    const ty = Math.atan2(want.x, want.z); let d = ty - h.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    h.yaw += d * (1 - Math.exp(-dt * 5));
    const align = Math.max(0.3, Math.cos(d));
    h.speed += (speed * align - h.speed) * (1 - Math.exp(-dt * 4));
    h.pos.x += Math.sin(h.yaw) * h.speed * dt; h.pos.z += Math.cos(h.yaw) * h.speed * dt;
  } else h.speed *= Math.exp(-dt * 5);
  hachi.root.rotation.y = h.yaw;
  // collisions with unbreakable buildings
  world.collide(h.pos, Math.max(0.55, r * 0.75), (b) => b.toughness > S.stage);
  // stuck detection -> she gets mad and smashes whatever is in the way
  h.stuckT += dt; if (h.stuckT > 1.5) { const moved = h.pos.distanceTo(h.lastPos); if (moved < 0.6 && S.mode === 'play' && h.stun <= 0) smashNear(r + 2.5, true); h.lastPos.copy(h.pos); h.stuckT = 0; }
  // smashing
  hachi.bellyCenter(bc);
  for (const b of world.buildings) {
    if (!b.alive || b.toughness > S.stage) continue;
    const qx = Math.max(b.x0, Math.min(bc.x, b.x1)), qz = Math.max(b.z0, Math.min(bc.z, b.z1));
    if (Math.hypot(bc.x - qx, bc.z - qz) < r * 0.98) smashBuilding(b);
  }
  for (const p of world.props) {
    if (!p.alive) continue;
    const rr = p.kind === 'small' ? r + 0.3 : r * 0.95;
    if (Math.hypot(p.x - bc.x, p.z - bc.z) < rr || Math.hypot(p.x - h.pos.x, p.z - h.pos.z) < 0.6 * hachi.bodyScale) { world.knock(p, h.pos, 0.5 + S.stage * 0.2); audio.thud(tmp2.set(p.x, 1, p.z)); hachi.bump(0.4); }
  }
  // catch
  if (S.mode === 'play' && S.invuln <= 0 && h.stun <= 0 && bdist < 0.5) startGrab();
  // irritation
  if (S.mode === 'play') {
    S.irritation += dt * (2.7 + (dist > 16 ? 1.6 : 0) + (!los ? 1.0 : 0) + Math.min(2, S.stage * 0.25));
    if (S.irritation >= 100) stageUp();
  }
  // taunts
  h.tauntT -= dt;
  if (h.tauntT <= 0 && S.mode === 'play') { h.tauntT = 8 + Math.random() * 6; if (dist < 45 && !(audio.cur && audio.cur.playing)) audio.say('taunt', headPos()); }
  // expressions
  if (h.exprT > 0) { h.exprT -= dt; if (h.exprT <= 0) { if (h.nextExpr) { setExpr(h.nextExpr, 2.2); h.nextExpr = null; } } }
  if (h.exprT <= 0) hachi.face.set(S.irritation > 70 ? (S.stage >= 3 ? 'furious' : 'angry') : S.irritation > 45 ? 'pout' : 'smug');
  return dist;
}
function smashBuilding(b) {
  world.smash(b, S.h.pos); S.buildings++;
  const d = Math.hypot(b.cx - S.pos.x, b.cz - S.pos.z);
  audio.crash(new THREE.Vector3(b.cx, 2, b.cz), Math.min(1.5, b.h / 12));
  S.shake = Math.max(S.shake, Math.min(1.2, 14 / (d + 6)));
  hachi.bump(1.5);
  if (S.h.smashCd <= 0) { S.h.smashCd = 7; setTimeout(() => audio.say('smash', headPos()), 300); setExpr(Math.random() < 0.5 ? 'delight' : 'furious', 1.5); }
}
function smashNear(rad, force) {
  hachi.bellyCenter(bc); let best = null, bd = 1e9;
  for (const b of world.buildings) { if (!b.alive) continue; const qx = Math.max(b.x0, Math.min(bc.x, b.x1)), qz = Math.max(b.z0, Math.min(bc.z, b.z1)); const d = Math.hypot(bc.x - qx, bc.z - qz); if (d < rad && d < bd) { bd = d; best = b; } }
  if (best) smashBuilding(best);
}

function updateGrab(dt) {
  const g = S.grab; g.t += dt;
  const h = S.h;
  // sink into the belly: find the contact point on the upper-front of the dome, dent it, press the camera in
  hachi.bellyCenter(bc);
  const dir = tmp.set(S.pos.x - bc.x, 0, S.pos.z - bc.z); if (dir.lengthSq() < 1e-4) dir.set(Math.sin(h.yaw), 0, Math.cos(h.yaw)); dir.normalize();
  const bs = hachi.bodyScale, Rw = hachi.radius;
  const aim = tmp2.copy(bc).addScaledVector(dir, Rw * 3); aim.y = hachi.rollMesh.getWorldPosition(dentP).y + hachi.rollMesh.scale.y * bs * 0.9;
  hachi.surfacePoint(aim, dentP, dentN);
  updateDent(dt);
  const camP = tmp2.copy(dentP).addScaledVector(dentN, -0.5 * S.dent.d + 0.07 * bs);
  S.pos.x += (camP.x - S.pos.x) * (1 - Math.exp(-dt * 10)); S.pos.z += (camP.z - S.pos.z) * (1 - Math.exp(-dt * 10));
  S.camY = camP.y;
  // face the player
  const ty = Math.atan2(S.pos.x - h.pos.x, S.pos.z - h.pos.z); let d = ty - h.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); h.yaw += d * (1 - Math.exp(-dt * 6)); hachi.root.rotation.y = h.yaw;
  // camera looks up at her face (she looks down at you)
  const hp = headPos(); const lx = hp.x - S.pos.x, lz = hp.z - S.pos.z;
  const wantYaw = Math.atan2(-lx, -lz); let dy = wantYaw - S.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); S.yaw += dy * (1 - Math.exp(-dt * 6));
  const wantPitch = Math.atan2(hp.y - S.camY, Math.hypot(lx, lz)) * 0.8; S.pitch += (wantPitch - S.pitch) * (1 - Math.exp(-dt * 6));
  mouseDX = mouseDY = 0;
  if (Math.random() < dt * 3) hachi.jigV.y += 0.3; // she squeezes
  if (g.final) { if (g.t > 3.8) gameOver(); return; }
  updateGrabUI();
  if (!g.done && g.t > g.limit) { g.final = true; g.t = 0; $('grab').classList.add('hidden'); hands.visible = false; audio.say('over', headPos(), true); setExpr('delight', 99); S.hearts = 0; }
  // hands animation
  for (const hnd of handObjs) { const u = hnd.userData; u.t = Math.min(1, u.t + dt * 6); const p = Math.sin(u.t * Math.PI); hnd.position.set(u.s * (0.26 - p * 0.08), -0.3 + p * 0.05, -0.34 - p * 0.14); hnd.rotation.set(0.5 - p * 0.5, 0, u.s * 0.35); }
}

const dentP = new THREE.Vector3(), dentN = new THREE.Vector3();
S.dent = { d: 0, v: 0 };
function dentTarget() {
  if (S.mode !== 'grab') return 0;
  const bs = hachi.bodyScale, g = S.grab, t = performance.now() / 1000;
  const base = (g && g.final ? 0.34 : 0.26) * bs;
  return base + Math.sin(t * 1.7) * 0.03 * bs + Math.max(0, Math.sin(t * 0.85)) * 0.025 * bs; // slow squishy breathing / pressing pulses
}
function updateDent(dt) {
  const D = S.dent, k = 38, c = 4.2;
  D.v += (k * (dentTarget() - D.d) - c * D.v) * dt; D.d += D.v * dt;
  const r = 0.27 * hachi.bodyScale + 0.07 * hachi.radius;
  hachi.setDent(dentP, r, D.d);
  const a = THREE.MathUtils.clamp(D.d / (0.22 * hachi.bodyScale), 0, 1.2);
  $('sinkfx').style.opacity = Math.min(1, a).toFixed(3);
  audio.setMuffle && audio.setMuffle(Math.min(1, a));
}

function updateLights() {
  const src = world.lightSources();
  const p = S.mode === 'title' ? camera.position : S.pos;
  src.sort((a, b) => a.pos.distanceToSquared(p) - b.pos.distanceToSquared(p));
  for (let i = 0; i < LIGHTS.length; i++) {
    const l = LIGHTS[i], s = src[i];
    if (s) { l.position.copy(s.pos); l.color.copy(s.color); l.intensity = s.power * (s.obj ? 9 : 20); } else l.intensity = 0;
  }
}

function updateCamera(dt, dist) {
  // during a restraint she hugs you up against her upper belly so you face her
  const glT = S.mode === 'grab' ? (S.camY || 1.02) - 1.02 : 0;
  S.gl = (S.gl || 0) + (glT - (S.gl || 0)) * (1 - Math.exp(-dt * (S.mode === 'grab' ? 9 : 4)));
  const eye = 1.02 + S.gl;
  S.shake = Math.max(0, S.shake - dt * 1.6);
  const sh = S.shake * S.shake;
  const bobY = Math.sin(S.bob * Math.PI) * 0.035, bobX = Math.cos(S.bob * Math.PI * 0.5) * 0.02;
  camera.position.set(S.pos.x + (Math.random() - 0.5) * sh * 0.25, eye + bobY + (Math.random() - 0.5) * sh * 0.25, S.pos.z + (Math.random() - 0.5) * sh * 0.25);
  camera.rotation.set(S.pitch + (Math.random() - 0.5) * sh * 0.03, S.yaw, bobX * 0.3, 'YXZ');
  const targetFov = S.mode === 'grab' ? 82 : (Math.hypot(S.vel.x, S.vel.z) > 5 ? 80 : 74);
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-dt * 5)); camera.updateProjectionMatrix();
}

// ---------------- main loop
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, lowT = 0, titleT = 0;
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, clock.getDelta());
  if (window.__fixedDt) dt = window.__fixedDt;
  for (let i = 0; i < (window.__simSteps || 1); i++) tick(dt);
  if (window.__topdown) { // debug: whole-map overview
    camera.position.set(0, 300, 0.01); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.fov = 52; camera.updateProjectionMatrix();
    scene.fog.density = 0.0006; world.cull(camera.position, 1e4); renderer.toneMappingExposure = window.__topdown;
  }
  composer.render();
  // adaptive resolution
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 42 && !window.__fixedDt) { lowT++; if (pixelRatio > 0.65) { pixelRatio = Math.max(0.65, pixelRatio - 0.2); applySize(); } else if (lowT > 3 && renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); } } }
}
function tick(dt) {
  lightT -= dt; if (lightT <= 0) { lightT = 0.25; updateLights(); world.cull(camera.position); }
  world.update(dt);
  let dist = 99;
  if (S.mode === 'title') {
    titleT += dt;
    const hp = hachi.root.position; const a = Math.sin(titleT * 0.18) * 0.6;
    camera.position.set(hp.x + Math.sin(a) * 3.7, 0.9, hp.z + Math.cos(a) * 3.7);
    camera.lookAt(hp.x - 1.15 * Math.cos(a), 2.05, hp.z + 1.15 * Math.sin(a));
    hachi.update(dt, { speed: 0, look: camera.position, mode: 'walk', talk: 0 });
    if (Math.random() < dt * 0.4) hachi.jigV.y -= 0.5;
    hachi.face.set(Math.sin(titleT * 0.4) > 0.75 ? 'delight' : 'smug');
  } else if (S.mode === 'play' || S.mode === 'grab' || S.mode === 'over') {
    if (S.mode === 'play') { S.time += dt; updatePlayer(dt); }
    if (S.mode === 'grab') updateGrab(dt);
    else if (Math.abs(S.dent.d) > 1e-3 || Math.abs(S.dent.v) > 1e-3) { updateDent(dt); if (Math.abs(S.dent.d) < 2e-3 && Math.abs(S.dent.v) < 2e-2) { S.dent.d = S.dent.v = 0; updateDent(0); } }
    if (S.mode !== 'over') dist = updateHachi(dt);
    const talk = audio.voiceLevel();
    hachi.update(dt, { speed: S.mode === 'play' ? S.h.speed : 0, look: camera.position, mode: S.mode === 'grab' ? 'hug' : (S.h.stun > 0 ? 'stun' : 'walk'), talk });
    if (S.mode !== 'over') updateCamera(dt, dist);
    audio.updateVoicePos(headPos());
    // heartbeat & music tension
    const tension = THREE.MathUtils.clamp(1 - (dist - 3) / 22, 0, 1);
    heartT -= dt; if (heartT <= 0 && S.mode !== 'over') { heartT = 1.05 - tension * 0.6; audio.heartbeat(tension); }
    audio.tick(tension);
    $('vignette').style.background = `radial-gradient(ellipse at center,rgba(0,0,0,0) ${58 - tension * 14}%,rgba(${Math.round(110 * tension)},0,20,${0.5 + tension * 0.2}) 100%)`;
    updateHUD(dist);
  }
  if (S.mode !== 'pause') {
    audio.setListener(camera.position, camera.getWorldDirection(tmp));
    // lights on her
    const hp = hachi.root.position, fy = hachi.root.rotation.y, s = hachi.bodyScale;
    hachi.bellyCenter(bc); const fr = hachi.radius + 1.6;
    herLight.position.set(bc.x + Math.sin(fy) * fr, hachi.headWorldY * 0.9, bc.z + Math.cos(fy) * fr); herLight.distance = 10 * s; herLight.intensity = 6 * s;
    herRim.position.set(hp.x - Math.sin(fy) * 1.5 * s + Math.cos(fy) * 1.5 * s, 2.8 * s, hp.z - Math.cos(fy) * 1.5 * s - Math.sin(fy) * 1.5 * s); herRim.distance = 8 * s;
    moon.position.set(camera.position.x - 30, 60, camera.position.z - 20); moon.target.position.set(camera.position.x, 0, camera.position.z);
  }
  if (annT > 0) { annT -= dt; if (annT <= 0) $('announce').classList.remove('show'); }
}
function updateHUD(dist) {
  document.body.classList.toggle('grabbing', S.mode === 'grab');
  $('time').textContent = fmt(S.time);
  $('hearts').textContent = '♥'.repeat(Math.max(0, S.hearts)) + '♡'.repeat(Math.max(0, 3 - S.hearts));
  $('lv').textContent = 'Lv.' + S.stage;
  $('irr').style.width = Math.min(100, S.irritation) + '%';
  $('stamina').style.width = S.stamina + '%'; $('stamina').style.opacity = S.exhausted ? 0.4 : 1;
  $('dist').textContent = dist < 60 ? `八尺様まで ${Math.max(0, dist - hachi.radius).toFixed(0)}m` : '';
}

function applySize() {
  renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth * pixelRatio / 2, innerHeight * pixelRatio / 2);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', applySize);

// boot
placeHachiTitle();
applySize();
renderer.compile(scene, camera);
$('loading').textContent = 'ボイス読み込み中…';
audio.prefetch().then(() => { $('loading').textContent = ''; });
$('start-btn').disabled = false;
frame();
window.__ready = true;
// expose helpers for automated tests
Object.assign(window.__game, { setStickUI, startGame, startGrab, slap, stageUp, smashBuilding, gameOver, toTitle, setExpr });
