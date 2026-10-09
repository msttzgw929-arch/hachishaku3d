// Web Audio: pre-generated voice clips (positional), synthesized SFX, ambience, BGM, heartbeat.
export const LINES = {
  spot: ['spot1', 'spot2', 'spot3'],
  taunt: ['taunt1', 'taunt2', 'taunt3', 'taunt4', 'taunt5', 'taunt6'],
  catch: ['catch1', 'catch2', 'catch3'],
  slap: ['slap1', 'slap2', 'slap3', 'slap4', 'slap5', 'slap6'],
  escape: ['esc1', 'esc2', 'esc3'],
  irritate: ['irr1', 'irr2', 'irr3', 'irr4', 'irr5'],
  smash: ['smash1', 'smash2', 'smash3'],
  over: ['over1', 'over2'],
};
export const SUBS = {
  spot1: 'みーつけたっ♪', spot2: 'うふふっ、みぃつけた。', spot3: 'あらぁ？ そんなところにいたのね♪',
  taunt1: 'ぽ、ぽ、ぽ……。ぽぽぽぽ……♪', taunt2: '逃げても無駄よぉ〜？', taunt3: 'ねぇ、まってぇ〜？ お姉さんと、あそびましょ？', taunt4: 'うふふっ。どこへ行くのかしら？', taunt5: 'あははっ、鬼ごっこ、楽しいわねぇ！', taunt6: 'ほぉら、もうすぐそこよ？ うふふっ♪',
  catch1: 'つかまえたっ♡', catch2: 'うふふっ、もう、はなさないわよ？', catch3: 'はぁい、つかまえた。いい子ねぇ♡',
  slap1: 'ひゃあんっ！', slap2: 'お腹、たたかないでぇ！', slap3: 'やぁんっ！', slap4: 'ちょっと、お腹はだめぇっ！', slap5: 'いたぁい！', slap6: 'きゃあっ！ いたぁい！',
  esc1: 'もう〜っ！', esc2: 'あぁん……逃げられちゃった……。', esc3: 'もうっ！ ひどいじゃないっ！',
  irr1: 'イライラしてきた……！', irr2: 'もう許さないんだからっ！', irr3: 'ああもうっ！ イライラして、お腹がふくらんじゃうっ！', irr4: '見なさい、このお腹！ ぜんぶ、あなたのせいなんだからっ！', irr5: 'まだまだ大きくなるわよぉ……。覚悟しなさいっ！',
  smash1: '邪魔よっ！', smash2: 'あら、ごめんなさいね？ お腹がぶつかっちゃった♪', smash3: 'おほほほっ！ 建物なんて関係ないわ！',
  over1: 'うふふ……。これで、ずぅっと、お姉さんと一緒ね♡', over2: 'つーかまえたっ。もう、逃がさないんだから♡',
};
function fetchVoice(k) { return fetch(`assets/voice/${k}.mp3`).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null); }
const PRI = { taunt: 1, spot: 2, smash: 2, slap: 3, escape: 3, irritate: 4, catch: 4, over: 5 };

