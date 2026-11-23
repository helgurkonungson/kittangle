/**
 * Sound: generated audio files from public/audio (listed in manifest.json) with
 * procedural fallbacks, so the game always has sound even before files exist.
 */
let ctx: AudioContext | null = null;
let muted = false; // effective: player toggle or forced by the platform (ads, portal setting)
let userMuted = false;
let forcedMuted = false;
// browsers only allow audio after a user gesture
let unlocked = false;
const buffers = new Map<string, AudioBuffer>();
let musicSrc: AudioBufferSourceNode | null = null;
let musicWanted: string | null = null;
let musicOff = false; // separate music toggle (GDD 2.0 §12.2): SFX can stay on
const musicLoading = new Set<string>();
const BASE = `${import.meta.env.BASE_URL}audio/`;

if (typeof window !== 'undefined')
  window.addEventListener('pointerdown', () => {
    if (!unlocked) {
      unlocked = true;
      void loadAudio();
    }
    if (ctx?.state === 'suspended') void ctx.resume();
  });

function applyMute() {
  const m = userMuted || forcedMuted;
  if (m === muted) return;
  muted = m;
  if (m) {
    stopMusic();
    if (ctx?.state === 'running') void ctx.suspend();
  } else {
    if (ctx?.state === 'suspended') void ctx.resume();
    if (musicWanted) playMusic(musicWanted);
  }
}

/** Player's sound toggle. */
export const setMuted = (m: boolean) => {
  userMuted = m;
  applyMute();
};

/** Platform mute (during ads, or a portal "mute audio" setting); wins over the player's toggle. */
export const setForcedMute = (m: boolean) => {
  forcedMuted = m;
  applyMute();
};

