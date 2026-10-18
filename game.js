/* ==========================================================================
   NIGHTSHIFT · 霓虹极速
   A self-contained pseudo-3D arcade racer.
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------- Utilities ------------------------------- */

  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mod = (n, m) => ((n % m) + m) % m;
  const pad = (n, len = 2) => String(n).padStart(len, '0');

  function formatTime(value, short = false) {
    if (!Number.isFinite(value) || value < 0) value = 0;
    const totalMs = Math.floor(value * 1000);
    const ms = totalMs % 1000;
    const totalSec = Math.floor(totalMs / 1000);
    const sec = totalSec % 60;
    const min = Math.floor(totalSec / 60);
    if (short) return `${pad(min)}:${pad(sec)}.${pad(Math.floor(ms / 100))}`;
    return `${pad(min)}:${pad(sec)}.${pad(ms, 3)}`;
  }

  function formatGap(seconds) {
    if (!Number.isFinite(seconds)) return '';
    if (seconds < 0.05) return '--';
    return `+${seconds.toFixed(1)}`;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mixRgb(a, b, t) {
    return [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t)),
    ];
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundRect(g, x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  function makeCanvas(w, h, draw, scale = 2) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const g = canvas.getContext('2d');
    g.scale(scale, scale);
    draw(g);
    return canvas;
  }

  const storage = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    },
  };

  let savedBestLap = Number(storage.get('nightshift.bestLap', '0')) || 0;
  const savedMuted = storage.get('nightshift.muted', '0') === '1';

  /* --------------------------------- Setup --------------------------------- */

  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  let W = window.innerWidth;
  let H = window.innerHeight;
  let DPR = 1;

  const SEGMENT_LENGTH = 200;
  const TRACK_SEGMENTS = 1200;
  const TRACK_LENGTH = SEGMENT_LENGTH * TRACK_SEGMENTS;
  const ROAD_WIDTH = 2200;
  const CAMERA_HEIGHT = 1500;
  const DRAW_DISTANCE = 300;
  const FIELD_OF_VIEW = 100;
  const CAMERA_DEPTH = 1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180);
  const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH;
  const TOTAL_LAPS = 3;
  const RACER_COUNT = 6;
  const MAX_SPEED = 13200;
  const NITRO_SPEED = 16500;
  const MAX_KMH = 440;

  const PALETTE = {
    grassA: hexToRgb('#10051e'),
    grassB: hexToRgb('#180727'),
    roadA: hexToRgb('#151020'),
    roadB: hexToRgb('#1b1529'),
    rumbleA: hexToRgb('#ff2d95'),
    rumbleB: hexToRgb('#27e6ff'),
    lane: hexToRgb('#eee6ff'),
    fog: hexToRgb('#521452'),
  };

  const FOG_STEPS = 24;
  const fogPalette = [];
  for (let i = 0; i < FOG_STEPS; i++) {
    const t = Math.pow(i / (FOG_STEPS - 1), 1.85);
    const grassA = mixRgb(PALETTE.grassA, PALETTE.fog, t);
    const grassB = mixRgb(PALETTE.grassB, PALETTE.fog, t);
    const roadA = mixRgb(PALETTE.roadA, PALETTE.fog, t);
    const roadB = mixRgb(PALETTE.roadB, PALETTE.fog, t);
    const rumbleA = mixRgb(PALETTE.rumbleA, PALETTE.fog, t);
    const rumbleB = mixRgb(PALETTE.rumbleB, PALETTE.fog, t);
    const lane = mixRgb(PALETTE.lane, PALETTE.fog, t);
    fogPalette.push({
      grassA: `rgb(${grassA.join(',')})`,
      grassB: `rgb(${grassB.join(',')})`,
      roadA: `rgb(${roadA.join(',')})`,
      roadB: `rgb(${roadB.join(',')})`,
      rumbleA: `rgb(${rumbleA.join(',')})`,
      rumbleB: `rgb(${rumbleB.join(',')})`,
      lane: `rgba(${lane.join(',')},0.72)`,
    });
  }

  /* --------------------------------- Audio --------------------------------- */

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.engineGain = null;
      this.engineOsc = [];
      this.engineFilter = null;
      this.windGain = null;
      this.boostGain = null;
      this.musicGain = null;
      this.noiseBuffer = null;
      this.musicTimer = null;
      this.nextNoteTime = 0;
      this.step = 0;
      this.muted = savedMuted;
      this.started = false;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.72;
      this.master.connect(this.ctx.destination);

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.24;
      compressor.connect(this.master);
      this.bus = compressor;

      this.noiseBuffer = this.createNoise(2.5);
      this.createEngine();
      this.createWind();
      this.createBoost();
      this.createMusic();
    }

    createNoise(seconds) {
      const length = Math.floor(this.ctx.sampleRate * seconds);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    createEngine() {
      const c = this.ctx;
      this.engineFilter = c.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 520;
      this.engineFilter.Q.value = 4.5;

      this.engineGain = c.createGain();
      this.engineGain.gain.value = 0.0001;

      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.bus);

      const specs = [
        { type: 'sawtooth', freq: 53, detune: -7, gain: 0.16 },
        { type: 'square', freq: 79, detune: 5, gain: 0.07 },
        { type: 'sawtooth', freq: 106, detune: 11, gain: 0.045 },
      ];

      specs.forEach((spec) => {
        const osc = c.createOscillator();
        osc.type = spec.type;
        osc.frequency.value = spec.freq;
        osc.detune.value = spec.detune;
        const g = c.createGain();
        g.gain.value = spec.gain;
        osc.connect(g);
        g.connect(this.engineFilter);
        osc.start();
        this.engineOsc.push({ osc, base: spec.freq, spec });
      });
    }

    createWind() {
      const c = this.ctx;
      const source = c.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;

      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 820;
      filter.Q.value = 0.65;

      this.windGain = c.createGain();
      this.windGain.gain.value = 0.0001;

      source.connect(filter);
      filter.connect(this.windGain);
      this.windGain.connect(this.bus);
      source.start();
    }

    createBoost() {
      const c = this.ctx;
      const source = c.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      filter.Q.value = 0.9;
      this.boostGain = c.createGain();
      this.boostGain.gain.value = 0.0001;
      source.connect(filter);
      filter.connect(this.boostGain);
      this.boostGain.connect(this.bus);
      source.start();
    }

    createMusic() {
      const c = this.ctx;
      this.musicGain = c.createGain();
      this.musicGain.gain.value = 0.14;
      this.musicGain.connect(this.bus);
    }

    start() {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (!this.started) {
        this.started = true;
        this.nextNoteTime = this.ctx.currentTime + 0.08;
        this.musicTimer = setInterval(() => this.scheduleMusic(), 60);
      }
      this.musicGain.gain.setTargetAtTime(this.muted ? 0 : 0.14, this.ctx.currentTime, 0.2);
    }

    setMuted(muted) {
      this.muted = muted;
      storage.set('nightshift.muted', muted ? '1' : '0');
      if (this.ctx) {
        this.master.gain.setTargetAtTime(muted ? 0 : 0.72, this.ctx.currentTime, 0.08);
        if (!muted) this.nextNoteTime = this.ctx.currentTime + 0.06;
      }
    }

    scheduleMusic() {
      if (!this.ctx || !this.started) return;
      if (this.muted) {
        this.nextNoteTime = this.ctx.currentTime + 0.06;
        return;
      }
      const lookahead = this.ctx.currentTime + 0.18;
      while (this.nextNoteTime < lookahead) {
        this.playStep(this.step, this.nextNoteTime);
        this.step = (this.step + 1) % 64;
        this.nextNoteTime += 60 / 104 / 4;
      }
    }

    playStep(step, time) {
      const c = this.ctx;
      const bar = Math.floor(step / 16);
      const beat = step % 16;
      const roots = [55, 43.65, 65.41, 49.0]; // A1, F1, C2, G1
      const root = roots[bar % 4];
      const chords = [
        [220, 261.63, 329.63, 440],
        [174.61, 220, 261.63, 349.23],
        [261.63, 329.63, 392, 523.25],
        [196, 246.94, 293.66, 392],
      ];
      const chord = chords[bar % 4];

      if (beat % 4 === 0) {
        this.bassNote(root, time, 0.22);
        this.kick(time);
      }
      if (beat === 4 || beat === 12) this.snare(time);

      const pattern = [0, 2, 1, 3, 2, 1, 3, 0, 1, 3, 2, 0, 3, 1, 2, 1];
      const note = chord[pattern[beat % pattern.length]] * (beat > 11 ? 2 : 1);
      this.arpNote(note, time, 0.11, 0.018);
      if (beat === 8 || beat === 14) this.pad(chord, time);

      this.musicGain.gain.setTargetAtTime(this.muted ? 0 : 0.14, c.currentTime, 0.2);
    }

    bassNote(freq, time, dur) {
      const c = this.ctx;
      const osc = c.createOscillator();
      const g = c.createGain();
      const filter = c.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, time);
      filter.frequency.exponentialRampToValueAtTime(140, time + dur);
      filter.Q.value = 3;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.08, time + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(filter);
      filter.connect(g);
      g.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + dur + 0.03);
    }

    arpNote(freq, time, dur, volume) {
      const c = this.ctx;
      const osc = c.createOscillator();
      const g = c.createGain();
      const filter = c.createBiquadFilter();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      filter.type = 'lowpass';
      filter.frequency.value = 2300;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(volume, time + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(filter);
      filter.connect(g);
      g.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    }

    pad(chord, time) {
      const c = this.ctx;
      chord.slice(0, 3).forEach((freq, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.value = i === 0 ? -5 : i === 1 ? 5 : 0;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.016, time + 0.6);
        g.gain.linearRampToValueAtTime(0.0001, time + 3.1);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + 3.2);
      });
    }

    kick(time) {
      const c = this.ctx;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(125, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.18);
      g.gain.setValueAtTime(0.15, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.23);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.25);
    }

    snare(time) {
      const c = this.ctx;
      const source = c.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = c.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1100;
      const g = c.createGain();
      g.gain.setValueAtTime(0.035, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
      source.connect(filter);
      filter.connect(g);
      g.connect(this.musicGain);
      source.start(time);
      source.stop(time + 0.16);
    }

    tone(freq, duration = 0.12, type = 'sine', volume = 0.18, when = 0) {
      if (!this.ctx || this.muted) return;
      const c = this.ctx;
      const time = c.currentTime + when;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(volume, time + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      osc.connect(g);
      g.connect(this.bus);
      osc.start(time);
      osc.stop(time + duration + 0.03);
    }

    countdown(go = false) {
      if (!this.ctx) return;
      if (go) {
        this.tone(880, 0.38, 'square', 0.13);
        this.tone(1320, 0.5, 'sine', 0.1, 0.04);
      } else {
        this.tone(440, 0.11, 'square', 0.08);
        this.tone(660, 0.16, 'sine', 0.06, 0.02);
      }
    }

    lap() {
      if (!this.ctx) return;
      this.tone(660, 0.12, 'square', 0.08);
      this.tone(990, 0.18, 'square', 0.07, 0.11);
      this.tone(1320, 0.3, 'sine', 0.07, 0.22);
    }

    finish(win = false) {
      if (!this.ctx) return;
      const notes = win ? [523.25, 659.25, 783.99, 1046.5] : [392, 349.23, 293.66, 261.63];
      notes.forEach((f, i) => this.tone(f, 0.42, i === 3 ? 'sine' : 'square', 0.09, i * 0.17));
    }

    crash() {
      if (!this.ctx || this.muted) return;
      const c = this.ctx;
      const time = c.currentTime;
      const source = c.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, time);
      filter.frequency.exponentialRampToValueAtTime(180, time + 0.3);
      const g = c.createGain();
      g.gain.setValueAtTime(0.16, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
      source.connect(filter);
      filter.connect(g);
      g.connect(this.bus);
      source.start(time);
      source.stop(time + 0.36);
      this.tone(72, 0.28, 'sine', 0.16);
    }

    setEngine(ratio, throttle, boosting, active) {
      if (!this.ctx) return;
      const c = this.ctx;
      const t = c.currentTime;
      const target = active ? (this.muted ? 0 : (0.035 + ratio * 0.07) * (throttle ? 1 : 0.6)) : 0.0001;
      this.engineGain.gain.setTargetAtTime(target, t, 0.08);
      this.windGain.gain.setTargetAtTime(active ? ratio * ratio * 0.07 : 0.0001, t, 0.1);
      this.boostGain.gain.setTargetAtTime(active && boosting ? 0.07 : 0.0001, t, 0.06);
      this.engineFilter.frequency.setTargetAtTime(360 + ratio * 1900, t, 0.08);
      this.engineOsc.forEach((item) => {
        const f = item.base * (1 + ratio * 1.55);
        item.osc.frequency.setTargetAtTime(f, t, 0.06);
      });
    }

    pause() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0.0001, t, 0.06);
      this.windGain.gain.setTargetAtTime(0.0001, t, 0.06);
      this.boostGain.gain.setTargetAtTime(0.0001, t, 0.06);
    }

    resume() {
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    suspend() {
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    }
  }

  const audio = new AudioEngine();

  /* --------------------------------- Sprites -------------------------------- */

  const carCache = new Map();

  function makeCarSprite(primary, accent, dark, options = {}) {
    const key = `${primary}|${accent}|${dark}|${options.player ? 'p' : 'a'}`;
    if (carCache.has(key)) return carCache.get(key);
    const c = makeCanvas(480, 320, (g) => {
      g.clearRect(0, 0, 480, 320);

      // Ground shadow
      const shadow = g.createRadialGradient(240, 286, 12, 240, 286, 180);
      shadow.addColorStop(0, 'rgba(0,0,0,0.7)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = shadow;
      g.beginPath();
      g.ellipse(240, 286, 185, 25, 0, 0, Math.PI * 2);
      g.fill();

      // Rear tires
      function tire(x) {
        g.save();
        g.translate(x, 238);
        const tg = g.createLinearGradient(-30, -40, 30, 40);
        tg.addColorStop(0, '#0a0910');
        tg.addColorStop(0.48, '#16131d');
        tg.addColorStop(1, '#050409');
        g.fillStyle = tg;
        roundRect(g, -32, -38, 64, 82, 12);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.12)';
        g.lineWidth = 1.3;
        g.stroke();
        // Rim light
        g.strokeStyle = accent;
        g.globalAlpha = 0.45;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, 24, -0.4, Math.PI * 0.75);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
      }
      tire(72);
      tire(408);

      // Body
      const bodyGradient = g.createLinearGradient(240, 110, 240, 286);
      bodyGradient.addColorStop(0, primary);
      bodyGradient.addColorStop(0.38, primary);
      bodyGradient.addColorStop(0.72, dark);
      bodyGradient.addColorStop(1, '#08060f');

      g.beginPath();
      g.moveTo(46, 241);
      g.lineTo(57, 187);
      g.quadraticCurveTo(63, 157, 105, 148);
      g.lineTo(147, 108);
      g.quadraticCurveTo(170, 87, 240, 87);
      g.quadraticCurveTo(310, 87, 333, 108);
      g.lineTo(375, 148);
      g.quadraticCurveTo(417, 157, 423, 187);
      g.lineTo(434, 241);
      g.lineTo(422, 274);
      g.lineTo(58, 274);
      g.closePath();
      g.fillStyle = bodyGradient;
      g.fill();

      // Side body shading
      g.save();
      g.clip();
      const sideShade = g.createLinearGradient(40, 180, 440, 220);
      sideShade.addColorStop(0, 'rgba(255,255,255,0.16)');
      sideShade.addColorStop(0.18, 'rgba(255,255,255,0)');
      sideShade.addColorStop(0.82, 'rgba(0,0,0,0)');
      sideShade.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = sideShade;
      g.fillRect(30, 80, 430, 220);
      g.restore();

      // Rear window
      const windowGradient = g.createLinearGradient(240, 105, 240, 180);
      windowGradient.addColorStop(0, '#140d23');
      windowGradient.addColorStop(0.55, '#241b38');
      windowGradient.addColorStop(1, '#08060e');
      g.beginPath();
      g.moveTo(165, 109);
      g.quadraticCurveTo(240, 101, 315, 109);
      g.lineTo(349, 160);
      g.lineTo(131, 160);
      g.closePath();
      g.fillStyle = windowGradient;
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 1;
      g.stroke();
      g.beginPath();
      g.moveTo(174, 117);
      g.lineTo(219, 151);
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 8;
      g.stroke();

      // Roof highlight
      g.strokeStyle = 'rgba(255,255,255,0.32)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(178, 96);
      g.quadraticCurveTo(240, 82, 302, 96);
      g.stroke();

      // Rear spoiler
      g.fillStyle = '#08060d';
      roundRect(g, 108, 136, 264, 18, 8);
      g.fill();
      g.fillStyle = accent;
      g.globalAlpha = 0.8;
      roundRect(g, 120, 140, 240, 4, 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#08060d';
      g.fillRect(139, 151, 13, 36);
      g.fillRect(328, 151, 13, 36);

      // Tail light strip
      const lightGradient = g.createLinearGradient(90, 197, 390, 197);
      lightGradient.addColorStop(0, accent);
      lightGradient.addColorStop(0.22, '#ffffff');
      lightGradient.addColorStop(0.5, accent);
      lightGradient.addColorStop(0.78, '#ffffff');
      lightGradient.addColorStop(1, accent);
      g.save();
      g.shadowColor = accent;
      g.shadowBlur = 24;
      g.fillStyle = lightGradient;
      roundRect(g, 86, 190, 308, 13, 6);
      g.fill();
      g.restore();

      // Tail light pods
      g.fillStyle = 'rgba(5,3,10,0.9)';
      roundRect(g, 78, 181, 76, 32, 7);
      g.fill();
      roundRect(g, 326, 181, 76, 32, 7);
      g.fill();
      g.fillStyle = accent;
      g.save();
      g.shadowColor = accent;
      g.shadowBlur = 15;
      roundRect(g, 88, 188, 56, 7, 3);
      g.fill();
      roundRect(g, 336, 188, 56, 7, 3);
      g.fill();
      g.restore();

      // Bumper / diffuser
      g.fillStyle = '#0a0811';
      g.beginPath();
      g.moveTo(62, 254);
      g.lineTo(418, 254);
      g.lineTo(427, 278);
      g.lineTo(53, 278);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.09)';
      g.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const x = 102 + i * 46;
        g.beginPath();
        g.moveTo(x, 260);
        g.lineTo(x + 9, 273);
        g.stroke();
      }

      // Exhausts
      g.fillStyle = '#050409';
      g.beginPath();
      g.ellipse(167, 265, 16, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(313, 265, 16, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = accent;
      g.globalAlpha = 0.18;
      g.beginPath();
      g.ellipse(167, 265, 9, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(313, 265, 9, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;

      // Plate
      g.fillStyle = '#0e0b18';
      roundRect(g, 212, 227, 56, 20, 3);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.font = '700 9px "Bahnschrift", Arial, sans-serif';
      g.textAlign = 'center';
      g.fillText('NIGHTSHIFT', 240, 240);

      // Fine highlights
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(66, 214);
      g.quadraticCurveTo(85, 174, 118, 164);
      g.stroke();
      g.beginPath();
      g.moveTo(414, 214);
      g.quadraticCurveTo(395, 174, 362, 164);
      g.stroke();

      if (options.player) {
        // Cyan racing stripe on the roof
        g.strokeStyle = accent;
        g.globalAlpha = 0.75;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(240, 94);
        g.lineTo(240, 158);
        g.stroke();
        g.globalAlpha = 1;
      }
    });
    carCache.set(key, c);
    return c;
  }

  function makePalmSprite(accent = '#ff4fd8') {
    return makeCanvas(320, 590, (g) => {
      g.translate(160, 570);
      const rand = mulberry32(accent === '#35e7ff' ? 5512 : 9917);

      // Ground shadow
      const shadow = g.createRadialGradient(0, 0, 2, 0, 0, 76);
      shadow.addColorStop(0, 'rgba(0,0,0,0.55)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = shadow;
      g.beginPath();
      g.ellipse(0, -3, 76, 13, 0, 0, Math.PI * 2);
      g.fill();

      // Trunk
      const trunk = g.createLinearGradient(-20, -10, 24, -390);
      trunk.addColorStop(0, '#07030d');
      trunk.addColorStop(0.55, '#170b23');
      trunk.addColorStop(1, '#251130');
      g.strokeStyle = trunk;
      g.lineWidth = 29;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(-24, -115, 28, -235, 4, -392);
      g.stroke();

      // Trunk rim + rings
      g.strokeStyle = accent;
      g.globalAlpha = 0.34;
      g.lineWidth = 1.7;
      g.beginPath();
      g.moveTo(-12, -4);
      g.bezierCurveTo(-35, -116, 17, -236, -7, -390);
      g.stroke();
      g.globalAlpha = 0.19;
      for (let i = 0; i < 15; i++) {
        const t = i / 15;
        const x = lerp(0, 4, t) + Math.sin(t * Math.PI) * -8;
        const y = -t * 390 + 4;
        const w = 12 - t * 3;
        g.beginPath();
        g.moveTo(x - w, y);
        g.quadraticCurveTo(x, y + 4, x + w, y - 1);
        g.stroke();
      }
      g.globalAlpha = 1;

      const crownX = 4;
      const crownY = -405;

      // Back layer of leaves
      g.save();
      g.translate(crownX, crownY);
      for (let i = 0; i < 7; i++) {
        const a = -2.95 + (i / 6) * 2.8 + (rand() - 0.5) * 0.1;
        const len = 125 + rand() * 58;
        const ex = Math.cos(a) * len;
        const ey = Math.sin(a) * len * 0.5 + 32;
        const cx = ex * 0.5;
        const cy = ey * 0.55 - 31;
        const thickness = 9 + rand() * 6;
        const nx = -Math.sin(a) * thickness;
        const ny = Math.cos(a) * thickness;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(cx + nx, cy + ny, ex, ey);
        g.quadraticCurveTo(cx - nx * 0.5, cy - ny * 0.5, 0, 0);
        g.fillStyle = '#0b0514';
        g.fill();
        g.strokeStyle = accent;
        g.globalAlpha = 0.22;
        g.lineWidth = 1.2;
        g.stroke();
        g.globalAlpha = 1;
      }
      g.restore();

      // Front fronds
      const fronds = 9;
      for (let i = 0; i < fronds; i++) {
        const a = -2.95 + (i / (fronds - 1)) * 3.0 + (rand() - 0.5) * 0.09;
        const len = 148 + rand() * 56;
        const ex = Math.cos(a) * len;
        const ey = Math.sin(a) * len * 0.42 + 33 + rand() * 18;
        const cx = ex * 0.48;
        const cy = ey * 0.48 - 37 - rand() * 10;
        const thickness = 12 + rand() * 6;
        const nx = -Math.sin(a) * thickness;
        const ny = Math.cos(a) * thickness;

        g.save();
        g.translate(crownX, crownY);
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(cx + nx, cy + ny, ex, ey);
        g.quadraticCurveTo(cx - nx * 0.55, cy - ny * 0.55, 0, 0);
        g.fillStyle = '#0c0617';
        g.fill();
        g.strokeStyle = accent;
        g.globalAlpha = 0.68;
        g.lineWidth = 1.35;
        g.stroke();
        g.globalAlpha = 0.16;
        g.lineWidth = 4.5;
        g.stroke();
        g.globalAlpha = 1;

        // Bright midrib
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(cx, cy, ex, ey);
        g.strokeStyle = accent;
        g.globalAlpha = 0.39;
        g.lineWidth = 1;
        g.stroke();
        g.globalAlpha = 1;

        // A few fine leaflets catch the light
        for (let j = 1; j <= 4; j++) {
          const t = j / 5;
          const px = lerp(0, cx, t * 2) * (1 - t) + ex * t;
          const py = lerp(0, cy, t * 2) * (1 - t) + ey * t;
          const leaf = 7 + (1 - t) * 7;
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px - Math.sin(a + 1.35) * leaf, py + Math.cos(a + 1.35) * leaf * 0.55);
          g.strokeStyle = accent;
          g.globalAlpha = 0.18;
          g.lineWidth = 1;
          g.stroke();
        }
        g.globalAlpha = 1;
        g.restore();
      }

      // Crown / hanging seed pods
      g.fillStyle = '#090410';
      g.beginPath();
      g.arc(crownX, crownY, 14, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = accent;
      g.globalAlpha = 0.5;
      g.lineWidth = 2;
      g.stroke();
      g.globalAlpha = 1;
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i % 2 ? accent : '#1a0a23';
        g.globalAlpha = 0.5;
        g.beginPath();
        g.arc(crownX + 8 + i * 5, crownY + 20 + i * 7, 3.2, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    });
  }

  function makeLampSprite(accent = '#27e6ff') {
    return makeCanvas(300, 600, (g) => {
      g.translate(70, 575);
      // pole
      g.fillStyle = '#0a0612';
      g.fillRect(-9, -470, 18, 474);
      g.strokeStyle = accent;
      g.globalAlpha = 0.5;
      g.lineWidth = 1.5;
      g.strokeRect(-9, -470, 18, 474);
      g.globalAlpha = 1;
      // arm
      g.strokeStyle = '#0a0612';
      g.lineWidth = 15;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, -468);
      g.quadraticCurveTo(0, -520, 116, -520);
      g.stroke();
      g.strokeStyle = accent;
      g.globalAlpha = 0.45;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -470);
      g.quadraticCurveTo(0, -526, 116, -526);
      g.stroke();
      g.globalAlpha = 1;
      // lamp
      g.save();
      g.shadowColor = accent;
      g.shadowBlur = 34;
      g.fillStyle = accent;
      roundRect(g, 100, -524, 54, 11, 5);
      g.fill();
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      roundRect(g, 111, -522, 32, 4, 2);
      g.fill();
      // pole stripes
      g.fillStyle = accent;
      g.globalAlpha = 0.35;
      g.fillRect(-9, -280, 18, 3);
      g.fillRect(-9, -160, 18, 3);
      g.globalAlpha = 1;
    });
  }

  function makeBillboardSprite(variant, accent) {
    const signs = [
      ['NIGHT', 'CITY'],
      ['極 速', '2088'],
      ['NEON', 'DRIVE'],
      ['DSK', 'ARCADE'],
    ];
    const [top, bottom] = signs[variant % signs.length];
    return makeCanvas(720, 500, (g) => {
      // supports
      g.fillStyle = '#08040f';
      g.fillRect(235, 320, 22, 160);
      g.fillRect(463, 320, 22, 160);
      g.strokeStyle = accent;
      g.globalAlpha = 0.2;
      g.lineWidth = 2;
      g.strokeRect(235, 320, 22, 160);
      g.strokeRect(463, 320, 22, 160);
      g.globalAlpha = 1;

      // board
      g.save();
      g.shadowColor = accent;
      g.shadowBlur = 28;
      g.fillStyle = '#0d0619';
      roundRect(g, 43, 25, 634, 305, 5);
      g.fill();
      g.strokeStyle = accent;
      g.globalAlpha = 0.9;
      g.lineWidth = 4;
      g.stroke();
      g.globalAlpha = 1;
      g.restore();

      // interior grid
      g.save();
      roundRect(g, 54, 36, 612, 283, 2);
      g.clip();
      const bg = g.createLinearGradient(0, 36, 0, 319);
      bg.addColorStop(0, 'rgba(40,8,56,0.7)');
      bg.addColorStop(1, 'rgba(8,2,18,0.95)');
      g.fillStyle = bg;
      g.fillRect(54, 36, 612, 283);
      g.strokeStyle = 'rgba(255,255,255,0.055)';
      g.lineWidth = 1;
      for (let x = 54; x <= 666; x += 34) {
        g.beginPath(); g.moveTo(x, 36); g.lineTo(x, 319); g.stroke();
      }
      for (let y = 36; y <= 319; y += 34) {
        g.beginPath(); g.moveTo(54, y); g.lineTo(666, y); g.stroke();
      }
      g.restore();

      // accents
      g.fillStyle = accent;
      g.globalAlpha = 0.8;
      g.fillRect(72, 58, 70, 5);
      g.fillRect(72, 292, 576, 2);
      g.globalAlpha = 1;

      // type
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.save();
      g.shadowColor = accent;
      g.shadowBlur = 22;
      g.font = '900 104px "Arial Black", "Microsoft YaHei", sans-serif';
      g.fillText(top, 360, 174);
      g.font = '900 56px "Bahnschrift", "Arial Black", sans-serif';
      g.fillStyle = accent;
      g.letterSpacing = '8px';
      g.fillText(bottom, 360, 252);
      g.restore();
    });
  }

  function makeGateSprite(accent) {
    return makeCanvas(1200, 640, (g) => {
      g.save();
      g.shadowColor = accent;
      g.shadowBlur = 26;
      g.strokeStyle = accent;
      g.globalAlpha = 0.88;
      g.lineWidth = 10;
      // posts
      g.beginPath(); g.moveTo(92, 630); g.lineTo(92, 188); g.stroke();
      g.beginPath(); g.moveTo(1108, 630); g.lineTo(1108, 188); g.stroke();
      // beam
      g.strokeStyle = '#ff4fa8';
      g.lineWidth = 16;
      g.beginPath(); g.moveTo(72, 190); g.lineTo(1128, 190); g.stroke();
      g.strokeStyle = accent;
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(72, 174); g.lineTo(1128, 174); g.stroke();
      g.restore();

      // Dark beam backing
      g.fillStyle = 'rgba(7,2,17,0.92)';
      roundRect(g, 205, 76, 790, 122, 6);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 2;
      g.stroke();

      g.textAlign = 'center';
      g.font = '900 65px "Bahnschrift", "Arial Black", sans-serif';
      g.fillStyle = '#fff';
      g.save();
      g.shadowColor = accent;
      g.shadowBlur = 20;
      g.fillText('N I G H T S H I F T', 600, 141);
      g.restore();
      g.font = '700 21px "Bahnschrift", sans-serif';
      g.fillStyle = accent;
      g.fillText('SECTOR 09  ·  MIDNIGHT LOOP', 600, 175);

      // small side sequence lights
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i % 2 ? accent : '#ff4fa8';
        g.globalAlpha = 0.8;
        g.beginPath();
        g.arc(92, 222 + i * 42, 5, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(1108, 222 + i * 42, 5, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    });
  }

  const sprites = {
    palmPink: makePalmSprite('#ff4fd8'),
    palmCyan: makePalmSprite('#35e7ff'),
    lampPink: makeLampSprite('#ff55bd'),
    lampCyan: makeLampSprite('#3de4ff'),
    billboards: [
      makeBillboardSprite(0, '#ff2d95'),
      makeBillboardSprite(1, '#27e6ff'),
      makeBillboardSprite(2, '#a97bff'),
      makeBillboardSprite(3, '#ffd166'),
    ],
    gates: [
      makeGateSprite('#27e6ff'),
      makeGateSprite('#ff2d95'),
    ],
  };

  const cars = {
    player: makeCarSprite('#d9d3ec', '#27e6ff', '#5a3f86', { player: true }),
  };

  /* -------------------------------- Backdrop -------------------------------- */

  let backdrop = null;
  const stars = [];
  for (let i = 0; i < 170; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 1.7 + 0.3,
      alpha: Math.random() * 0.65 + 0.16,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.7 + 0.2,
    });
  }

  function makeSunSprite() {
    return makeCanvas(760, 760, (g) => {
      const cx = 380;
      const cy = 380;
      const r = 235;
      // Halo
      const halo = g.createRadialGradient(cx, cy, r * 0.25, cx, cy, 375);
      halo.addColorStop(0, 'rgba(255, 92, 162, 0.42)');
      halo.addColorStop(0.45, 'rgba(255, 45, 149, 0.14)');
      halo.addColorStop(1, 'rgba(255, 45, 149, 0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, 760, 760);

      g.save();
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.clip();
      const sun = g.createLinearGradient(0, cy - r, 0, cy + r);
      sun.addColorStop(0, '#fff6c4');
      sun.addColorStop(0.3, '#ffd277');
      sun.addColorStop(0.57, '#ff8b7c');
      sun.addColorStop(0.78, '#ff3d91');
      sun.addColorStop(1, '#a41771');
      g.fillStyle = sun;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);

      // Retro cutout bands
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 9; i++) {
        const y = cy + r * 0.18 + i * (r * 0.085);
        const thickness = 2 + i * 1.65;
        g.fillRect(cx - r, y, r * 2, thickness);
      }
      g.restore();

      // Rim
      g.strokeStyle = 'rgba(255,255,255,0.34)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, r - 1, 0, Math.PI * 2);
      g.stroke();
    }, 2);
  }

  function makeMountainLayer(seed, colorTop, colorBottom, rimColor, heightFactor, detail) {
    const width = Math.ceil(W * 2);
    const height = Math.ceil(H * heightFactor);
    const rand = mulberry32(seed);
    const points = [];
    const count = 30 + detail * 10;
    for (let i = 0; i <= count; i++) {
      const x = (i / count) * width;
      const ridge = 0.25 + rand() * 0.75;
      const peak = Math.pow(ridge, 1.5) * height * 0.72;
      points.push({ x, y: height - peak - height * 0.04 });
    }

    const c = makeCanvas(width, height, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, colorTop);
      grad.addColorStop(1, colorBottom);
      g.beginPath();
      g.moveTo(0, height);
      points.forEach((pt) => g.lineTo(pt.x, pt.y));
      g.lineTo(width, height);
      g.closePath();
      g.fillStyle = grad;
      g.fill();

      g.beginPath();
      points.forEach((pt, i) => {
        if (i === 0) g.moveTo(pt.x, pt.y);
        else g.lineTo(pt.x, pt.y);
      });
      g.strokeStyle = rimColor;
      g.globalAlpha = 0.5;
      g.lineWidth = 1.6;
      g.stroke();
      g.globalAlpha = 1;

      // subtle texture lines
      g.globalAlpha = 0.05;
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      for (let i = 0; i < 20; i++) {
        const x = rand() * width;
        const y = height - rand() * height * 0.5;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 50 + rand() * 100, y - 2);
        g.stroke();
      }
    }, 1.4);

    return { canvas: c, width, height };
  }

  function makeCityLayer() {
    const width = Math.ceil(W * 2);
    const height = Math.ceil(H * 0.115);
    const rand = mulberry32(77821);
    const cityCanvas = makeCanvas(width, height, (g) => {
      g.clearRect(0, 0, width, height);
      let x = 0;
      while (x < width) {
        const bw = 10 + rand() * 28;
        const bh = height * (0.16 + rand() * 0.72);
        const by = height - bh;
        g.fillStyle = rand() > 0.6 ? '#1b0a2b' : '#10051d';
        g.fillRect(x, by, bw, bh);
        if (rand() > 0.75) {
          g.fillStyle = '#130620';
          g.fillRect(x + bw * 0.35, by - height * 0.11, bw * 0.3, height * 0.12);
          g.fillStyle = '#ff2d95';
          g.globalAlpha = 0.55;
          g.fillRect(x + bw * 0.48, by - height * 0.15, 2, 2);
          g.globalAlpha = 1;
        }
        const windowChance = rand();
        if (windowChance > 0.2) {
          const cols = Math.max(1, Math.floor(bw / 7));
          const rows = Math.max(1, Math.floor(bh / 10));
          for (let cx = 0; cx < cols; cx++) {
            for (let cy = 0; cy < rows; cy++) {
              if (rand() > 0.76) {
                g.fillStyle = rand() > 0.55 ? 'rgba(39,230,255,0.5)' : 'rgba(255,144,201,0.46)';
                g.fillRect(x + 3 + cx * 7, by + 4 + cy * 10, 2, 2);
              }
            }
          }
        }
        x += bw + 2 + rand() * 5;
      }
      const glow = g.createLinearGradient(0, height * 0.6, 0, height);
      glow.addColorStop(0, 'rgba(255,45,149,0)');
      glow.addColorStop(1, 'rgba(255,45,149,0.12)');
      g.fillStyle = glow;
      g.fillRect(0, 0, width, height);
    }, 1);
    return { canvas: cityCanvas, width, height };
  }

  function buildBackdrop() {
    backdrop = {
      sun: makeSunSprite(),
      far: makeMountainLayer(19371, '#2a0b42', '#130520', '#c6368f', 0.185, 2),
      near: makeMountainLayer(88201, '#1b072d', '#090311', '#ff2d95', 0.125, 3),
      city: makeCityLayer(),
    };
  }

  function drawTiled(layer, offsetX, y) {
    const w = layer.width;
    let x = mod(offsetX, w);
    if (x > 0) x -= w;
    while (x < W) {
      ctx.drawImage(layer.canvas, x, y, w, layer.height);
      x += w;
    }
  }

  function drawSky(time) {
    const horizon = H * 0.505;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + 4);
    sky.addColorStop(0, '#030107');
    sky.addColorStop(0.28, '#0d0320');
    sky.addColorStop(0.51, '#2a0741');
    sky.addColorStop(0.7, '#641050');
    sky.addColorStop(0.86, '#b42266');
    sky.addColorStop(0.96, '#ff5d7b');
    sky.addColorStop(1, '#ffb27d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon + 4);

    // Stars
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, horizon * 0.8);
    ctx.clip();
    for (const star of stars) {
      const twinkle = 0.62 + Math.sin(time * star.speed + star.phase) * 0.38;
      ctx.globalAlpha = star.alpha * twinkle;
      ctx.fillStyle = star.size > 1.2 ? '#ffd9f2' : '#ffffff';
      ctx.fillRect(star.x * W, star.y * horizon * 0.8, star.size, star.size);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Sun
    const sunRadius = Math.min(W, H) * 0.235;
    const sunX = W * 0.5 - player.x * W * 0.028 + currentCurve * 3;
    const sunY = horizon - H * 0.023;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.94;
    ctx.drawImage(backdrop.sun, sunX - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius * 2);
    ctx.restore();

    // Horizon haze
    const haze = ctx.createLinearGradient(0, horizon - H * 0.16, 0, horizon + H * 0.1);
    haze.addColorStop(0, 'rgba(255,45,149,0)');
    haze.addColorStop(0.62, 'rgba(255,75,150,0.22)');
    haze.addColorStop(1, 'rgba(74,8,63,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - H * 0.16, W, H * 0.27);

    // Mountain + city parallax
    const farX = -W * 0.3 - player.x * W * 0.026;
    drawTiled(backdrop.far, farX, horizon - backdrop.far.height + 2);
    drawTiled(backdrop.city, -W * 0.25 - player.x * W * 0.04, horizon - backdrop.city.height + 7);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.36;
    const cityGlow = ctx.createLinearGradient(0, horizon - 60, 0, horizon + 30);
    cityGlow.addColorStop(0, 'rgba(255,45,149,0)');
    cityGlow.addColorStop(0.72, 'rgba(255,75,163,0.22)');
    cityGlow.addColorStop(1, 'rgba(39,230,255,0)');
    ctx.fillStyle = cityGlow;
    ctx.fillRect(0, horizon - 60, W, 90);
    ctx.restore();

    drawTiled(backdrop.near, -W * 0.55 - player.x * W * 0.075, horizon - backdrop.near.height + 15);

    // Ground behind road
    const ground = ctx.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, '#3a0c45');
    ground.addColorStop(0.22, '#1c062c');
    ground.addColorStop(1, '#08020f');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, W, H - horizon);

    // Neon horizon line
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const line = ctx.createLinearGradient(0, 0, W, 0);
    line.addColorStop(0, 'rgba(255,45,149,0)');
    line.addColorStop(0.2, 'rgba(255,45,149,0.3)');
    line.addColorStop(0.5, 'rgba(255,220,240,0.55)');
    line.addColorStop(0.8, 'rgba(39,230,255,0.25)');
    line.addColorStop(1, 'rgba(39,230,255,0)');
    ctx.fillStyle = line;
    ctx.fillRect(0, horizon - 1.5, W, 2.5);
    ctx.restore();
  }

  /* --------------------------------- Track ---------------------------------- */

  const track = [];

  function buildTrack() {
    track.length = 0;
    const N = TRACK_SEGMENTS;

    const yAt = (i) => {
      const t = (i / N) * Math.PI * 2;
      return 1250 * Math.sin(t * 2 + 0.6) + 520 * Math.sin(t * 5 + 2.1) + 180 * Math.sin(t * 9 + 0.4);
    };

    const curveAt = (i) => {
      const t = (i / N) * Math.PI * 2;
      return (
        1.55 * Math.sin(t * 3 + 0.8) +
        0.82 * Math.sin(t * 7 + 2.4) +
        0.2 * Math.sin(t * 13 + 1.1)
      );
    };

    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const y1 = yAt(i);
      const y2 = yAt(next);
      track.push({
        index: i,
        curve: curveAt(i),
        y1,
        y2,
        p1: {
          world: { x: 0, y: y1, z: i * SEGMENT_LENGTH },
          camera: { x: 0, y: 0, z: 0 },
          screen: { x: 0, y: 0, w: 0, scale: 0 },
        },
        p2: {
          world: { x: 0, y: y2, z: (i + 1) * SEGMENT_LENGTH },
          camera: { x: 0, y: 0, z: 0 },
          screen: { x: 0, y: 0, w: 0, scale: 0 },
        },
        clip: H,
        decorations: [],
        finish: i < 3,
      });
    }

    // Roadside furniture
    for (let i = 4; i < N; i += 1) {
      if (i % 26 === 0) {
        const side = (Math.floor(i / 26) % 2 === 0) ? -1 : 1;
        const cyan = i % 52 === 0;
        track[i].decorations.push({
          kind: 'palm',
          offset: side * 1.43,
          width: 980,
          image: cyan ? sprites.palmCyan : sprites.palmPink,
        });
      }
      if (i % 26 === 13) {
        const side = (Math.floor(i / 26) % 2 === 0) ? 1 : -1;
        track[i].decorations.push({
          kind: 'lamp',
          offset: side * 1.09,
          width: 560,
          image: (i % 52 === 13) ? sprites.lampPink : sprites.lampCyan,
        });
      }
      if (i % 176 === 44) {
        const side = (Math.floor(i / 176) % 2 === 0) ? -1 : 1;
        const variant = Math.floor(i / 176) % sprites.billboards.length;
        track[i].decorations.push({
          kind: 'billboard',
          offset: side * 1.62,
          width: 2650,
          image: sprites.billboards[variant],
        });
      }
      if (i % 300 === 150) {
        track[i].decorations.push({
          kind: 'gate',
          offset: 0,
          width: 6300,
          image: sprites.gates[(Math.floor(i / 300) % 2)],
          gate: true,
        });
      }
    }
  }

  /* ------------------------------- Game state ------------------------------- */

  const AI_DEFS = [
    { name: 'NOVA', color: '#ff3d9e', accent: '#ff9fd5', dark: '#6c1245', start: 520, base: 12350, lane: -0.58 },
    { name: 'KAI', color: '#35d9ff', accent: '#b8f7ff', dark: '#145c7a', start: 760, base: 12250, lane: 0.22 },
    { name: 'RUSH', color: '#ffb23e', accent: '#ffe3a8', dark: '#8a4a0e', start: 1120, base: 12600, lane: 0.62 },
    { name: 'VEGA', color: '#9f6bff', accent: '#ddc8ff', dark: '#42217d', start: 260, base: 12100, lane: -0.18 },
    { name: 'ECHO', color: '#52ffb8', accent: '#d0ffe9', dark: '#126b4b', start: 940, base: 12450, lane: 0.36 },
  ];

  AI_DEFS.forEach((def) => {
    const sprite = makeCarSprite(def.color, def.accent, def.dark, {});
    cars[def.name] = sprite;
  });

  const player = {
    name: 'YOU',
    isPlayer: true,
    progress: 0,
    speed: 0,
    x: 0,
    lane: 0,
    finished: false,
    finishTime: 0,
    lap: 1,
    lapStart: 0,
    bestLap: 0,
    lastLap: 0,
    topSpeed: 0,
    nitro: 100,
    boosting: false,
    offroad: false,
    steer: 0,
    steerInput: 0,
    bump: 0,
  };

  let opponents = [];

  const race = {
    mode: 'menu',
    time: 0,
    countdown: 0,
    cdStage: -1,
    goTimer: 0,
    lap: 1,
    lapStart: 0,
    lastLap: 0,
    bestLap: 0,
    position: 6,
    shake: 0,
    shakeX: 0,
    shakeY: 0,
    flash: 0,
    menuTime: 0,
    menuSpeed: 3600,
    collisionCooldown: 0,
    finishShown: false,
    result: null,
    toastTimer: null,
    lastHudUpdate: 0,
    lastLbUpdate: 0,
    hudAccumulator: 0,
  };

  let currentCurve = 0;
  let playerSegment = track[0];
  const particles = [];
  const speedStreaks = [];
  const sceneItems = [];
  let baseSegmentIndex = 0;
  let basePercent = 0;

  const input = {
    left: false,
    right: false,
    throttle: false,
    brake: false,
    nitro: false,
  };

  /* ---------------------------------- UI ----------------------------------- */

  const ui = {
    hud: $('hud'),
    menu: $('menu'),
    pause: $('pauseScreen'),
    results: $('results'),
    countdown: $('countdown'),
    countdownNum: $('countdownNum'),
    countdownSub: $('countdownSub'),
    toast: $('raceToast'),
    lapValue: $('lapValue'),
    posValue: $('posValue'),
    raceTime: $('raceTime'),
    lapTime: $('lapTime'),
    speedValue: $('speedValue'),
    gearValue: $('gearValue'),
    dialArc: $('dialArc'),
    nitroFill: $('nitroFill'),
    nitroValue: $('nitroValue'),
    bestLapHud: $('bestLapHud'),
    bestLapMenu: $('bestLapMenu'),
    lbRows: $('lbRows'),
    speedCluster: document.querySelector('.speed-cluster'),
    resultRank: $('resultRank'),
    resultTitle: $('resultTitle'),
    resultSub: $('resultSub'),
    resultTime: $('resultTime'),
    resultBestLap: $('resultBestLap'),
    resultTopSpeed: $('resultTopSpeed'),
    resultBars: $('resultBars'),
    soundBtn: $('soundBtn'),
    touchControls: $('touchControls'),
  };

  ui.bestLapHud.textContent = savedBestLap ? formatTime(savedBestLap) : '--:--.---';
  ui.bestLapMenu.textContent = savedBestLap ? formatTime(savedBestLap) : '--:--.---';
  if (savedMuted) ui.soundBtn.classList.add('muted');

  function setScreen(screen, visible) {
    screen.classList.toggle('is-hidden', !visible);
  }

  function showRaceHud(visible) {
    ui.hud.classList.toggle('is-hidden', !visible);
    if (!visible) ui.touchControls.classList.add('is-hidden');
  }

  function showTouch(visible) {
    ui.touchControls.classList.toggle('is-hidden', !visible);
  }

  function setCountdown(text, sub = 'HOLD THE LINE', isGo = false) {
    ui.countdown.classList.remove('is-hidden');
    ui.countdownNum.textContent = text;
    ui.countdownSub.textContent = sub;
    ui.countdownNum.classList.toggle('go', isGo);
    ui.countdownNum.classList.remove('pop');
    void ui.countdownNum.offsetWidth;
    ui.countdownNum.classList.add('pop');
  }

  function hideCountdown() {
    ui.countdown.classList.add('is-hidden');
  }

  function showToast(text, duration = 1700) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    clearTimeout(race.toastTimer);
    race.toastTimer = setTimeout(() => ui.toast.classList.remove('show'), duration);
  }

  function updateSoundButton() {
    ui.soundBtn.classList.toggle('muted', audio.muted);
    ui.soundBtn.setAttribute('aria-label', audio.muted ? '开启声音' : '关闭声音');
  }

  /* -------------------------------- Rendering ------------------------------- */

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildBackdrop();
  }

  let resizeTimer = 0;
  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 110);
  }

  function project(p, cameraX, cameraY, cameraZ) {
    p.camera.x = p.world.x - cameraX;
    p.camera.y = p.world.y - cameraY;
    p.camera.z = p.world.z - cameraZ;
    const scale = CAMERA_DEPTH / p.camera.z;
    p.screen.scale = scale;
    p.screen.x = W / 2 + scale * p.camera.x * W / 2;
    p.screen.y = H / 2 - scale * p.camera.y * H / 2;
    p.screen.w = scale * ROAD_WIDTH * W / 2;
  }

  function polygon(points, fill) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function renderRoad() {
    const baseSegment = track[baseSegmentIndex];
    const base = baseSegment;
    const playerY = lerp(base.y1, base.y2, basePercent);
    const cameraZ = player.progress % TRACK_LENGTH;
    let maxY = H;
    let x = 0;
    let dx = -(base.curve * basePercent);

    sceneItems.length = 0;

    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const segment = track[(base.index + n) % TRACK_SEGMENTS];
      const looped = segment.index < base.index;
      segment.clip = maxY;

      project(segment.p1, player.x * ROAD_WIDTH - x, playerY + CAMERA_HEIGHT,
        cameraZ - (looped ? TRACK_LENGTH : 0));
      project(segment.p2, player.x * ROAD_WIDTH - x - dx, playerY + CAMERA_HEIGHT,
        cameraZ - (looped ? TRACK_LENGTH : 0));

      x += dx;
      dx += segment.curve;

      if (segment.p1.camera.z <= CAMERA_DEPTH ||
          segment.p2.screen.y >= segment.p1.screen.y ||
          segment.p2.screen.y >= maxY) {
        continue;
      }

      const p1 = segment.p1.screen;
      const p2 = segment.p2.screen;
      const fogIndex = Math.min(FOG_STEPS - 1, Math.floor((n / DRAW_DISTANCE) * FOG_STEPS));
      const colors = fogPalette[fogIndex];
      const y1 = p1.y;
      const y2 = p2.y;
      const w1 = p1.w;
      const w2 = p2.w;
      const x1 = p1.x;
      const x2 = p2.x;

      // Grass band
      ctx.fillStyle = (segment.index % 2 === 0) ? colors.grassA : colors.grassB;
      ctx.fillRect(0, y2, W, y1 - y2 + 1);

      // Neon rumble strips
      const rumbleColor = (segment.index % 2 === 0) ? colors.rumbleA : colors.rumbleB;
      polygon([
        [x1 - w1 * 1.12, y1], [x1 - w1, y1],
        [x2 - w2, y2], [x2 - w2 * 1.12, y2],
      ], rumbleColor);
      polygon([
        [x1 + w1, y1], [x1 + w1 * 1.12, y1],
        [x2 + w2 * 1.12, y2], [x2 + w2, y2],
      ], rumbleColor);

      // Road
      ctx.fillStyle = (segment.index % 2 === 0) ? colors.roadA : colors.roadB;
      ctx.beginPath();
      ctx.moveTo(x1 - w1, y1);
      ctx.lineTo(x2 - w2, y2);
      ctx.lineTo(x2 + w2, y2);
      ctx.lineTo(x1 + w1, y1);
      ctx.closePath();
      ctx.fill();

      // Lane dashes
      if (segment.index % 10 < 4) {
        const laneColor = colors.lane;
        for (const lane of [-1 / 3, 1 / 3]) {
          const lw1 = w1 * 0.012;
          const lw2 = w2 * 0.012;
          const cx1 = x1 + w1 * lane;
          const cx2 = x2 + w2 * lane;
          polygon([
            [cx1 - lw1, y1], [cx1 + lw1, y1],
            [cx2 + lw2, y2], [cx2 - lw2, y2],
          ], laneColor);
        }
      }

      // Inner edge rail glow
      if (n < 120) {
        const railColor = (segment.index % 2 === 0) ? 'rgba(255,45,149,0.7)' : 'rgba(39,230,255,0.65)';
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = railColor;
        ctx.beginPath();
        ctx.moveTo(x1 - w1, y1);
        ctx.lineTo(x2 - w2, y2);
        ctx.lineTo(x2 - w2 + Math.max(1, w2 * 0.015), y2);
        ctx.lineTo(x1 - w1 + Math.max(1, w1 * 0.015), y1);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x1 + w1, y1);
        ctx.lineTo(x2 + w2, y2);
        ctx.lineTo(x2 + w2 - Math.max(1, w2 * 0.015), y2);
        ctx.lineTo(x1 + w1 - Math.max(1, w1 * 0.015), y1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Retroreflective edge studs
      if (segment.index % 7 === 0 && n < 190) {
        const dotColor = (segment.index % 14 === 0) ? '#ff8fce' : '#a8f7ff';
        const dotR = Math.max(0.8, Math.min(3.4, w1 * 0.008));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(x1 - w1 * 1.075, y1 - 1, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x1 + w1 * 1.075, y1 - 1, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Start/finish checker
      if (segment.finish && n < 80) {
        const cols = 14;
        const rows = 2;
        for (let row = 0; row < rows; row++) {
          const t1 = row / rows;
          const t2 = (row + 1) / rows;
          const ry1 = lerp(y1, y2, t1);
          const ry2 = lerp(y1, y2, t2);
          const rx1 = lerp(x1, x2, t1);
          const rx2 = lerp(x1, x2, t2);
          const rw1 = lerp(w1, w2, t1);
          const rw2 = lerp(w1, w2, t2);
          for (let col = 0; col < cols; col++) {
            if ((col + row) % 2 === 0) continue;
            const a1 = -1 + (2 * col) / cols;
            const a2 = -1 + (2 * (col + 1)) / cols;
            polygon([
              [rx1 + rw1 * a1, ry1], [rx1 + rw1 * a2, ry1],
              [rx2 + rw2 * a2, ry2], [rx2 + rw2 * a1, ry2],
            ], 'rgba(255,255,255,0.82)');
          }
        }
      }

      // Collect roadside items
      if (segment.decorations.length) {
        const alpha = clamp(1 - Math.pow(n / DRAW_DISTANCE, 2.7) * 0.95, 0.04, 1);
        for (const deco of segment.decorations) {
          const img = deco.image;
          const w = p1.scale * deco.width * W / 2;
          if (w < 1 || w > W * 5) continue;
          const h = w * (img.height / img.width);
          const sx = p1.x + p1.w * deco.offset;
          const sy = p1.y;
          if (sx + w < -W || sx - w > W * 2) continue;
          sceneItems.push({
            n,
            type: 'sprite',
            img,
            x: sx,
            y: sy,
            w,
            h,
            clip: segment.clip,
            alpha,
            gate: deco.gate,
          });
        }
      }

      maxY = p1.y;
    }

    // Add AI cars to the scene graph
    for (const ai of opponents) {
      if (ai.finished) continue;
      const rel = ai.progress - player.progress;
      if (rel <= 480 || rel > DRAW_DISTANCE * SEGMENT_LENGTH) continue;
      const n = rel / SEGMENT_LENGTH;
      const segment = track[(base.index + Math.floor(n)) % TRACK_SEGMENTS];
      if (!segment || segment.p1.camera.z <= 0) continue;
      const pct = n - Math.floor(n);
      const sx = lerp(segment.p1.screen.x, segment.p2.screen.x, pct);
      const sy = lerp(segment.p1.screen.y, segment.p2.screen.y, pct);
      const sw = lerp(segment.p1.screen.w, segment.p2.screen.w, pct);
      const scale = lerp(segment.p1.screen.scale, segment.p2.screen.scale, pct);
      const carW = scale * 940 * W / 2;
      if (carW < 1.5 || sx + carW < -100 || sx - carW > W + 100) continue;
      const carH = carW * (cars[ai.name].height / cars[ai.name].width);
      const screenX = sx + sw * ai.lane;
      const alpha = clamp(1 - Math.pow(n / DRAW_DISTANCE, 2.8) * 0.92, 0.06, 1);
      sceneItems.push({
        n,
        type: 'ai',
        ai,
        x: screenX,
        y: sy,
        w: carW,
        h: carH,
        clip: segment.clip,
        alpha,
      });
    }

    sceneItems.sort((a, b) => b.n - a.n);
  }

  function drawSprite(img, x, y, w, h, alpha, clip, gate = false) {
    if (w <= 0 || h <= 0) return;
    let drawH = h;
    if (clip !== undefined && y > clip) {
      const crop = y - clip;
      if (crop >= h) return;
      drawH = h - crop;
    }
    if (x + w / 2 < 0 || x - w / 2 > W || y - h > H || y < -H * 0.5) return;
    ctx.globalAlpha = alpha;
    if (gate) {
      // Gate posts look better with a touch of additive glow.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.35;
      ctx.drawImage(img, 0, 0, img.width, img.height * (drawH / h),
        x - w / 2, y - h, w, drawH);
      ctx.restore();
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(img, 0, 0, img.width, img.height * (drawH / h),
      x - w / 2, y - h, w, drawH);
    ctx.globalAlpha = 1;
  }

  function drawSceneItems() {
    for (const item of sceneItems) {
      if (item.type === 'sprite') {
        drawSprite(item.img, item.x, item.y, item.w, item.h, item.alpha, item.clip, item.gate);
      } else if (item.type === 'ai') {
        const ai = item.ai;
        // Shadow
        ctx.save();
        ctx.globalAlpha = item.alpha * 0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath();
        ctx.ellipse(item.x, item.y - item.h * 0.035, item.w * 0.47, item.h * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Tail glow
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = item.alpha * 0.26;
        const glowGrad = ctx.createRadialGradient(item.x, item.y - item.h * 0.39, 1, item.x, item.y - item.h * 0.39, item.w * 0.65);
        glowGrad.addColorStop(0, ai.accent);
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(item.x - item.w, item.y - item.h * 1.1, item.w * 2, item.h * 1.3);
        ctx.restore();
        drawSprite(cars[ai.name], item.x, item.y, item.w, item.h, item.alpha, item.clip);
      }
    }
  }

  function playerCarWidth() {
    const portrait = H > W * 1.15;
    const factor = portrait ? 0.31 : 0.285;
    return Math.min(W * factor, 382);
  }

  function playerBottomY() {
    return H + 2 - Math.max(12, H * 0.042);
  }

  function drawPlayerCar() {
    if (race.mode === 'finished' && player.finished) {
      // keep the car looking alive behind the results card
    }
    const baseW = playerCarWidth();
    const baseH = baseW * (cars.player.height / cars.player.width);
    const speedRatio = clamp(player.speed / MAX_SPEED, 0, 1.3);
    const bounce = Math.sin(performance.now() * 0.022) * (1.4 + speedRatio * 2.2) + player.bump;
    const tilt = player.steerInput * 0.055 + Math.sin(performance.now() * 0.007) * 0.004;
    const y = playerBottomY() + bounce;
    const x = W / 2 + player.steerInput * 8 + (race.mode === 'menu' ? Math.sin(race.menuTime * 0.8) * 2 : 0);

    ctx.save();
    // Road shadow
    const shadow = ctx.createRadialGradient(x, y - baseH * 0.05, 10, x, y - baseH * 0.05, baseW * 0.6);
    shadow.addColorStop(0, 'rgba(0,0,0,0.72)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(x, y - baseH * 0.04, baseW * 0.58, baseH * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Boost exhaust glow
    if (player.boosting) {
      const flicker = 0.78 + Math.random() * 0.22;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        const ex = x + side * baseW * 0.205;
        const ey = y - baseH * 0.075;
        const flameLen = baseH * (0.105 + Math.random() * 0.035) * flicker;
        const flame = ctx.createLinearGradient(ex, ey, ex, ey + flameLen);
        flame.addColorStop(0, 'rgba(255,255,255,0.9)');
        flame.addColorStop(0.16, 'rgba(139,252,255,0.8)');
        flame.addColorStop(0.5, 'rgba(39,230,255,0.42)');
        flame.addColorStop(1, 'rgba(255,45,149,0)');
        ctx.fillStyle = flame;
        ctx.beginPath();
        ctx.moveTo(ex - baseW * 0.032, ey);
        ctx.quadraticCurveTo(ex - baseW * 0.026, ey + flameLen * 0.54, ex + side * baseW * 0.006, ey + flameLen);
        ctx.quadraticCurveTo(ex + baseW * 0.02, ey + flameLen * 0.48, ex + baseW * 0.032, ey);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.ellipse(ex, ey + 2, baseW * 0.014, baseH * 0.012, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Reflection
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.translate(0, y * 2 - baseH * 0.03);
    ctx.scale(1, -0.26);
    ctx.drawImage(cars.player, x - baseW / 2, y - baseH, baseW, baseH);
    ctx.restore();

    // Car
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.drawImage(cars.player, -baseW / 2, -baseH, baseW, baseH);

    // Brake lights
    if (input.brake && race.mode === 'racing') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#ff2020';
      ctx.beginPath();
      ctx.ellipse(-baseW * 0.29, -baseH * 0.39, baseW * 0.11, baseH * 0.028, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(baseW * 0.29, -baseH * 0.39, baseW * 0.11, baseH * 0.028, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function spawnParticle(x, y, vx, vy, life, size, color, gravity = 0, additive = true) {
    if (particles.length > 260) particles.shift();
    particles.push({ x, y, vx, vy, life, maxLife: life, size, color, gravity, additive });
  }

  function spawnBoostParticles() {
    const baseW = playerCarWidth();
    const y = playerBottomY();
    for (const side of [-1, 1]) {
      if (Math.random() < 0.82) {
        spawnParticle(
          W / 2 + side * baseW * 0.22 + (Math.random() - 0.5) * 8,
          y - baseW * 0.075,
          (Math.random() - 0.5) * 60 + side * 12,
          140 + Math.random() * 220,
          0.24 + Math.random() * 0.25,
          3 + Math.random() * 7,
          Math.random() > 0.45 ? 'rgba(39,230,255,' : 'rgba(255,45,149,',
          600,
          true
        );
      }
    }
  }

  function spawnOffroadParticles() {
    if (Math.random() > 0.55) return;
    const left = player.x < 0;
    const baseW = playerCarWidth();
    spawnParticle(
      W / 2 + (left ? -baseW * 0.42 : baseW * 0.42),
      playerBottomY() - baseW * 0.06,
      (Math.random() - 0.5) * 80 - (left ? 120 : -120),
      80 + Math.random() * 160,
      0.3 + Math.random() * 0.45,
      8 + Math.random() * 18,
      'rgba(132,76,150,',
      200,
      false
    );
  }

  function spawnCrashSparks() {
    const x = W / 2;
    const y = H * 0.76;
    for (let i = 0; i < 34; i++) {
      const an = Math.random() * Math.PI * 2;
      const sp = 160 + Math.random() * 620;
      spawnParticle(
        x + (Math.random() - 0.5) * 90,
        y,
        Math.cos(an) * sp,
        Math.sin(an) * sp,
        0.25 + Math.random() * 0.55,
        2 + Math.random() * 5,
        Math.random() > 0.5 ? 'rgba(255,211,110,' : 'rgba(255,45,149,',
        800,
        true
      );
    }
  }

  function spawnTireSmoke() {
    const baseW = playerCarWidth();
    const side = player.steerInput > 0 ? -1 : 1;
    const y = playerBottomY() - baseW * 0.04;
    spawnParticle(
      W / 2 + side * baseW * 0.39 + (Math.random() - 0.5) * 14,
      y,
      side * (80 + Math.random() * 110),
      -30 - Math.random() * 70,
      0.35 + Math.random() * 0.35,
      7 + Math.random() * 12,
      'rgba(170,144,190,',
      -60,
      false
    );
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - 1.4 * dt);
    }
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      const t = clamp(p.life / p.maxLife, 0, 1);
      if (p.additive) ctx.globalCompositeOperation = 'lighter';
      else ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = t * (p.additive ? 0.85 : 0.38);
      ctx.fillStyle = `${p.color}${t.toFixed(2)})`;
      ctx.strokeStyle = `${p.color}${(t * 0.85).toFixed(2)})`;
      if (p.additive) {
        const vx = p.vx * 0.026;
        const vy = p.vy * 0.026;
        ctx.lineWidth = Math.max(0.7, p.size * 0.72);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x - vx, p.y - vy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function initSpeedStreaks() {
    speedStreaks.length = 0;
    for (let i = 0; i < 46; i++) {
      speedStreaks.push({
        angle: Math.random() * Math.PI * 2,
        phase: Math.random(),
        speed: 0.16 + Math.random() * 0.32,
        width: 0.5 + Math.random() * 1.6,
      });
    }
  }
  initSpeedStreaks();

  function drawSpeedFx(time) {
    const ratio = clamp(player.speed / MAX_SPEED, 0, 1.3);
    if (ratio < 0.5 && !player.boosting) return;
    const strength = clamp((ratio - 0.48) / 0.5, 0, 1) + (player.boosting ? 0.55 : 0);
    const cx = W * 0.5;
    const cy = H * 0.47;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < speedStreaks.length; i++) {
      const s = speedStreaks[i];
      const progress = mod(time * (0.22 + ratio * 0.65) * (0.5 + s.speed) + s.phase, 1);
      const maxR = Math.hypot(W, H) * 0.66;
      const r = 40 + Math.pow(progress, 1.7) * maxR;
      const len = 30 + progress * 190 * s.speed;
      const x1 = cx + Math.cos(s.angle) * r;
      const y1 = cy + Math.sin(s.angle) * r;
      const x2 = cx + Math.cos(s.angle) * (r + len);
      const y2 = cy + Math.sin(s.angle) * (r + len);
      if (y1 < H * 0.36) continue;
      if (Math.abs(x1 - cx) < W * 0.09) continue;
      ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.11 * strength;
      ctx.strokeStyle = player.boosting && i % 3 === 0 ? '#9ffbff' : '#ff9fd5';
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawAtmosphere(time) {
    const horizon = H * 0.505;
    const fog = ctx.createLinearGradient(0, horizon - 8, 0, horizon + H * 0.22);
    fog.addColorStop(0, 'rgba(96,19,91,0.62)');
    fog.addColorStop(0.28, 'rgba(66,13,73,0.26)');
    fog.addColorStop(1, 'rgba(20,4,31,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, horizon - 8, W, H * 0.23);

    if (player.boosting) {
      const cx = W / 2;
      const cy = H / 2;
      const grad = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.18, cx, cy, Math.max(W, H) * 0.72);
      grad.addColorStop(0, 'rgba(39,230,255,0)');
      grad.addColorStop(0.72, 'rgba(39,230,255,0.035)');
      grad.addColorStop(1, 'rgba(255,45,149,0.18)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    if (race.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${race.flash * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function render(time) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const progress = player.progress;
    baseSegmentIndex = Math.floor(progress / SEGMENT_LENGTH) % TRACK_SEGMENTS;
    basePercent = (progress % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const curSegment = track[(baseSegmentIndex + Math.floor(PLAYER_Z / SEGMENT_LENGTH)) % TRACK_SEGMENTS];
    currentCurve = curSegment ? curSegment.curve : 0;

    drawSky(time);

    ctx.save();
    ctx.translate(race.shakeX, race.shakeY);
    renderRoad();
    drawSceneItems();
    drawPlayerCar();
    drawParticles();
    drawSpeedFx(time);
    ctx.restore();

    drawAtmosphere(time);
  }

  /* --------------------------------- Physics -------------------------------- */

  function resetRace() {
    player.progress = 0;
    player.speed = 0;
    player.x = 0;
    player.lane = 0;
    player.finished = false;
    player.finishTime = 0;
    player.lap = 1;
    player.lapStart = 0;
    player.bestLap = 0;
    player.lastLap = 0;
    player.topSpeed = 0;
    player.nitro = 100;
    player.boosting = false;
    player.offroad = false;
    player.steer = 0;
    player.steerInput = 0;
    player.bump = 0;
    player.tilt = 0;

    opponents = AI_DEFS.map((def, i) => ({
      ...def,
      id: i,
      progress: def.start,
      speed: 0,
      homeLane: def.lane,
      targetLane: def.lane,
      lane: def.lane,
      finished: false,
      finishTime: 0,
      phase: Math.random() * Math.PI * 2,
      cooldown: 0,
      color: def.color,
      accent: def.accent,
    }));

    race.time = 0;
    race.countdown = 0;
    race.cdStage = -1;
    race.goTimer = 0;
    race.lap = 1;
    race.lapStart = 0;
    race.lastLap = 0;
    race.bestLap = 0;
    race.position = 6;
    race.shake = 0;
    race.shakeX = 0;
    race.shakeY = 0;
    race.flash = 0;
    race.collisionCooldown = 0;
    race.finishShown = false;
    race.result = null;
    race.hudAccumulator = 0;
    race.lastLbUpdate = 0;
    particles.length = 0;
    race.lastLapTime = 0;
  }

  function startRace() {
    audio.start();
    resetRace();
    race.mode = 'countdown';
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    clearTimeout(race.toastTimer);
    ui.toast.classList.remove('show');
    setScreen(ui.menu, false);
    setScreen(ui.results, false);
    setScreen(ui.pause, false);
    showRaceHud(true);
    showTouch(true);
    ui.countdown.classList.remove('is-hidden');
    setCountdown('3', 'HOLD THE LINE', false);
    race.cdStage = 0;
    audio.countdown(false);
    updateSoundButton();
    updateHud();
  }

  function goRace() {
    race.mode = 'racing';
    race.time = 0;
    race.lapStart = 0;
    race.goTimer = 0.82;
    audio.start();
    audio.countdown(true);
    showTouch(true);
    setTimeout(() => {
      if (race.mode === 'racing' && race.time > 0.5) showToast('NIGHT RUN · 3 LAPS', 1500);
    }, 900);
    setTimeout(() => {
      if (race.mode === 'racing' || race.mode === 'paused') hideCountdown();
    }, 780);
  }

  function currentSegmentIndex() {
    return Math.floor(player.progress / SEGMENT_LENGTH) % TRACK_SEGMENTS;
  }

  function updatePlayer(dt) {
    const throttle = input.throttle;
    const boostWanted = input.nitro && player.nitro > 1.5 && player.speed > 1600;
    player.boosting = boostWanted;

    const speedLimit = player.boosting ? NITRO_SPEED : MAX_SPEED;

    if (throttle) {
      const accel = player.boosting ? 12200 : 8500;
      player.speed += accel * (1 - clamp(player.speed / speedLimit, 0, 1)) * dt;
    } else {
      player.speed -= 1600 * dt;
    }

    if (input.brake) player.speed -= 14500 * dt;

    // Aerodynamic drag above the soft cap
    if (player.speed > speedLimit) {
      player.speed -= (player.speed - speedLimit) * 1.55 * dt;
    }

    // nitro tank
    if (player.boosting) {
      player.nitro = Math.max(0, player.nitro - 24 * dt);
    } else {
      player.nitro = Math.min(100, player.nitro + 5.2 * dt);
    }

    // steering
    const targetSteer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    player.steerInput += (targetSteer - player.steerInput) * Math.min(1, dt * 10);
    player.steer += (player.steerInput - player.steer) * Math.min(1, dt * 8);

    const speedRatio = clamp(player.speed / MAX_SPEED, 0, 1.25);
    if (player.speed > 50) {
      const steerRate = 1.25 * (0.16 + Math.min(1, speedRatio) * 0.84);
      player.x += player.steerInput * steerRate * dt;
    }

    const seg = track[currentSegmentIndex()];
    playerSegment = seg;
    const curve = seg.curve;
    currentCurve = curve;

    // centrifugal push
    player.x -= curve * Math.pow(Math.min(1.2, speedRatio), 2) * 0.155 * dt;

    player.offroad = Math.abs(player.x) > 0.985;

    if (player.offroad) {
      player.speed -= Math.max(0, player.speed - 5600) * 1.35 * dt;
      player.speed -= 2200 * dt;
      race.shake = Math.min(8, race.shake + 18 * dt);
      spawnOffroadParticles();
    }

    player.speed = clamp(player.speed, 0, NITRO_SPEED * 1.045);
    player.x = clamp(player.x, -1.42, 1.42);

    // Wheel / engine bump
    player.bump = Math.sin(performance.now() * 0.024) * 0.8 * speedRatio +
      (player.offroad ? Math.sin(performance.now() * 0.09) * 2.6 : 0);

    // Advance
    player.progress += player.speed * dt;
    player.topSpeed = Math.max(player.topSpeed, player.speed);
    player.lap = Math.min(TOTAL_LAPS, Math.floor(player.progress / TRACK_LENGTH) + 1);

    if (player.boosting) {
      spawnBoostParticles();
      race.shake = Math.max(race.shake, 1.9);
    }
    if (player.offroad) spawnOffroadParticles();
    if (!player.offroad && player.speed > 8500 && Math.abs(player.steerInput) > 0.72 && Math.random() < 0.5) {
      spawnTireSmoke();
    }

    // Lap crossing
    const lapBoundary = race.lap * TRACK_LENGTH;
    if (player.progress >= lapBoundary) {
      const lapTime = race.time - race.lapStart;
      player.lastLap = lapTime;
      if (lapTime > 0 && (!player.bestLap || lapTime < player.bestLap)) {
        player.bestLap = lapTime;
        if (!savedBestLap || lapTime < savedBestLap) {
          savedBestLap = lapTime;
          storage.set('nightshift.bestLap', String(lapTime));
          ui.bestLapMenu.textContent = formatTime(lapTime);
          ui.bestLapHud.textContent = formatTime(lapTime);
        }
      }
      race.lastLap = lapTime;
      race.bestLap = player.bestLap;
      player.lapStart = race.time;
      race.lapStart = race.time;

      if (race.lap >= TOTAL_LAPS) {
        finishRace();
        return;
      }

      race.lap += 1;
      player.lap = race.lap;
      player.nitro = Math.min(100, player.nitro + 18);
      race.flash = 1;
      showToast(`LAP ${race.lap} / ${TOTAL_LAPS} · ${formatTime(lapTime)}`, 1900);
      audio.lap();
    }

    if (player.progress >= TOTAL_LAPS * TRACK_LENGTH) {
      finishRace();
    }
  }

  function updateAI(dt) {
    const playerFrac = player.progress;
    for (const ai of opponents) {
      if (ai.finished) continue;

      ai.phase += dt;
      const seg = track[Math.floor(ai.progress / SEGMENT_LENGTH) % TRACK_SEGMENTS];
      const curvePenalty = Math.min(0.12, Math.abs(seg.curve) * 0.032);
      let target = ai.base * (1 - curvePenalty);

      // Gentle rubber banding keeps the pack in the fight without feeling fake.
      const gap = ai.progress - playerFrac;
      if (gap > 9000) target *= 0.94;
      if (gap > 18000) target *= 0.97;
      if (gap < -7000) target *= 1.022;
      if (player.finished) target *= 0.6;

      ai.speed += (target - ai.speed) * Math.min(1, dt * 1.35);
      ai.progress += ai.speed * dt;

      // Weave around the road
      ai.targetLane = clamp(ai.homeLane + Math.sin(ai.phase * 0.42 + ai.id * 1.7) * 0.105, -0.8, 0.8);
      ai.lane = clamp(ai.lane + (ai.targetLane - ai.lane) * Math.min(1, dt * 0.85), -0.85, 0.85);

      // Collision with player
      ai.cooldown = Math.max(0, ai.cooldown - dt);
      const rel = ai.progress - player.progress;
      const lateral = Math.abs(ai.lane - player.x);
      if (ai.cooldown <= 0 && race.collisionCooldown <= 0 &&
          Math.abs(rel) < 310 && lateral < 0.31 && player.speed > 1500) {
        crash(ai, rel);
      }

      ai.progress += 0;

      if (ai.progress >= TOTAL_LAPS * TRACK_LENGTH) {
        ai.progress = TOTAL_LAPS * TRACK_LENGTH;
        ai.finished = true;
        ai.finishTime = race.time;
      }
    }
  }

  function crash(ai, rel) {
    race.collisionCooldown = 0.6;
    ai.cooldown = 1.2;
    player.speed *= 0.79;
    race.shake = 12;
    race.flash = 0.8;
    spawnCrashSparks();
    audio.crash();
    const push = player.x < ai.lane ? -1 : 1;
    player.x = clamp(player.x + push * 0.105, -1.25, 1.25);
    ai.lane = clamp(ai.lane - push * 0.13, -0.85, 0.85);
    if (rel > 0) ai.speed *= 1.04;
    showToast('CONTACT · 保持走线', 900);
  }

  function finishRace() {
    if (race.mode === 'finished') return;
    race.mode = 'finished';
    player.finished = true;
    player.finishTime = race.time;
    player.speed *= 0.5;
    player.boosting = false;
    race.flash = 1;
    race.shake = 9;
    const finishedAI = opponents.filter((a) => a.finished && a.finishTime <= player.finishTime);
    const rank = 1 + finishedAI.length;
    race.position = rank;
    audio.finish(rank === 1);

    const standings = buildStandings();
    race.result = {
      rank,
      time: race.time,
      bestLap: player.bestLap || race.time,
      topSpeed: player.topSpeed,
      standings,
    };

    showTouch(false);
    setTimeout(() => {
      if (race.result) showResults(race.result);
    }, 850);
  }

  function buildStandings() {
    return [
      { ...player, isYou: true, sortProgress: player.progress },
      ...opponents.map((a) => ({ ...a, isYou: false, sortProgress: a.progress })),
    ].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.sortProgress - a.sortProgress;
    });
  }

  function showResults(result) {
    showRaceHud(false);
    setScreen(ui.results, true);
    const win = result.rank === 1;
    ui.results.querySelector('.result-card').classList.toggle('win', win);
    ui.resultRank.textContent = `P${result.rank}`;
    ui.resultTitle.textContent = win ? '冠军' : result.rank <= 3 ? '登上领奖台' : '冲线完成';
    ui.resultSub.textContent = win
      ? '你统治了这条午夜高速。'
      : result.rank <= 3
        ? '领奖台的灯光为你亮起。'
        : '还差一点。下一次，压住最后一弯。';
    ui.resultTime.textContent = formatTime(result.time);
    ui.resultBestLap.textContent = formatTime(result.bestLap);
    ui.resultTopSpeed.innerHTML = `${Math.round(result.topSpeed * 0.0265)} <small>KM/H</small>`;

    const list = result.standings;
    const raceDistance = TOTAL_LAPS * TRACK_LENGTH;
    ui.resultBars.innerHTML = list.map((racer, i) => {
      const name = racer.isYou ? '你 · YOU' : racer.name;
      let time;
      if (racer.finished) {
        time = formatTime(racer.finishTime);
      } else {
        const remaining = Math.max(0, raceDistance - racer.progress);
        const gap = remaining / Math.max(9000, racer.speed || 12000);
        time = `+${gap.toFixed(1)}s`;
      }
      const pct = clamp((racer.progress / raceDistance) * 100, 2, 100);
      return `<div class="result-bar ${racer.isYou ? 'you' : ''}">
        <span class="rpos">${i + 1}</span>
        <span class="rname">${name}</span>
        <span class="rtime">${time}</span>
        <span class="rline"><i style="width:${pct.toFixed(1)}%;background:${racer.isYou ? '#ff2d95' : racer.accent}"></i></span>
      </div>`;
    }).join('');
  }

  function updateMenu(dt) {
    race.menuTime += dt;
    player.speed = 3900 + Math.sin(race.menuTime * 0.5) * 300;
    player.progress += player.speed * dt;
    player.x = Math.sin(race.menuTime * 0.2) * 0.21;
    player.steerInput = Math.cos(race.menuTime * 0.2) * 0.25;
    player.boosting = false;
    player.offroad = false;
    player.nitro = 100;

    opponents.forEach((ai, i) => {
      ai.progress = player.progress + 1700 + i * 920 + Math.sin(race.menuTime * 0.33 + i) * 380;
      ai.speed = 4200 + i * 80;
      ai.lane = clamp(ai.lane + Math.sin(race.menuTime * 0.27 + i * 1.4) * 0.002, -0.8, 0.8);
      ai.finished = false;
    });

    race.shakeX *= 0.9;
    race.shakeY *= 0.9;
    if (Math.random() < 0.4) {
      spawnBoostParticles();
    }
  }

  function update(dt) {
    // Screen shake decay
    race.shake = Math.max(0, race.shake - dt * 28);
    race.flash = Math.max(0, race.flash - dt * 2.2);
    if (race.shake > 0) {
      race.shakeX = (Math.random() - 0.5) * race.shake;
      race.shakeY = (Math.random() - 0.5) * race.shake;
    } else {
      race.shakeX *= 0.75;
      race.shakeY *= 0.75;
    }

    if (race.mode === 'menu') {
      updateMenu(dt);
      updateParticles(dt);
      audio.setEngine(0.16, false, false, false);
      return;
    }

    if (race.mode === 'countdown') {
      race.countdown += dt;
      const stage = Math.floor(race.countdown);
      if (stage !== race.cdStage) {
        race.cdStage = stage;
        if (stage === 0) setCountdown('3', 'HOLD THE LINE', false);
        else if (stage === 1) { setCountdown('2', 'HEAT THE TIRES', false); audio.countdown(false); }
        else if (stage === 2) { setCountdown('1', 'SEND IT', false); audio.countdown(false); }
        else if (stage >= 3) { setCountdown('GO', 'NIGHTSHIFT', true); goRace(); }
      }
      updateParticles(dt);
      audio.setEngine(0.07 + (input.throttle ? 0.1 : 0), input.throttle, false, true);
      return;
    }

    if (race.mode === 'paused') {
      updateParticles(dt * 0.1);
      audio.setEngine(0, false, false, false);
      return;
    }

    // racing / finished
    const active = race.mode === 'racing';
    if (active) {
      race.time += dt;
      audio.setEngine(clamp(player.speed / MAX_SPEED, 0, 1.25), input.throttle, player.boosting, true);
      updatePlayer(dt);
      if (race.mode === 'racing') updateAI(dt);
      updateParticles(dt);
      race.collisionCooldown = Math.max(0, race.collisionCooldown - dt);
    } else {
      player.boosting = false;
      player.speed *= (1 - dt * 0.7);
      updateParticles(dt);
      audio.setEngine(clamp(player.speed / MAX_SPEED, 0, 1.2), false, false, true);
    }

    race.hudAccumulator += dt;
    if (race.hudAccumulator >= 0.04 || race.mode === 'finished') {
      race.hudAccumulator = 0;
      updateHud();
    }
  }

  /* ---------------------------------- HUD ---------------------------------- */

  let lbRowsCache = '';

  function updateHud() {
    const kmh = Math.round(player.speed * 0.0265);
    ui.speedValue.textContent = pad(Math.min(999, kmh), 3);
    const arc = clamp(kmh / MAX_KMH, 0, 1) * 75;
    ui.dialArc.style.strokeDasharray = `${arc.toFixed(1)} 100`;
    ui.speedCluster.classList.toggle('boosting', player.boosting);

    let gear = 'N';
    if (player.speed > 30) {
      const thresholds = [0, 62, 125, 188, 250, 312];
      gear = String(clamp(1 + thresholds.filter((t) => kmh >= t).length - 1, 1, 6));
    }
    ui.gearValue.textContent = gear;

    const nitro = Math.round(player.nitro);
    ui.nitroFill.style.width = `${nitro}%`;
    ui.nitroValue.textContent = `${nitro}%`;
    ui.nitroFill.classList.toggle('low', nitro < 25);

    ui.lapValue.textContent = String(Math.min(TOTAL_LAPS, race.lap));
    ui.raceTime.textContent = formatTime(race.time);
    const lapTime = Math.max(0, race.time - race.lapStart);
    ui.lapTime.textContent = formatTime(lapTime);
    if (player.bestLap > 0) {
      ui.bestLapHud.textContent = formatTime(player.bestLap);
    }

    const standings = buildStandings();
    const rank = standings.findIndex((r) => r.isYou) + 1;
    ui.posValue.textContent = String(rank);
    ui.posValue.style.color = rank === 1 ? 'var(--amber)' : '';

    if (race.time - race.lastLbUpdate > 0.14 || race.lastLbUpdate === 0) {
      race.lastLbUpdate = race.time;
      const leader = standings[0];
      const rows = standings.map((racer, i) => {
        const gap = i === 0 ? '--' : formatGap(Math.max(0, (leader.progress - racer.progress) / 13500));
        return `<div class="lb-row ${racer.isYou ? 'you' : ''} ${racer.finished ? 'finished' : ''}">
          <span class="lb-pos">${i + 1}</span>
          <span class="lb-dot" style="background:${racer.isYou ? '#ff2d95' : racer.accent};color:${racer.isYou ? '#ff2d95' : racer.accent}"></span>
          <span class="lb-name">${racer.isYou ? 'YOU' : racer.name}</span>
          <span class="lb-gap">${gap}</span>
        </div>`;
      }).join('');
      if (rows !== lbRowsCache) {
        lbRowsCache = rows;
        ui.lbRows.innerHTML = rows;
      }
    }
  }

  /* -------------------------------- Controls -------------------------------- */

  function keyDown(e) {
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      e.preventDefault();
    }
    if (code === 'ArrowLeft' || code === 'KeyA') input.left = true;
    if (code === 'ArrowRight' || code === 'KeyD') input.right = true;
    if (code === 'ArrowUp' || code === 'KeyW') input.throttle = true;
    if (code === 'ArrowDown' || code === 'KeyS') input.brake = true;
    if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') input.nitro = true;

    if (e.repeat) return;

    if (code === 'Enter' || code === 'NumpadEnter') {
      if (race.mode === 'menu') startRace();
      else if (race.mode === 'finished') startRace();
    }
    if (code === 'KeyP' || code === 'Escape') {
      if (race.mode === 'racing') pauseRace();
      else if (race.mode === 'paused') resumeRace();
    }
    if (code === 'KeyM') toggleMute();
    if (code === 'KeyR' && (race.mode === 'racing' || race.mode === 'paused' || race.mode === 'finished')) {
      startRace();
    }
    if (race.mode === 'menu' && code === 'Space') startRace();
  }

  function keyUp(e) {
    const code = e.code;
    if (code === 'ArrowLeft' || code === 'KeyA') input.left = false;
    if (code === 'ArrowRight' || code === 'KeyD') input.right = false;
    if (code === 'ArrowUp' || code === 'KeyW') input.throttle = false;
    if (code === 'ArrowDown' || code === 'KeyS') input.brake = false;
    if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') input.nitro = false;
  }

  function bindHoldButton(id, key) {
    const el = $(id);
    if (!el) return;
    const down = (e) => {
      e.preventDefault();
      input[key] = true;
      el.classList.add('active');
      if (el.setPointerCapture && e.pointerId !== undefined) {
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      }
      audio.start();
    };
    const up = (e) => {
      if (e) e.preventDefault();
      input[key] = false;
      el.classList.remove('active');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindHoldButton('btnLeft', 'left');
  bindHoldButton('btnRight', 'right');
  bindHoldButton('btnGas', 'throttle');
  bindHoldButton('btnBrake', 'brake');
  bindHoldButton('btnNitro', 'nitro');

  // Release all touch controls if the pointer goes away unexpectedly.
  window.addEventListener('blur', () => {
    input.left = false;
    input.right = false;
    input.throttle = false;
    input.brake = false;
    input.nitro = false;
    document.querySelectorAll('.touch-btn.active').forEach((el) => el.classList.remove('active'));
  });

  function toggleMute() {
    audio.setMuted(!audio.muted);
    updateSoundButton();
  }

  function pauseRace() {
    if (race.mode !== 'racing') return;
    race.mode = 'paused';
    hideCountdown();
    input.throttle = false;
    input.brake = false;
    input.nitro = false;
    input.left = false;
    input.right = false;
    setScreen(ui.pause, true);
    showTouch(false);
    audio.pause();
  }

  function resumeRace() {
    if (race.mode !== 'paused') return;
    race.mode = 'racing';
    setScreen(ui.pause, false);
    showTouch(true);
    audio.resume();
  }

  function quitToMenu() {
    race.mode = 'menu';
    setScreen(ui.pause, false);
    setScreen(ui.results, false);
    setScreen(ui.menu, true);
    showRaceHud(false);
    showTouch(false);
    hideCountdown();
    resetRace();
    race.mode = 'menu';
    audio.resume();
    showTouch(false);
    ui.bestLapMenu.textContent = savedBestLap ? formatTime(savedBestLap) : '--:--.---';
  }

  $('startBtn').addEventListener('click', startRace);
  $('replayBtn').addEventListener('click', startRace);
  $('menuBtn').addEventListener('click', quitToMenu);
  $('resumeBtn').addEventListener('click', resumeRace);
  $('pauseRestartBtn').addEventListener('click', startRace);
  $('quitBtn').addEventListener('click', quitToMenu);
  $('pauseBtn').addEventListener('click', () => {
    if (race.mode === 'racing') pauseRace();
    else if (race.mode === 'paused') resumeRace();
  });
  $('soundBtn').addEventListener('click', () => {
    audio.init();
    toggleMute();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (race.mode === 'racing') pauseRace();
      audio.suspend();
    } else {
      audio.resume();
    }
  });

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 160));

  // Prevent page gestures from interfering with driving on touch devices.
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* --------------------------------- Main loop ------------------------------ */

  let lastTime = performance.now();
  let elapsed = 0;

  function frame(now) {
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    const dt = clamp(rawDt, 0, 0.05);
    elapsed += dt;

    update(dt);
    render(elapsed);

    if (race.mode === 'racing' && dt > 0) {
      // HUD position updates are throttled inside updateHud; race time is smooth.
    }
    requestAnimationFrame(frame);
  }

  /* --------------------------------- Boot ----------------------------------- */

  resize();
  buildTrack();
  resetRace();
  race.mode = 'menu';
  player.progress = 0;
  race.menuTime = 0;
  opponents.forEach((ai, i) => {
    ai.progress = 3200 + i * 1050;
    ai.speed = 3200;
  });
  ui.soundBtn.classList.toggle('muted', savedMuted);

  if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
    document.body.classList.add('supports-touch');
    document.body.classList.add('touch');
  }

  requestAnimationFrame(frame);
})();