export class Audio {
  constructor() { this.ctx = null; this.buffers = {}; this.cur = null; this.last = {}; this.level = 0; this.onSub = null; this.speech = null; this.prefetched = {}; }
  prefetch() { for (const k of Object.keys(SUBS)) this.prefetched[k] = fetchVoice(k); return Promise.all(Object.values(this.prefetched)); }
  async init() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.32; this.music.connect(this.master);
    this.voiceBus = ctx.createGain(); this.voiceBus.gain.value = 1.25; this.voiceBus.connect(this.master);
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512; this.voiceBus.connect(this.analyser); this.abuf = new Float32Array(512);
    // reverb (short alley slapback)
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(1.6, 2.5); const vg = ctx.createGain(); vg.gain.value = 0.22; this.verb.connect(vg); vg.connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.voicesReady = this.loadVoices();
    this.startAmbience();
  }
  impulse(sec, decay) { const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; }
  makeNoise(sec) { const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }
  async loadVoices() {
    const keys = Object.keys(SUBS); let ok = 0;
    await Promise.all(keys.map(async k => {
      try { const ab = await (this.prefetched[k] || fetchVoice(k)); if (!ab) throw 0; this.buffers[k] = await this.ctx.decodeAudioData(ab.slice(0)); ok++; } catch (e) { }
    }));
    this.useSpeech = ok === 0 && 'speechSynthesis' in window;
    return ok;
  }
  // listener (camera) update
  setListener(pos, fwd) {
    if (!this.ctx) return; const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) { l.positionX.setTargetAtTime(pos.x, t, 0.02); l.positionY.setTargetAtTime(pos.y, t, 0.02); l.positionZ.setTargetAtTime(pos.z, t, 0.02); l.forwardX.setTargetAtTime(fwd.x, t, 0.02); l.forwardY.setTargetAtTime(fwd.y, t, 0.02); l.forwardZ.setTargetAtTime(fwd.z, t, 0.02); l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
    else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }
  panner(pos, ref = 4) {
    const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 0.9; p.maxDistance = 200;
    this.setPannerPos(p, pos); return p;
  }
  setPannerPos(p, pos) { if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z); }
  // speak a category line at a position; returns key or null
  say(cat, pos, force = false) {
    if (!this.ctx) return null;
    const pr = PRI[cat] || 1;
    if (this.cur && this.cur.playing && !force && this.cur.pri > pr) return null;
    const list = LINES[cat]; let k; let tries = 0;
    do { k = list[(Math.random() * list.length) | 0]; } while (list.length > 1 && k === this.last[cat] && tries++ < 8);
    this.last[cat] = k;
    this.stopVoice();
    if (this.useSpeech) return this.speak(k, pr);
    if (!this.buffers[k]) { this.onSub && this.onSub(SUBS[k], k); const cur = this.cur = { pri: pr, playing: true, key: k }; setTimeout(() => { cur.playing = false; this.onSub && this.onSub(null, k); }, 2000); return k; }
    const src = this.ctx.createBufferSource(); src.buffer = this.buffers[k];
    const g = this.ctx.createGain(); g.gain.value = 1;
    const pan = this.panner(pos, 6);
    src.connect(g); g.connect(pan); pan.connect(this.voiceBus); const send = this.ctx.createGain(); send.gain.value = 0.5; pan.connect(send); send.connect(this.verb);
    src.start();
    const cur = this.cur = { src, pan, pri: pr, playing: true, key: k };
    src.onended = () => { cur.playing = false; if (this.onSub) this.onSub(null, k); };
    this.onSub && this.onSub(SUBS[k], k);
    return k;
  }
  speak(k, pr) { // Web Speech fallback
    try {
      const u = new SpeechSynthesisUtterance(SUBS[k].replace(/[♪♡]/g, '')); u.lang = 'ja-JP'; u.pitch = 1.4; u.rate = 1.05;
      const v = speechSynthesis.getVoices().find(v => v.lang.startsWith('ja') && /female|Nanami|Kyoko|Haruka/i.test(v.name)) || speechSynthesis.getVoices().find(v => v.lang.startsWith('ja')); if (v) u.voice = v;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
      const cur = this.cur = { pri: pr, playing: true, key: k }; u.onend = () => { cur.playing = false; this.onSub && this.onSub(null, k); };
      this.onSub && this.onSub(SUBS[k], k); return k;
    } catch (e) { return null; }
  }
  stopVoice() { if (this.cur && this.cur.playing) { try { this.cur.src && this.cur.src.stop(); } catch (e) { } this.cur.playing = false; } }
  updateVoicePos(pos) { if (this.cur && this.cur.playing && this.cur.pan) this.setPannerPos(this.cur.pan, pos); }
  voiceLevel() {
    if (!this.ctx) return 0;
    if (this.useSpeech) return this.cur && this.cur.playing ? 0.4 + 0.4 * Math.abs(Math.sin(performance.now() / 70)) : 0;
    this.analyser.getFloatTimeDomainData(this.abuf); let s = 0; for (let i = 0; i < this.abuf.length; i++) s += this.abuf[i] * this.abuf[i];
    const rms = Math.sqrt(s / this.abuf.length); const v = Math.min(1, rms * 5);
    this.level += (v - this.level) * 0.5; return this.level;
  }
  // ---------- SFX
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  footstep(pos, size = 1) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const pan = this.panner(pos, 5 * size); pan.connect(this.sfx);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95 / Math.sqrt(size), t); o.frequency.exponentialRampToValueAtTime(32 / Math.sqrt(size), t + 0.25);
    const g = ctx.createGain(); this.env(g, t, 0.005, 0.9 * Math.min(2, size), 0.35 + 0.1 * size); o.connect(g); g.connect(pan); o.start(t); o.stop(t + 0.7);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g2 = ctx.createGain(); this.env(g2, t, 0.003, 0.35, 0.15); n.connect(f); f.connect(g2); g2.connect(pan); n.start(t, Math.random()); n.stop(t + 0.3);
  }
  playerStep(run) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 500; f.Q.value = 1.2;
    const g = ctx.createGain(); this.env(g, t, 0.002, run ? 0.16 : 0.09, 0.07); n.connect(f); f.connect(g); g.connect(this.sfx); n.start(t, Math.random()); n.stop(t + 0.15);
  }
  slap() {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
    const g = ctx.createGain(); this.env(g, t, 0.001, 1.2, 0.09); n.connect(f); f.connect(g); g.connect(this.sfx); g.connect(this.verb); n.start(t, Math.random()); n.stop(t + 0.2);
    // fleshy "boing" wobble
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 22; const lg = ctx.createGain(); lg.gain.value = 25; lfo.connect(lg); lg.connect(o.frequency);
    const g2 = ctx.createGain(); this.env(g2, t, 0.004, 0.6, 0.3); o.connect(g2); g2.connect(this.sfx); o.start(t); lfo.start(t); o.stop(t + 0.4); lfo.stop(t + 0.4);
  }
  crash(pos, big = 1) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const pan = this.panner(pos, 12); pan.connect(this.sfx); pan.connect(this.verb);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 2.2);
    const g = ctx.createGain(); this.env(g, t, 0.01, 1.4 * big, 2.4); n.connect(f); f.connect(g); g.connect(pan); n.start(t); n.stop(t + 2.6);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(25, t + 1.5); const g2 = ctx.createGain(); this.env(g2, t, 0.01, 1.2 * big, 1.6); o.connect(g2); g2.connect(pan); o.start(t); o.stop(t + 1.8);
    for (let i = 0; i < 6; i++) { // clatter
      const tt = t + 0.15 + Math.random() * 1.4; const c = ctx.createBufferSource(); c.buffer = this.noiseBuf; const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 600 + Math.random() * 2500; cf.Q.value = 3;
      const cg = ctx.createGain(); this.env(cg, tt, 0.002, 0.4, 0.12); c.connect(cf); cf.connect(cg); cg.connect(pan); c.start(tt, Math.random()); c.stop(tt + 0.2);
    }
  }
  thud(pos) { if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime; const pan = this.panner(pos, 6); pan.connect(this.sfx); const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; const g = ctx.createGain(); this.env(g, t, 0.003, 0.7, 0.25); n.connect(f); f.connect(g); g.connect(pan); n.start(t, Math.random()); n.stop(t + 0.4); }
  grow() {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(240, t + 0.9);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain(); this.env(g, t, 0.05, 0.5, 1.0); o.connect(g); g.connect(this.sfx); o.start(t); lfo.start(t); o.stop(t + 1.2); lfo.stop(t + 1.2);
    const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.setValueAtTime(55, t); const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.setValueAtTime(200, t); sf.frequency.exponentialRampToValueAtTime(1500, t + 0.8);
    const sg = ctx.createGain(); this.env(sg, t, 0.1, 0.25, 0.9); s.connect(sf); sf.connect(sg); sg.connect(this.sfx); s.start(t); s.stop(t + 1.2);
  }
  sting() { // capture stinger
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    [311, 330, 466, 622].forEach((fr, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = (Math.random() - 0.5) * 30; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; const g = ctx.createGain(); this.env(g, t, 0.01, 0.12, 1.4); o.connect(f); f.connect(g); g.connect(this.sfx); g.connect(this.verb); o.start(t); o.stop(t + 1.6); });
  }
  escape() { if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime; [523, 659, 784, 1046].forEach((fr, i) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; const g = ctx.createGain(); this.env(g, t + i * 0.06, 0.005, 0.08, 0.2); o.connect(g); g.connect(this.sfx); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.3); }); }
  heartbeat(intensity) { // call each beat
    if (!this.ctx || intensity <= 0.02) return; const ctx = this.ctx, t = ctx.currentTime;
    for (const [dt, a] of [[0, 1], [0.16, 0.7]]) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(62, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.12); const g = ctx.createGain(); this.env(g, t + dt, 0.008, 0.9 * intensity * a, 0.16); o.connect(g); g.connect(this.sfx); o.start(t + dt); o.stop(t + dt + 0.3); }
  }
  startAmbience() {
    const ctx = this.ctx;
    // wind / city hum
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; const g = ctx.createGain(); g.gain.value = 0.11;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    n.connect(f); f.connect(g); g.connect(this.master); n.start();
    const hum = ctx.createOscillator(); hum.frequency.value = 50; const hg = ctx.createGain(); hg.gain.value = 0.012; hum.connect(hg); hg.connect(this.master); hum.start();
    // eerie BGM: slow minor pad + music-box notes
    this.bgmT = ctx.currentTime + 0.5; this.bgmStep = 0; this.tension = 0;
  }
  tick(tension) { // schedule music ahead
    if (!this.ctx) return; const ctx = this.ctx; this.tension = tension;
    const chords = [[220, 261.6, 329.6], [207.6, 246.9, 311.1], [174.6, 220, 261.6], [164.8, 207.6, 246.9]];
    const box = [880, 1046.5, 987.8, 659.3, 783.9, 880, 698.5, 659.3];
    while (this.bgmT < ctx.currentTime + 0.6) {
      const t = this.bgmT, st = this.bgmStep; const beat = 0.5 - tension * 0.18;
      if (st % 8 === 0) { // pad chord
        const ch = chords[(st / 8 | 0) % 4];
        for (const fr of ch) for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr / 2; o.detune.value = det; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 500 + tension * 900; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 8 + 0.6); o.connect(fl); fl.connect(g); g.connect(this.music); g.connect(this.verb); o.start(t); o.stop(t + beat * 8 + 0.8); }
      }
      if (st % 2 === 0 && Math.random() < 0.75) { // music box
        const fr = box[(st / 2 | 0) % box.length] * (Math.random() < 0.1 ? 0.5 : 1); const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr; const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = fr * 3.01;
        const g = ctx.createGain(); this.env(g, t, 0.004, 0.07, 1.2); const g2 = ctx.createGain(); g2.gain.value = 0.25; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.music); g.connect(this.verb); o.start(t); o2.start(t); o.stop(t + 1.4); o2.stop(t + 1.4);
      }
      if (tension > 0.45 && st % 2 === 1) { // pulse when she's close
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 55; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 300; const g = ctx.createGain(); this.env(g, t, 0.005, 0.08 * tension, 0.15); o.connect(fl); fl.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.25);
      }
      this.bgmT += beat; this.bgmStep++;
    }
  }
}