function ac(): AudioContext | null {
  if (muted || !unlocked) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Loads every file named in audio/manifest.json (names without extension). */
async function loadAudio() {
  const c = ac();
  if (!c) return;
  try {
    const res = await fetch(BASE + 'manifest.json');
    if (!res.ok) return;
    const names: string[] = await res.json();
    // music is decoded only when wanted (a 2-minute stereo loop is ~40 MB of PCM)
    await Promise.all(
      names.filter((n) => !n.startsWith('music_')).map(async (n) => {
        try {
          const r = await fetch(`${BASE}${n}.mp3`);
          if (r.ok) buffers.set(n, await c.decodeAudioData(await r.arrayBuffer()));
        } catch {
          /* missing or broken file: procedural fallback */
        }
      }),
    );
    if (musicWanted) playMusic(musicWanted);
  } catch {
    /* no manifest yet */
  }
}

/** Plays a random variant `name_1..name_N` (or `name`) if loaded. */
function file(name: string, vol = 0.8, rate = 1): boolean {
  const c = ac();
  if (!c) return true; // muted or locked: play nothing, no fallback either
  const variants = [...buffers.keys()].filter((k) => k === name || k.startsWith(name + '_'));
  if (!variants.length) return false;
  const src = c.createBufferSource();
  src.buffer = buffers.get(variants[Math.floor(Math.random() * variants.length)])!;
  src.playbackRate.value = rate;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(g).connect(c.destination);
  src.start();
  return true;
}

function tone(f0: number, f1: number, dur: number, type: OscillatorType, vol = 0.15, delay = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Loops a music file if it exists; remembered so it starts once files load or sound is unmuted. */
export function playMusic(name: string) {
  musicWanted = name;
  const c = ac();
  if (!c || musicOff) return;
  const buf = buffers.get(name);
  if (!buf) {
    if (musicLoading.has(name)) return;
    musicLoading.add(name);
    void fetch(`${BASE}${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((b) => c.decodeAudioData(b))
      .then((d) => {
        for (const k of [...buffers.keys()]) if (k.startsWith('music_') && k !== musicWanted) buffers.delete(k);
        buffers.set(name, d);
        if (musicWanted === name) playMusic(name);
      })
      .catch(() => undefined)
      .finally(() => musicLoading.delete(name));
    return;
  }
  if (musicSrc?.buffer === buf) return;
  stopMusic();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.3, c.currentTime + 1.5);
  src.connect(g).connect(c.destination);
  src.start();
  musicSrc = src;
}

/** Player's music toggle, independent of the sound toggle. */
export function setMusicOff(off: boolean) {
  musicOff = off;
  if (off) stopMusic();
  else if (musicWanted) playMusic(musicWanted);
}

export function stopMusic() {
  try {
    musicSrc?.stop();
  } catch {
    /* already stopped */
  }
  musicSrc = null;
}


/**
 * Synthesized meows: a sawtooth "voice" gliding through a pitch curve, shaped by two moving formant filters
 * (the vowel sweep that makes it sound like "mi-aow") with a little vibrato. Each voice is a different call.
 * f = [time fraction, Hz], q1/q2 = formant sweeps in Hz over the call, trill = amplitude wobble in Hz.
 */
interface Voice { dur: number; f: [number, number][]; f1: number[]; f2: number[]; trill?: number; vol: number }
const VOICES: Voice[] = [
  { dur: 0.55, f: [[0, 430], [0.3, 700], [1, 480]], f1: [450, 900, 550], f2: [2300, 1500, 1100], vol: 1 }, // mi-aow
  { dur: 0.3, f: [[0, 620], [0.4, 900], [1, 700]], f1: [500, 800, 700], f2: [2400, 1900, 1700], vol: 0.95 }, // mew
  { dur: 0.5, f: [[0, 250], [0.45, 390], [1, 230]], f1: [500, 700, 500], f2: [1300, 1100, 900], trill: 26, vol: 1 }, // mrrow
  { dur: 0.22, f: [[0, 950], [0.5, 1450], [1, 1100]], f1: [700, 950, 800], f2: [2900, 2600, 2300], vol: 0.8 }, // kitten squeak
  { dur: 0.78, f: [[0, 360], [0.35, 640], [0.7, 480], [1, 340]], f1: [420, 850, 600, 450], f2: [2000, 1400, 1100, 1000], vol: 1 }, // long mrrr-aow
  { dur: 0.36, f: [[0, 520], [0.2, 760], [1, 440]], f1: [600, 750, 450], f2: [1800, 1500, 1000], trill: 18, vol: 0.9 }, // mrp
];
let lastVoice = -1;

function meowSynth(pitch: number, vol: number) {
  const c = ac();
  if (!c) return;
  let k = Math.floor(Math.random() * VOICES.length);
  if (k === lastVoice) k = (k + 1 + Math.floor(Math.random() * (VOICES.length - 1))) % VOICES.length;
  lastVoice = k;
  const v = VOICES[k];
  const t0 = c.currentTime;
  const t1 = t0 + v.dur;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  v.f.forEach(([p, hz], i) => osc.frequency[i ? 'linearRampToValueAtTime' : 'setValueAtTime'](hz * pitch, t0 + p * v.dur));
  const vib = c.createOscillator();
  const vibG = c.createGain();
  vib.frequency.value = 6;
  vibG.gain.value = 9 * pitch;
  vib.connect(vibG).connect(osc.frequency);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(vol * v.vol, t0 + 0.04);
  amp.gain.setValueAtTime(vol * v.vol, t0 + v.dur * 0.6);
  amp.gain.exponentialRampToValueAtTime(0.0001, t1);
  if (v.trill) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = v.trill;
    lg.gain.value = 0.35 * vol;
    lfo.connect(lg).connect(amp.gain);
    lfo.start(t0);
    lfo.stop(t1 + 0.05);
  }
  const out = c.createGain();
  out.gain.value = 2.4; // bandpassed sawtooth is quiet: measured peak 0.16 at 0.55
  [v.f1, v.f2].forEach((sweep, n) => {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = n ? 7 : 5;
    sweep.forEach((hz, i) => bp.frequency[i ? 'linearRampToValueAtTime' : 'setValueAtTime'](hz, t0 + (i / (sweep.length - 1)) * v.dur));
    const g = c.createGain();
    g.gain.value = n ? 0.7 : 1.4;
    osc.connect(amp);
    amp.connect(bp).connect(g).connect(out);
  });
  const lim = c.createDynamicsCompressor(); // keeps the loudest voices from clipping
  out.connect(lim).connect(c.destination);
  osc.start(t0);
  vib.start(t0);
  osc.stop(t1 + 0.05);
  vib.stop(t1 + 0.05);
}

const seq = (notes: number[], step: number, type: OscillatorType, vol: number) =>
  notes.forEach((f, i) => tone(f, f * 0.98, step * 1.6, type, vol, i * step));

export const sfx = {
  click: () => file('ui_click', 0.5) || tone(900, 700, 0.06, 'triangle', 0.08),
  /** generated meows (Stable Audio), synth voices as fallback */
  meow: (pitch = 1) => file('meow', 0.55, pitch) || meowSynth(pitch, 0.5),
  slide: () => file('slide', 0.35),
  pop: () => file('pop', 0.5),
  purr: () => file('purr', 0.7) || tone(70, 55, 0.35, 'sawtooth', 0.05),
  bonk: () => {
    if (!file('bonk', 0.7)) (tone(180, 60, 0.18, 'square', 0.12), tone(1200, 300, 0.2, 'sawtooth', 0.04, 0.05));
    file('huff', 0.45);
  },
  wake: () => file('wake', 0.6) || tone(300, 600, 0.2, 'sine', 0.1),
  coin: () => file('coin', 0.45) || tone(1300, 1800, 0.08, 'square', 0.05),
  combo: (n: number) => file('coin', 0.5, Math.min(1.6, 1 + n * 0.08)) || tone(900 + n * 80, 1400 + n * 80, 0.12, 'triangle', 0.08),
  star: () => file('star', 0.7) || tone(1000, 1600, 0.2, 'sine', 0.1),
  task: () => file('task', 0.7) || tone(600, 900, 0.15, 'triangle', 0.1),
  scene: () => file('scene', 0.5),
  chest: () => file('unlock', 0.8) || seq([660, 880, 1320], 0.08, 'triangle', 0.1),
  tips: () => file('coin', 0.6) || tone(1500, 2000, 0.1, 'square', 0.05),
  win: () => file('star', 0.75) || seq([523, 659, 784, 1046], 0.1, 'triangle', 0.12),
  chapter: () => file('chapter', 0.8) || seq([523, 659, 784, 1046, 1318], 0.1, 'triangle', 0.12),
  daily: () => file('daily', 0.8) || seq([523, 659, 784, 1046], 0.1, 'triangle', 0.12),
  hint: () => file('hint', 0.6) || tone(1200, 1800, 0.15, 'sine', 0.08),
  preview: () => file('preview', 0.4),
  kitten: () => file('kitten', 0.7) || tone(900, 1400, 0.15, 'sine', 0.08),
  box: () => file('box', 0.7) || tone(120, 70, 0.12, 'square', 0.1),
  node: () => file('node', 0.5) || tone(800, 1000, 0.06, 'triangle', 0.08),
  unlock: () => file('unlock', 0.7),
  scratchyWarn: () => file('scratchy_warn', 0.6),
  scratchySwipe: () => file('scratchy_swipe', 0.7) || tone(2400, 600, 0.15, 'sawtooth', 0.05),
  scratchySmug: () => file('scratchy_smug', 0.6),
};
