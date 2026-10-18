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

  function withAlpha(hex, alpha) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
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

  const CAR_DEFS = [
    {
      id: 'vanta',
      name: 'VANTA RS',
      tag: 'ALL-ROUNDER',
      desc: '均衡的街道赛车，抓地稳定，适合所有赛道。',
      color: '#d9d3ec',
      accent: '#27e6ff',
      dark: '#5a3f86',
      cost: 0,
      maxSpeed: 13400,
      nitroSpeed: 16800,
      accel: 8600,
      grip: 1.0,
      steer: 1.0,
      nitroDrain: 24,
      nitroRegen: 5.4,
      bars: { speed: 78, accel: 82, grip: 84, nitro: 82 },
    },
    {
      id: 'kaze',
      name: 'KAZE GT',
      tag: 'AGILE',
      desc: '轻量化的弯道机器，转向迅捷，氮气容量略小。',
      color: '#ffc75e',
      accent: '#ff4f9a',
      dark: '#7b3f0c',
      cost: 800,
      maxSpeed: 12900,
      nitroSpeed: 15900,
      accel: 9700,
      grip: 1.16,
      steer: 1.13,
      nitroDrain: 22,
      nitroRegen: 5.9,
      bars: { speed: 70, accel: 100, grip: 100, nitro: 74 },
    },
    {
      id: 'nova',
      name: 'NOVA X',
      tag: 'TOP SPEED',
      desc: '极端高速原型车，直线无敌，弯中需要更细腻的控制。',
      color: '#ff4f9c',
      accent: '#b7fbff',
      dark: '#771846',
      cost: 1800,
      maxSpeed: 14700,
      nitroSpeed: 18200,
      accel: 8050,
      grip: 0.86,
      steer: 0.92,
      nitroDrain: 26,
      nitroRegen: 5.0,
      bars: { speed: 100, accel: 73, grip: 66, nitro: 100 },
    },
  ];

  const THEMES = {
    midnight: {
      id: 'midnight',
      decor: 'neon',
      sky: ['#030107', '#0d0320', '#2a0741', '#641050', '#b42266', '#ff5d7b', '#ffb27d'],
      sun: ['#fff6c4', '#ffd277', '#ff8b7c', '#ff3d91', '#a41771'],
      haze: ['rgba(255,45,149,0)', 'rgba(255,75,150,0.22)', 'rgba(74,8,63,0)'],
      far: { top: '#2a0b42', bottom: '#130520', rim: '#c6368f' },
      near: { top: '#1b072d', bottom: '#090311', rim: '#ff2d95' },
      ground: ['#3a0c45', '#1c062c', '#08020f'],
      city: true,
      cityDensity: 1,
      cityWarm: 'rgba(255,144,201,0.46)',
      cityCool: 'rgba(39,230,255,0.5)',
      accent: '#ff2d95',
      accent2: '#27e6ff',
      palette: {
        grassA: '#10051e', grassB: '#180727', roadA: '#151020', roadB: '#1b1529',
        rumbleA: '#ff2d95', rumbleB: '#27e6ff', lane: '#eee6ff', fog: '#521452',
      },
    },
    harbor: {
      id: 'harbor',
      decor: 'harbor',
      sky: ['#01040a', '#030b1b', '#07223b', '#0a3f5d', '#126f88', '#44bbc8', '#ff9ec6'],
      sun: ['#f8ffff', '#bdf7ff', '#63d7e5', '#ff8cbe', '#b23281'],
      haze: ['rgba(39,230,255,0)', 'rgba(54,190,218,0.2)', 'rgba(8,48,67,0)'],
      far: { top: '#062339', bottom: '#03101e', rim: '#2fb6cc' },
      near: { top: '#041b2b', bottom: '#02090f', rim: '#ff4f9a' },
      ground: ['#0a394b', '#051d2b', '#02080e'],
      city: true,
      cityDensity: 1.25,
      cityWarm: 'rgba(255,143,194,0.48)',
      cityCool: 'rgba(80,236,255,0.55)',
      accent: '#27e6ff',
      accent2: '#ff4f9a',
      palette: {
        grassA: '#061520', grassB: '#081c28', roadA: '#0f1720', roadB: '#121d27',
        rumbleA: '#27e6ff', rumbleB: '#ff4f9a', lane: '#dffbff', fog: '#0d4152',
      },
    },
    crimson: {
      id: 'crimson',
      decor: 'desert',
      sky: ['#090206', '#1b040b', '#3c0714', '#731522', '#ad3226', '#e5713a', '#ffc07b'],
      sun: ['#fff6ca', '#ffd982', '#ff9e55', '#eb4a4b', '#7e102d'],
      haze: ['rgba(255,122,56,0)', 'rgba(255,101,69,0.2)', 'rgba(70,12,20,0)'],
      far: { top: '#3a1117', bottom: '#18070c', rim: '#d15b42' },
      near: { top: '#240a10', bottom: '#0a0305', rim: '#ff7b50' },
      ground: ['#4a1517', '#250a0d', '#0b0305'],
      city: false,
      cityDensity: 0,
      cityWarm: 'rgba(255,181,109,0.4)',
      cityCool: 'rgba(255,93,86,0.4)',
      accent: '#ff8a3d',
      accent2: '#ff3d6e',
      palette: {
        grassA: '#180709', grassB: '#210a0b', roadA: '#1a1010', roadB: '#211514',
        rumbleA: '#ff8a3d', rumbleB: '#ff3d6e', lane: '#fff0d5', fog: '#5a1c20',
      },
    },
    skyline: {
      id: 'skyline',
      decor: 'city',
      sky: ['#01030a', '#040c1c', '#081e38', '#103452', '#395177', '#9e4f7f', '#ff839d'],
      sun: ['#f6ffff', '#bdeaff', '#7bb7e8', '#e57ca8', '#85275e'],
      haze: ['rgba(92,164,255,0)', 'rgba(92,164,255,0.18)', 'rgba(12,30,55,0)'],
      far: { top: '#0c2340', bottom: '#050d1a', rim: '#5f87c4' },
      near: { top: '#071326', bottom: '#02060c', rim: '#a05aa4' },
      ground: ['#112a44', '#071423', '#02050a'],
      city: true,
      cityDensity: 1.6,
      cityWarm: 'rgba(255,143,194,0.44)',
      cityCool: 'rgba(92,210,255,0.56)',
      accent: '#35d9ff',
      accent2: '#ff76ae',
      palette: {
        grassA: '#070e19', grassB: '#0a1522', roadA: '#11151d', roadB: '#161c26',
        rumbleA: '#35d9ff', rumbleB: '#ff76ae', lane: '#e8f5ff', fog: '#203955',
      },
    },
  };

  const TRACK_DEFS = [
    {
      id: 'midnight',
      name: 'MIDNIGHT LOOP',
      cn: '午夜环线',
      sector: 'SECTOR 09',
      desc: '高速长弯与霓虹龙门，适合第一次夜跑。',
      theme: 'midnight',
      segments: 1200,
      laps: 3,
      difficulty: '★★☆',
      aiSkill: 1.0,
      curveKeys: [[0, 0], [0.07, 1.9], [0.15, 0.4], [0.24, -2.2], [0.32, -0.6], [0.4, 1.2], [0.5, 2.6], [0.6, 0.8], [0.68, -1.9], [0.78, -2.5], [0.88, -0.4], [0.94, 1.1], [1, 0]],
      heightKeys: [[0, 0], [0.12, 500], [0.2, -250], [0.33, 900], [0.44, 1100], [0.52, 0], [0.64, -600], [0.76, 500], [0.86, 1100], [0.94, 200], [1, 0]],
    },
    {
      id: 'harbor',
      name: 'NEON HARBOR',
      cn: '霓虹港湾',
      sector: 'SECTOR 12',
      desc: '连续低速 S 弯，节奏紧凑，出弯决定胜负。',
      theme: 'harbor',
      segments: 1080,
      laps: 3,
      difficulty: '★★☆',
      aiSkill: 1.01,
      curveKeys: [[0, 0], [0.08, -1.5], [0.16, 2.2], [0.24, 2.8], [0.31, -1.8], [0.4, -2.4], [0.48, 0.4], [0.56, 2.3], [0.64, 1.2], [0.72, -2.7], [0.8, -1.6], [0.9, 1.8], [1, 0]],
      heightKeys: [[0, 0], [0.16, 280], [0.3, -180], [0.44, 420], [0.58, 160], [0.72, -260], [0.84, 480], [0.94, 140], [1, 0]],
    },
    {
      id: 'crimson',
      name: 'CRIMSON PASS',
      cn: '赤色山口',
      sector: 'SECTOR 21',
      desc: '长距离大起伏与高速盲弯，考验勇气和刹车点。',
      theme: 'crimson',
      segments: 1360,
      laps: 3,
      difficulty: '★★★',
      aiSkill: 1.025,
      curveKeys: [[0, 0], [0.1, 1.2], [0.2, 2.4], [0.3, 1.5], [0.4, -0.6], [0.5, -2.6], [0.6, -2.5], [0.72, -0.8], [0.82, 1.8], [0.92, 1.2], [1, 0]],
      heightKeys: [[0, 0], [0.1, 900], [0.2, 1750], [0.3, 500], [0.4, -900], [0.5, -300], [0.62, 1200], [0.74, 2000], [0.84, 300], [0.93, 900], [1, 0]],
    },
    {
      id: 'skyline',
      name: 'SKYLINE SPRINT',
      cn: '天际冲刺',
      sector: 'SECTOR 33',
      desc: '短促、密集、几乎没有喘息的技术型城市赛道。',
      theme: 'skyline',
      segments: 1000,
      laps: 4,
      difficulty: '★★★',
      aiSkill: 1.035,
      curveKeys: [[0, 0], [0.06, -2.6], [0.12, -1.2], [0.2, 2.8], [0.28, 1.5], [0.38, -2.9], [0.46, -0.5], [0.55, 2.2], [0.63, 2.9], [0.71, 0.8], [0.8, -2.4], [0.88, -1.9], [0.94, 1.3], [1, 0]],
      heightKeys: [[0, 0], [0.12, 320], [0.24, -220], [0.36, 680], [0.5, 180], [0.64, -380], [0.78, 520], [0.9, 240], [1, 0]],
    },
  ];

  const TRACK_BY_ID = Object.fromEntries(TRACK_DEFS.map((t) => [t.id, t]));
  const CAR_BY_ID = Object.fromEntries(CAR_DEFS.map((c) => [c.id, c]));

  const DIFFICULTY = {
    rookie: { label: '新手', ai: 0.91, color: '#52ffb8' },
    standard: { label: '标准', ai: 1.0, color: '#ffd36e' },
    pro: { label: '硬核', ai: 1.065, color: '#ff5d8f' },
  };

  const CAREER_EVENTS = [
    { id: 'e1', name: 'FIRST NIGHT', cn: '第一夜', track: 'midnight', laps: 2, difficulty: 'rookie', target: 3, reward: 260, color: '#52ffb8', desc: '熟悉午夜环线，登上领奖台。' },
    { id: 'e2', name: 'HARBOR RUN', cn: '港湾追逐', track: 'harbor', laps: 2, difficulty: 'standard', target: 3, reward: 360, color: '#27e6ff', desc: '连续 S 弯，保持走线节奏。' },
    { id: 'e3', name: 'REDLINE PASS', cn: '赤色突破', track: 'crimson', laps: 3, difficulty: 'standard', target: 2, reward: 520, color: '#ff8a3d', desc: '大起伏与盲弯，必须进入前二。' },
    { id: 'e4', name: 'SKYLINE SPRINT', cn: '天际冲刺', track: 'skyline', laps: 3, difficulty: 'pro', target: 2, reward: 720, color: '#ff76ae', desc: '短促技术赛道，验证你的极限。' },
    { id: 'e5', name: 'NIGHT CHAMPION', cn: '午夜之王', track: 'midnight', laps: 4, difficulty: 'pro', target: 1, reward: 1400, color: '#ffd36e', desc: '四圈决胜，只接受第一名。' },
  ];

  const UPGRADE_DEFS = [
    {
      id: 'engine', name: '引擎', code: 'ENGINE', desc: '每级 +220 极速', max: 5,
      costs: [120, 200, 320, 480, 700],
      apply: (car, level) => { car.maxSpeed += 220 * level; car.bars.speed = Math.min(100, car.bars.speed + 4 * level); },
    },
    {
      id: 'grip', name: '轮胎 / 悬挂', code: 'CHASSIS', desc: '每级 +0.04 抓地', max: 5,
      costs: [120, 200, 320, 480, 700],
      apply: (car, level) => { car.grip += 0.04 * level; car.steer += 0.015 * level; car.bars.grip = Math.min(100, car.bars.grip + 4 * level); },
    },
    {
      id: 'nitro', name: '氮气系统', code: 'NITRO', desc: '每级 +220 氮气极速', max: 5,
      costs: [120, 200, 320, 480, 700],
      apply: (car, level) => { car.nitroSpeed += 220 * level; car.nitroRegen += 0.25 * level; car.bars.nitro = Math.min(100, car.bars.nitro + 4 * level); },
    },
    {
      id: 'weight', name: '轻量化', code: 'WEIGHT', desc: '每级 +260 加速', max: 5,
      costs: [120, 200, 320, 480, 700],
      apply: (car, level) => { car.accel += 260 * level; car.bars.accel = Math.min(100, car.bars.accel + 4 * level); },
    },
  ];

  const ACHIEVEMENTS = [
    { id: 'first_race', name: 'FIRST LIGHT', cn: '初次点火', desc: '完成第一场比赛', metric: 'races', target: 1, reward: 100, icon: '01' },
    { id: 'first_win', name: 'WINNER', cn: '冠军之夜', desc: '赢得第一场比赛', metric: 'wins', target: 1, reward: 200, icon: '02' },
    { id: 'podium3', name: 'PODIUM REGULAR', cn: '领奖台常客', desc: '累计 3 次登上领奖台', metric: 'podiums', target: 3, reward: 250, icon: '03' },
    { id: 'collector', name: 'COLLECTOR', cn: '车库收藏家', desc: '拥有全部 3 台赛车', metric: 'cars', target: 3, reward: 500, icon: '04' },
    { id: 'champion', name: 'NIGHT CHAMPION', cn: '午夜之王', desc: '完成全部 5 场生涯赛事', metric: 'events', target: 5, reward: 1000, icon: '05' },
    { id: 'record1', name: 'RECORD RUN', cn: '纪录创造者', desc: '创造 1 个赛道纪录', metric: 'records', target: 1, reward: 200, icon: '06' },
    { id: 'drift60', name: 'SIDEWAYS', cn: '侧滑艺术', desc: '累计漂移 60 秒', metric: 'drift', target: 60, reward: 300, icon: '07' },
    { id: 'nitro120', name: 'NITRO ADDICT', cn: '氮气依赖', desc: '累计使用氮气 120 秒', metric: 'nitro', target: 120, reward: 300, icon: '08' },
    { id: 'clean1', name: 'FLAWLESS', cn: '完美单圈', desc: '完成 1 个零失误单圈', metric: 'cleanLaps', target: 1, reward: 250, icon: '09' },
    { id: 'redline', name: 'REDLINE', cn: '突破红线', desc: '达到 400 KM/H', metric: 'topSpeed', target: 400, reward: 300, icon: '10' },
    { id: 'veteran', name: 'VETERAN', cn: '夜路老兵', desc: '完成 10 场比赛', metric: 'races', target: 10, reward: 500, icon: '11' },
    { id: 'daily3', name: 'ROUTINE', cn: '每日例行', desc: '完成 3 个每日挑战', metric: 'dailies', target: 3, reward: 300, icon: '12' },
  ];

  const DAILY_POOL = [
    { id: 'races2', name: '完成 2 场比赛', metric: 'races', target: 2, reward: 150, icon: '02' },
    { id: 'podium1', name: '登上领奖台 1 次', metric: 'podiums', target: 1, reward: 180, icon: '03' },
    { id: 'win1', name: '赢得 1 场比赛', metric: 'wins', target: 1, reward: 250, icon: '01' },
    { id: 'drift20', name: '累计漂移 20 秒', metric: 'drift', target: 20, reward: 160, icon: '07' },
    { id: 'nitro35', name: '使用氮气 35 秒', metric: 'nitro', target: 35, reward: 160, icon: '08' },
    { id: 'speed330', name: '达到 330 KM/H', metric: 'topSpeed', target: 330, reward: 180, icon: '10' },
    { id: 'clean1', name: '完成 1 个零失误单圈', metric: 'cleanLaps', target: 1, reward: 220, icon: '09' },
  ];

  const DEFAULT_SETTINGS = {
    difficulty: 'standard',
    assist: 'low',
    camera: 'near',
    autoThrottle: false,
    ghost: true,
    masterVolume: 0.8,
    musicVolume: 0.65,
    engineVolume: 0.85,
  };

  let savedBestLap = Number(storage.get('nightshift.bestLap', '0')) || 0;
  const savedMuted = storage.get('nightshift.muted', '0') === '1';

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function emptyUpgradeSet() {
    return { engine: 0, grip: 0, nitro: 0, weight: 0 };
  }

  function createDefaultProfile() {
    const upgrades = {};
    CAR_DEFS.forEach((car) => { upgrades[car.id] = emptyUpgradeSet(); });
    return {
      version: 3,
      coins: 400,
      wins: 0,
      podiums: 0,
      races: 0,
      cars: ['vanta'],
      events: {},
      tracks: {},
      leaderboards: {},
      upgrades,
      achievements: {},
      daily: null,
      stats: {
        driftTime: 0,
        nitroTime: 0,
        cleanLaps: 0,
        records: 0,
        topSpeed: 0,
        dailies: 0,
      },
      lastTrack: 'midnight',
      lastCar: 'vanta',
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  function loadProfile() {
    const base = createDefaultProfile();
    let parsed = null;
    try {
      parsed = JSON.parse(storage.get('nightshift.profile.v3', 'null'));
      if (!parsed) parsed = JSON.parse(storage.get('nightshift.profile.v2', 'null'));
    } catch (e) {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') return base;
    const cars = Array.isArray(parsed.cars) && parsed.cars.length
      ? Array.from(new Set(['vanta', ...parsed.cars.filter((id) => CAR_BY_ID[id])]))
      : base.cars;
    const upgrades = {};
    CAR_DEFS.forEach((car) => {
      upgrades[car.id] = {
        ...emptyUpgradeSet(),
        ...((parsed.upgrades && parsed.upgrades[car.id]) || {}),
      };
    });
    return {
      ...base,
      ...parsed,
      version: 3,
      cars,
      events: { ...(parsed.events || {}) },
      tracks: { ...(parsed.tracks || {}) },
      leaderboards: { ...(parsed.leaderboards || {}) },
      upgrades,
      achievements: { ...(parsed.achievements || {}) },
      daily: parsed.daily || null,
      stats: { ...base.stats, ...(parsed.stats || {}) },
      settings: { ...base.settings, ...(parsed.settings || {}) },
    };
  }

  let profile = loadProfile();
  let selectedTrackId = TRACK_BY_ID[profile.lastTrack] ? profile.lastTrack : 'midnight';
  let selectedCarId = profile.cars.includes(profile.lastCar) ? profile.lastCar : 'vanta';
  let currentEvent = null;
  let currentRaceMode = 'QUICK RACE';
  let profileTab = 'daily';
  ensureDaily();
  checkAchievements();

  function saveProfile() {
    storage.set('nightshift.profile.v3', JSON.stringify(profile));
  }

  function upgradeLevels(carId) {
    if (!profile.upgrades[carId]) profile.upgrades[carId] = emptyUpgradeSet();
    return profile.upgrades[carId];
  }

  function effectiveCar(baseCar) {
    const car = { ...baseCar, bars: { ...baseCar.bars } };
    const levels = upgradeLevels(baseCar.id);
    UPGRADE_DEFS.forEach((def) => {
      const level = clamp(levels[def.id] || 0, 0, def.max);
      if (level > 0) def.apply(car, level);
    });
    return car;
  }

  function dailyChallengeById(id) {
    return DAILY_POOL.find((c) => c.id === id) || null;
  }

  function pickDailyIds(date) {
    let seed = 17;
    for (let i = 0; i < date.length; i++) seed = (seed * 31 + date.charCodeAt(i)) >>> 0;
    const rand = mulberry32(seed);
    const pool = DAILY_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3).map((c) => c.id);
  }

  function emptyDailyProgress() {
    return { races: 0, podiums: 0, wins: 0, drift: 0, nitro: 0, topSpeed: 0, cleanLaps: 0 };
  }

  function ensureDaily() {
    const key = todayKey();
    if (!profile.daily || profile.daily.date !== key) {
      profile.daily = {
        date: key,
        ids: pickDailyIds(key),
        progress: emptyDailyProgress(),
        claimed: [],
      };
      saveProfile();
    }
    if (!profile.daily.progress) profile.daily.progress = emptyDailyProgress();
    if (!Array.isArray(profile.daily.claimed)) profile.daily.claimed = [];
    return profile.daily;
  }

  function achievementValue(metric) {
    switch (metric) {
      case 'races': return profile.races;
      case 'wins': return profile.wins;
      case 'podiums': return profile.podiums;
      case 'cars': return profile.cars.length;
      case 'events': return CAREER_EVENTS.filter((e) => eventCompleted(e)).length;
      case 'records': return profile.stats.records;
      case 'drift': return profile.stats.driftTime;
      case 'nitro': return profile.stats.nitroTime;
      case 'cleanLaps': return profile.stats.cleanLaps;
      case 'topSpeed': return profile.stats.topSpeed;
      case 'dailies': return profile.stats.dailies;
      default: return 0;
    }
  }

  function checkAchievements() {
    const newly = [];
    ACHIEVEMENTS.forEach((ach) => {
      if (profile.achievements[ach.id]) return;
      if (achievementValue(ach.metric) >= ach.target) {
        profile.achievements[ach.id] = { at: Date.now(), reward: ach.reward };
        profile.coins += ach.reward;
        newly.push(ach);
      }
    });
    if (newly.length) saveProfile();
    return newly;
  }

  function addLeaderboardEntry(trackId, time, rank, carId) {
    if (!time || time <= 0) return null;
    if (!profile.leaderboards[trackId]) profile.leaderboards[trackId] = [];
    const list = profile.leaderboards[trackId];
    const entry = {
      time,
      rank,
      carId,
      carName: (CAR_BY_ID[carId] || CAR_BY_ID.vanta).name,
      at: Date.now(),
    };
    list.push(entry);
    list.sort((a, b) => a.time - b.time);
    profile.leaderboards[trackId] = list.slice(0, 5);
    saveProfile();
    return profile.leaderboards[trackId].indexOf(entry);
  }

  function getTrackRecord(trackId) {
    if (!profile.tracks[trackId]) {
      profile.tracks[trackId] = { bestTime: 0, bestLap: 0, sectors: [0, 0, 0], ghost: null };
    }
    return profile.tracks[trackId];
  }

  function getSettings() {
    return profile.settings;
  }

  function isCarUnlocked(carId) {
    return profile.cars.includes(carId);
  }

  function applyCameraSetting() {
    cameraHeight = getSettings().camera === 'far' ? 1780 : 1500;
    PLAYER_Z = cameraHeight * CAMERA_DEPTH;
  }

  // palette rebuilt per selected track theme
  const FOG_STEPS = 24;
  const fogPalette = [];
  let currentTheme = THEMES.midnight;

  function rebuildFogPalette(theme) {
    currentTheme = theme;
    const p = theme.palette;
    const base = {
      grassA: hexToRgb(p.grassA),
      grassB: hexToRgb(p.grassB),
      roadA: hexToRgb(p.roadA),
      roadB: hexToRgb(p.roadB),
      rumbleA: hexToRgb(p.rumbleA),
      rumbleB: hexToRgb(p.rumbleB),
      lane: hexToRgb(p.lane),
      fog: hexToRgb(p.fog),
    };
    fogPalette.length = 0;
    for (let i = 0; i < FOG_STEPS; i++) {
      const t = Math.pow(i / (FOG_STEPS - 1), 1.85);
      const grassA = mixRgb(base.grassA, base.fog, t);
      const grassB = mixRgb(base.grassB, base.fog, t);
      const roadA = mixRgb(base.roadA, base.fog, t);
      const roadB = mixRgb(base.roadB, base.fog, t);
      const rumbleA = mixRgb(base.rumbleA, base.fog, t);
      const rumbleB = mixRgb(base.rumbleB, base.fog, t);
      const lane = mixRgb(base.lane, base.fog, t);
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
  }

  rebuildFogPalette(currentTheme);

  /* --------------------------------- Setup --------------------------------- */

  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  let W = window.innerWidth;
  let H = window.innerHeight;
  let DPR = 1;

  const SEGMENT_LENGTH = 200;
  let TRACK_SEGMENTS = 1200;
  let TRACK_LENGTH = SEGMENT_LENGTH * TRACK_SEGMENTS;
  const ROAD_WIDTH = 2200;
  let cameraHeight = 1500;
  const DRAW_DISTANCE = 300;
  const FIELD_OF_VIEW = 100;
  const CAMERA_DEPTH = 1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180);
  let PLAYER_Z = cameraHeight * CAMERA_DEPTH;
  const RACER_COUNT = 6;
  const MAX_KMH = 500;
  const WALL_LIMIT = 1.27;

  applyCameraSetting();

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
      this.volumes = { master: 0.8, music: 0.65, engine: 0.85 };
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
      this.master.gain.value = this.muted ? 0 : 0.72 * this.volumes.master;
      this.master.connect(this.ctx.destination);

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.24;
      compressor.connect(this.master);
      this.bus = compressor;
      this.engineBus = this.ctx.createGain();
      this.engineBus.gain.value = this.volumes.engine;
      this.engineBus.connect(compressor);

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
      this.engineGain.connect(this.engineBus);

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
      this.windGain.connect(this.engineBus);
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
      this.boostGain.connect(this.engineBus);
      source.start();
    }

    createMusic() {
      const c = this.ctx;
      this.musicGain = c.createGain();
      this.musicGain.gain.value = 0.16 * this.volumes.music;
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
      this.musicGain.gain.setTargetAtTime(this.muted ? 0 : 0.16 * this.volumes.music, this.ctx.currentTime, 0.2);
    }

    setVolumes(volumes) {
      this.volumes = { ...this.volumes, ...volumes };
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.72 * this.volumes.master, t, 0.05);
      this.musicGain.gain.setTargetAtTime(this.muted ? 0 : 0.16 * this.volumes.music, t, 0.08);
      this.engineBus.gain.setTargetAtTime(this.volumes.engine, t, 0.08);
    }

    setMuted(muted) {
      this.muted = muted;
      storage.set('nightshift.muted', muted ? '1' : '0');
      if (this.ctx) {
        this.master.gain.setTargetAtTime(muted ? 0 : 0.72 * this.volumes.master, this.ctx.currentTime, 0.08);
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

      this.musicGain.gain.setTargetAtTime(this.muted ? 0 : 0.16 * this.volumes.music, c.currentTime, 0.2);
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
    const key = `${primary}|${accent}|${dark}|${options.player ? 'p' : 'a'}|${options.variant || 'std'}`;
    const variant = options.variant || 'vanta';
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
      const spoilerW = variant === 'kaze' ? 218 : variant === 'nova' ? 306 : 264;
      const spoilerX = 240 - spoilerW / 2;
      g.fillStyle = '#08060d';
      roundRect(g, spoilerX, 136, spoilerW, 18, 8);
      g.fill();
      g.fillStyle = accent;
      g.globalAlpha = 0.8;
      roundRect(g, spoilerX + 12, 140, spoilerW - 24, 4, 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#08060d';
      if (variant === 'nova') {
        g.beginPath();
        g.moveTo(226, 136);
        g.lineTo(246, 55);
        g.lineTo(260, 55);
        g.lineTo(256, 136);
        g.closePath();
        g.fill();
        g.fillStyle = accent;
        g.globalAlpha = 0.55;
        g.fillRect(248, 62, 3, 69);
        g.globalAlpha = 1;
      } else if (variant === 'kaze') {
        g.fillRect(146, 151, 11, 31);
        g.fillRect(323, 151, 11, 31);
      } else {
        g.fillRect(139, 151, 13, 36);
        g.fillRect(328, 151, 13, 36);
      }

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

  function makeRockSprite(accent = '#ff6c5c') {
    return makeCanvas(360, 560, (g) => {
      g.translate(180, 540);
      const shadow = g.createRadialGradient(0, 0, 4, 0, 0, 115);
      shadow.addColorStop(0, 'rgba(0,0,0,0.55)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = shadow;
      g.beginPath();
      g.ellipse(0, -2, 118, 17, 0, 0, Math.PI * 2);
      g.fill();

      const grad = g.createLinearGradient(-60, -430, 70, 10);
      grad.addColorStop(0, '#35151a');
      grad.addColorStop(0.5, '#200b10');
      grad.addColorStop(1, '#0d0407');
      g.beginPath();
      g.moveTo(-96, 0);
      g.lineTo(-72, -112);
      g.lineTo(-108, -190);
      g.lineTo(-37, -302);
      g.lineTo(-7, -438);
      g.lineTo(43, -342);
      g.lineTo(88, -246);
      g.lineTo(62, -146);
      g.lineTo(103, -52);
      g.lineTo(84, 0);
      g.closePath();
      g.fillStyle = grad;
      g.fill();

      g.strokeStyle = accent;
      g.globalAlpha = 0.56;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-96, -5);
      g.lineTo(-72, -112);
      g.lineTo(-108, -190);
      g.lineTo(-37, -302);
      g.lineTo(-7, -438);
      g.lineTo(43, -342);
      g.lineTo(88, -246);
      g.lineTo(62, -146);
      g.lineTo(103, -52);
      g.stroke();
      g.globalAlpha = 1;

      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(-37, -302); g.lineTo(43, -342); g.lineTo(62, -146); g.stroke();
      g.beginPath(); g.moveTo(-72, -112); g.lineTo(62, -146); g.stroke();
    });
  }

  function makeCactusSprite(accent = '#ffb15e') {
    return makeCanvas(260, 570, (g) => {
      g.translate(130, 550);
      g.lineCap = 'round';
      const grad = g.createLinearGradient(-40, -420, 50, 0);
      grad.addColorStop(0, '#12322a');
      grad.addColorStop(0.6, '#0a1d19');
      grad.addColorStop(1, '#040b09');

      g.strokeStyle = grad;
      g.lineWidth = 38;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -365);
      g.stroke();

      g.lineWidth = 27;
      g.beginPath();
      g.moveTo(0, -230);
      g.lineTo(-57, -230);
      g.lineTo(-57, -312);
      g.stroke();
      g.beginPath();
      g.moveTo(0, -160);
      g.lineTo(52, -160);
      g.lineTo(52, -256);
      g.stroke();

      g.strokeStyle = accent;
      g.globalAlpha = 0.52;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(-17, -8); g.lineTo(-17, -355); g.stroke();
      g.beginPath(); g.moveTo(-7, -230); g.lineTo(-57, -230); g.lineTo(-57, -312); g.stroke();
      g.beginPath(); g.moveTo(7, -160); g.lineTo(52, -160); g.lineTo(52, -256); g.stroke();
      g.globalAlpha = 0.2;
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(8, -15); g.lineTo(8, -350); g.stroke();
      g.globalAlpha = 1;

      // spines as tiny glints
      g.fillStyle = accent;
      g.globalAlpha = 0.35;
      for (let i = 0; i < 26; i++) {
        const y = -20 - i * 13.4;
        const side = i % 2 ? -1 : 1;
        g.beginPath();
        g.arc(side * (13 + (i % 3) * 3), y, 1.2, 0, Math.PI * 2);
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
    rockWarm: makeRockSprite('#ff6c5c'),
    cactusWarm: makeCactusSprite('#ffb15e'),
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

  const cars = {};
  const carSprites = {};
  CAR_DEFS.forEach((def) => {
    const sprite = makeCarSprite(def.color, def.accent, def.dark, { player: true, variant: def.id });
    carSprites[def.id] = sprite;
  });
  cars.player = carSprites.vanta;

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

  function makeSunSprite(theme = currentTheme) {
    return makeCanvas(760, 760, (g) => {
      const cx = 380;
      const cy = 380;
      const r = 235;
      const sunColors = theme.sun;
      // Halo
      const halo = g.createRadialGradient(cx, cy, r * 0.25, cx, cy, 375);
      halo.addColorStop(0, withAlpha(sunColors[3], 0.38));
      halo.addColorStop(0.45, withAlpha(theme.accent, 0.13));
      halo.addColorStop(1, withAlpha(theme.accent, 0));
      g.fillStyle = halo;
      g.fillRect(0, 0, 760, 760);

      g.save();
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.clip();
      const sun = g.createLinearGradient(0, cy - r, 0, cy + r);
      sun.addColorStop(0, sunColors[0]);
      sun.addColorStop(0.3, sunColors[1]);
      sun.addColorStop(0.57, sunColors[2]);
      sun.addColorStop(0.78, sunColors[3]);
      sun.addColorStop(1, sunColors[4]);
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

  function makeCityLayer(theme = currentTheme) {
    const width = Math.ceil(W * 2);
    const height = Math.ceil(H * 0.115 * (1 + (theme.cityDensity - 1) * 0.25));
    const rand = mulberry32(77821);
    const cityCanvas = makeCanvas(width, height, (g) => {
      g.clearRect(0, 0, width, height);
      let x = 0;
      while (x < width) {
        const bw = 10 + rand() * 28;
        const bh = height * (0.16 + rand() * 0.72);
        const by = height - bh;
        g.fillStyle = rand() > 0.6 ? theme.far.top : theme.near.top;
        g.fillRect(x, by, bw, bh);
        if (rand() > 0.75) {
          g.fillStyle = theme.near.top;
          g.fillRect(x + bw * 0.35, by - height * 0.11, bw * 0.3, height * 0.12);
          g.fillStyle = theme.accent;
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
                g.fillStyle = rand() > 0.55 ? theme.cityCool : theme.cityWarm;
                g.fillRect(x + 3 + cx * 7, by + 4 + cy * 10, 2, 2);
              }
            }
          }
        }
        x += bw + 2 + rand() * 5;
      }
      const glow = g.createLinearGradient(0, height * 0.6, 0, height);
      glow.addColorStop(0, withAlpha(theme.accent, 0));
      glow.addColorStop(1, withAlpha(theme.accent, 0.12));
      g.fillStyle = glow;
      g.fillRect(0, 0, width, height);
    }, 1);
    return { canvas: cityCanvas, width, height };
  }

  function buildBackdrop() {
    const theme = currentTheme;
    backdrop = {
      sun: makeSunSprite(theme),
      far: makeMountainLayer(19371, theme.far.top, theme.far.bottom, theme.far.rim, 0.185, 2),
      near: makeMountainLayer(88201, theme.near.top, theme.near.bottom, theme.near.rim, 0.125, 3),
      city: theme.city ? makeCityLayer(theme) : null,
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
    const theme = currentTheme;
    const skyStops = [0, 0.28, 0.51, 0.7, 0.86, 0.96, 1];
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + 4);
    theme.sky.forEach((color, i) => sky.addColorStop(skyStops[i], color));
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
    const sunSize = theme.id === 'crimson' ? 0.26 : theme.id === 'skyline' ? 0.205 : 0.235;
    const sunRadius = Math.min(W, H) * sunSize;
    const sunX = W * 0.5 - player.x * W * 0.028 + currentCurve * 3;
    const sunY = horizon - H * 0.023;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.94;
    ctx.drawImage(backdrop.sun, sunX - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius * 2);
    ctx.restore();

    // Horizon haze
    const haze = ctx.createLinearGradient(0, horizon - H * 0.16, 0, horizon + H * 0.1);
    haze.addColorStop(0, theme.haze[0]);
    haze.addColorStop(0.62, theme.haze[1]);
    haze.addColorStop(1, theme.haze[2]);
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - H * 0.16, W, H * 0.27);

    // Mountain + city parallax
    const farX = -W * 0.3 - player.x * W * 0.026;
    drawTiled(backdrop.far, farX, horizon - backdrop.far.height + 2);
    if (backdrop.city) {
      drawTiled(backdrop.city, -W * 0.25 - player.x * W * 0.04, horizon - backdrop.city.height + 7);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.36;
      const cityGlow = ctx.createLinearGradient(0, horizon - 60, 0, horizon + 30);
      cityGlow.addColorStop(0, withAlpha(theme.accent, 0));
      cityGlow.addColorStop(0.72, withAlpha(theme.accent2, 0.22));
      cityGlow.addColorStop(1, withAlpha(theme.accent2, 0));
      ctx.fillStyle = cityGlow;
      ctx.fillRect(0, horizon - 60, W, 90);
      ctx.restore();
    }

    drawTiled(backdrop.near, -W * 0.55 - player.x * W * 0.075, horizon - backdrop.near.height + 15);

    // Ground behind road
    const ground = ctx.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, theme.ground[0]);
    ground.addColorStop(0.22, theme.ground[1]);
    ground.addColorStop(1, theme.ground[2]);
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, W, H - horizon);

    // Neon horizon line
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const line = ctx.createLinearGradient(0, 0, W, 0);
    line.addColorStop(0, withAlpha(theme.accent, 0));
    line.addColorStop(0.2, withAlpha(theme.accent, 0.3));
    line.addColorStop(0.5, 'rgba(255,220,240,0.55)');
    line.addColorStop(0.8, withAlpha(theme.accent2, 0.25));
    line.addColorStop(1, withAlpha(theme.accent2, 0));
    ctx.fillStyle = line;
    ctx.fillRect(0, horizon - 1.5, W, 2.5);
    ctx.restore();
  }

  /* --------------------------------- Track ---------------------------------- */

  const track = [];

  function sampleLoopKeys(keys, t) {
    const tt = mod(t, 1);
    for (let i = 1; i < keys.length; i++) {
      if (tt <= keys[i][0] || i === keys.length - 1) {
        const a = keys[i - 1];
        const b = keys[i];
        const raw = (tt - a[0]) / Math.max(0.0001, b[0] - a[0]);
        const f = clamp(raw, 0, 1);
        const smooth = f * f * (3 - 2 * f);
        return lerp(a[1], b[1], smooth);
      }
    }
    return keys[0][1];
  }

  function buildTrack(def) {
    const trackDef = def || TRACK_BY_ID[selectedTrackId] || TRACK_DEFS[0];
    const theme = THEMES[trackDef.theme] || THEMES.midnight;
    rebuildFogPalette(theme);
    TRACK_SEGMENTS = trackDef.segments;
    TRACK_LENGTH = SEGMENT_LENGTH * TRACK_SEGMENTS;
    track.length = 0;
    const N = TRACK_SEGMENTS;

    const yAt = (i) => sampleLoopKeys(trackDef.heightKeys, i / N);
    const curveAt = (i) => sampleLoopKeys(trackDef.curveKeys, i / N);

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

    const decor = theme.decor;
    for (let i = 4; i < N; i += 1) {
      const lampEvery = decor === 'city' ? 20 : decor === 'desert' ? 30 : 26;
      const palmEvery = decor === 'city' ? 40 : 26;

      if (i % palmEvery === 0) {
        const side = (Math.floor(i / palmEvery) % 2 === 0) ? -1 : 1;
        const cyan = i % (palmEvery * 2) === 0;
        if (decor === 'desert') {
          track[i].decorations.push({
            kind: 'cactus',
            offset: side * (1.48 + (i % 3) * 0.12),
            width: 760,
            image: cyan ? sprites.cactusWarm : sprites.rockWarm,
          });
        } else if (decor === 'city') {
          if (i % 80 === 0) {
            track[i].decorations.push({
              kind: 'palm',
              offset: side * 1.52,
              width: 880,
              image: cyan ? sprites.palmCyan : sprites.palmPink,
            });
          }
        } else {
          track[i].decorations.push({
            kind: 'palm',
            offset: side * 1.43,
            width: 980,
            image: cyan ? sprites.palmCyan : sprites.palmPink,
          });
        }
      }

      if (i % lampEvery === (lampEvery === 20 ? 8 : 13)) {
        const side = (Math.floor(i / lampEvery) % 2 === 0) ? 1 : -1;
        track[i].decorations.push({
          kind: 'lamp',
          offset: side * 1.09,
          width: 560,
          image: (i % (lampEvery * 2) === 13) ? sprites.lampPink : sprites.lampCyan,
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

  function applyTrack(trackId, rebuildScene = true) {
    const def = TRACK_BY_ID[trackId] || TRACK_DEFS[0];
    selectedTrackId = def.id;
    profile.lastTrack = def.id;
    currentTheme = THEMES[def.theme] || THEMES.midnight;
    buildTrack(def);
    if (rebuildScene) buildBackdrop();
    buildMinimapPath();
    saveProfile();
  }

  /* ------------------------------- Game state ------------------------------- */

  const AI_DEFS = [
    { name: 'NOVA', color: '#ff3d9e', accent: '#ff9fd5', dark: '#6c1245', start: 2700, base: 12350, lane: -0.58 },
    { name: 'KAI', color: '#35d9ff', accent: '#b8f7ff', dark: '#145c7a', start: 3180, base: 12250, lane: 0.22 },
    { name: 'RUSH', color: '#ffb23e', accent: '#ffe3a8', dark: '#8a4a0e', start: 4100, base: 12600, lane: 0.62 },
    { name: 'VEGA', color: '#9f6bff', accent: '#ddc8ff', dark: '#42217d', start: 2280, base: 12100, lane: -0.18 },
    { name: 'ECHO', color: '#52ffb8', accent: '#d0ffe9', dark: '#126b4b', start: 3640, base: 12450, lane: 0.36 },
  ];

  AI_DEFS.forEach((def) => {
    const sprite = makeCarSprite(def.color, def.accent, def.dark, {});
    cars[def.name] = sprite;
  });

  const player = {
    name: 'YOU',
    isPlayer: true,
    carId: 'vanta',
    maxSpeed: 13400,
    nitroSpeed: 16800,
    accel: 8600,
    grip: 1,
    steerRate: 1,
    nitroDrain: 24,
    nitroRegen: 5.4,
    progress: 0,
    speed: 0,
    x: 0,
    lane: 0,
    lateralVel: 0,
    drift: 0,
    slipstream: 0,
    wallCooldown: 0,
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
    totalLaps: 3,
    trackId: 'midnight',
    eventId: null,
    aiSkill: 1,
    sectorIndex: 0,
    sectorStart: 0,
    sectorTimes: [0, 0, 0],
    preferredSectors: [0, 0, 0],
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
    ghost: null,
    ghostTimer: 0,
    ghostSamples: [],
    lastGhostSample: -1,
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
    steerAxis: 0,
    throttleAxis: 0,
    brakeAxis: 0,
    gamepadNitro: false,
  };

  /* ---------------------------------- UI ----------------------------------- */

  const ui = {
    hud: $('hud'),
    menu: $('menu'),
    setup: $('setupScreen'),
    career: $('careerScreen'),
    profileScreen: $('profileScreen'),
    settings: $('settingsScreen'),
    pause: $('pauseScreen'),
    results: $('results'),
    countdown: $('countdown'),
    countdownNum: $('countdownNum'),
    countdownSub: $('countdownSub'),
    startLights: $('startLights'),
    toast: $('raceToast'),
    lapValue: $('lapValue'),
    lapTotal: $('lapTotal'),
    posValue: $('posValue'),
    raceTime: $('raceTime'),
    lapTime: $('lapTime'),
    modeLabel: $('modeLabel'),
    eventLabel: $('eventLabel'),
    speedValue: $('speedValue'),
    gearValue: $('gearValue'),
    dialArc: $('dialArc'),
    nitroFill: $('nitroFill'),
    nitroValue: $('nitroValue'),
    bestLapHud: $('bestLapHud'),
    bestLapMenu: $('bestLapMenu'),
    lbRows: $('lbRows'),
    speedCluster: document.querySelector('.speed-cluster'),
    slipstreamBadge: $('slipstreamBadge'),
    sector1: $('sector1'),
    sector2: $('sector2'),
    sector3: $('sector3'),
    deltaValue: $('deltaValue'),
    ghostDelta: $('ghostDelta'),
    minimap: $('minimap'),
    mapTrackName: $('mapTrackName'),
    profileCoins: $('profileCoins'),
    profileWins: $('profileWins'),
    careerLoadout: $('careerLoadout'),
    menuTrackName: $('menuTrackName'),
    menuCarName: $('menuCarName'),
    setupCoins: $('setupCoins'),
    careerCoins: $('careerCoins'),
    trackGrid: $('trackGrid'),
    carGrid: $('carGrid'),
    upgradeList: $('upgradeList'),
    setupSummary: $('setupSummary'),
    setupSub: $('setupSub'),
    setupStartBtn: $('setupStartBtn'),
    careerSummary: $('careerSummary'),
    careerList: $('careerList'),
    profileSummary: $('profileSummary'),
    profileTabs: $('profileTabs'),
    profileContent: $('profileContent'),
    profileCoinsLarge: $('profileCoinsLarge'),
    resultRank: $('resultRank'),
    resultTitle: $('resultTitle'),
    resultSub: $('resultSub'),
    resultTime: $('resultTime'),
    resultBestLap: $('resultBestLap'),
    resultTopSpeed: $('resultTopSpeed'),
    resultExtra: $('resultExtra'),
    resultBars: $('resultBars'),
    soundBtn: $('soundBtn'),
    touchControls: $('touchControls'),
    setDifficulty: $('setDifficulty'),
    setAssist: $('setAssist'),
    setCamera: $('setCamera'),
    setAutoThrottle: $('setAutoThrottle'),
    setGhost: $('setGhost'),
    setMaster: $('setMaster'),
    setMusic: $('setMusic'),
    setEngine: $('setEngine'),
  };
  const miniCtx = ui.minimap ? ui.minimap.getContext('2d') : null;
  const startLightEls = ui.startLights ? Array.from(ui.startLights.children) : [];

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

  function setStartLights(stage, isGo = false) {
    startLightEls.forEach((el, i) => {
      el.classList.toggle('go', isGo);
      el.classList.toggle('on', !isGo && stage >= 0 && i <= stage);
    });
  }

  function setCountdown(text, sub = 'HOLD THE LINE', isGo = false, stage = null) {
    ui.countdown.classList.remove('is-hidden');
    ui.countdownNum.textContent = text;
    ui.countdownSub.textContent = sub;
    ui.countdownNum.classList.toggle('go', isGo);
    ui.countdownNum.classList.remove('pop');
    void ui.countdownNum.offsetWidth;
    ui.countdownNum.classList.add('pop');
    if (stage !== null) setStartLights(stage, isGo);
  }

  function hideCountdown() {
    ui.countdown.classList.add('is-hidden');
  }

  function showToast(text, duration = 1700, overlay = false) {
    ui.toast.textContent = text;
    ui.toast.classList.toggle('overlay-toast', overlay);
    ui.toast.classList.add('show');
    clearTimeout(race.toastTimer);
    race.toastTimer = setTimeout(() => {
      ui.toast.classList.remove('show');
      ui.toast.classList.remove('overlay-toast');
    }, duration);
  }

  function updateSoundButton() {
    ui.soundBtn.classList.toggle('muted', audio.muted);
    ui.soundBtn.setAttribute('aria-label', audio.muted ? '开启声音' : '关闭声音');
  }

  const carPreviewUrls = new Map();

  function carPreviewUrl(car) {
    if (!carPreviewUrls.has(car.id)) {
      const sprite = carSprites[car.id];
      carPreviewUrls.set(car.id, sprite ? sprite.toDataURL('image/png') : '');
    }
    return carPreviewUrls.get(car.id);
  }

  function carDefForRace() {
    return effectiveCar(CAR_BY_ID[selectedCarId] || CAR_BY_ID.vanta);
  }

  function eventCompleted(event) {
    const state = profile.events[event.id];
    return !!state && state.bestRank > 0 && state.bestRank <= event.target;
  }

  function eventUnlocked(index) {
    if (index === 0) return true;
    return eventCompleted(CAREER_EVENTS[index - 1]);
  }

  function medalForRank(rank) {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return '';
  }

  function updateProfileUI() {
    ui.profileCoins.textContent = String(profile.coins);
    ui.profileWins.textContent = String(profile.wins);
    ui.setupCoins.textContent = String(profile.coins);
    ui.careerCoins.textContent = String(profile.coins);
    if (ui.profileCoinsLarge) ui.profileCoinsLarge.textContent = String(profile.coins);
    const track = TRACK_BY_ID[selectedTrackId] || TRACK_DEFS[0];
    const car = carDefForRace();
    ui.menuTrackName.textContent = track.cn;
    ui.menuCarName.textContent = car.name;
    const record = getTrackRecord(selectedTrackId);
    ui.bestLapMenu.textContent = record.bestLap ? formatTime(record.bestLap) : '--:--.---';
    ui.mapTrackName.textContent = track.name;
  }

  function renderSetup() {
    if (!ui.trackGrid || !ui.carGrid) return;
    ui.setupCoins.textContent = String(profile.coins);
    ui.trackGrid.innerHTML = TRACK_DEFS.map((track) => {
      const theme = THEMES[track.theme];
      const record = getTrackRecord(track.id);
      const best = record.bestTime ? formatTime(record.bestTime) : '--:--.---';
      const km = ((track.segments * SEGMENT_LENGTH) / 100000).toFixed(1);
      return `<button class="track-card ${track.id === selectedTrackId ? 'selected' : ''}" type="button" data-track="${track.id}"
        style="--ta:${theme.accent};--tb:${withAlpha(theme.accent, 0.28)};--tc:${withAlpha(theme.accent, 0.24)}">
        <div class="track-top"><span>${track.sector}</span><em>${track.difficulty}</em></div>
        <div class="track-check">✓</div>
        <div class="track-name"><span>${track.cn}</span><b>${track.name}</b></div>
        <div class="track-meta"><span>${km} KM</span><i>/</i><span>${track.laps} LAPS</span><i>/</i><span>BEST ${best}</span></div>
      </button>`;
    }).join('');

    ui.carGrid.innerHTML = CAR_DEFS.map((car) => {
      const locked = !isCarUnlocked(car.id);
      const selected = car.id === selectedCarId;
      const tuned = effectiveCar(car);
      const levels = upgradeLevels(car.id);
      const totalLevel = UPGRADE_DEFS.reduce((sum, def) => sum + (levels[def.id] || 0), 0);
      const bars = [
        ['SPD', tuned.bars.speed],
        ['ACC', tuned.bars.accel],
        ['GRP', tuned.bars.grip],
        ['N2O', tuned.bars.nitro],
      ].map(([label, value]) => `<span class="car-bar">${label}<i style="--v:${value}%"></i></span>`).join('');
      return `<div class="car-card ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}" data-car="${car.id}" role="button" tabindex="${locked ? -1 : 0}" style="--cc:${car.accent}">
        <div class="car-art"><img src="${carPreviewUrl(car)}" alt="${car.name}"></div>
        <div class="car-info">
          <span>${locked ? 'LOCKED' : car.tag}</span>
          <b>${car.name}</b>
          <span class="car-tag">${car.tag}${totalLevel ? ` · TUNED +${totalLevel}` : ''}</span>
          <div class="car-bars">${bars}</div>
        </div>
        ${selected && !locked ? '<div class="car-check">✓</div>' : ''}
        ${locked ? `<div class="car-lock"><span>锁 · ${car.cost} CR</span><button type="button" data-buy="${car.id}" ${profile.coins < car.cost ? 'disabled' : ''}>解锁</button></div>` : ''}
      </div>`;
    }).join('');

    renderUpgrades();

    const track = TRACK_BY_ID[selectedTrackId] || TRACK_DEFS[0];
    const car = carDefForRace();
    const difficulty = DIFFICULTY[getSettings().difficulty] || DIFFICULTY.standard;
    ui.setupSummary.textContent = `${track.name} · ${car.name}`;
    ui.setupSub.textContent = `${track.laps} LAPS · 5 RIVALS · ${difficulty.label}`;
    updateProfileUI();
  }

  function renderUpgrades() {
    if (!ui.upgradeList) return;
    const levels = upgradeLevels(selectedCarId);
    const car = carDefForRace();
    const total = UPGRADE_DEFS.reduce((sum, def) => sum + (levels[def.id] || 0), 0);
    const header = `<div class="upgrade-head"><span>当前赛车</span><b>${car.name}</b><em>总改装 +${total}</em><small>${profile.coins} CR</small></div>`;
    const rows = UPGRADE_DEFS.map((def) => {
      const level = clamp(levels[def.id] || 0, 0, def.max);
      const maxed = level >= def.max;
      const cost = maxed ? 0 : def.costs[level];
      const pips = Array.from({ length: def.max }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      return `<div class="upgrade-row" style="--uc:${car.accent}">
        <div class="upgrade-name"><span>${def.code}</span><b>${def.name}</b><small>${def.desc}</small></div>
        <div class="upgrade-level"><span class="upgrade-pips">${pips}</span><small>LV ${level} / ${def.max}</small></div>
        <button type="button" data-upgrade="${def.id}" ${maxed || profile.coins < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `升级 · ${cost} CR`}</button>
      </div>`;
    }).join('');
    ui.upgradeList.innerHTML = header + rows;
  }

  function buyUpgrade(statId) {
    const def = UPGRADE_DEFS.find((d) => d.id === statId);
    if (!def) return;
    const levels = upgradeLevels(selectedCarId);
    const level = clamp(levels[statId] || 0, 0, def.max);
    if (level >= def.max) return;
    const cost = def.costs[level];
    if (profile.coins < cost) return;
    profile.coins -= cost;
    levels[statId] = level + 1;
    saveProfile();
    applyCarSelection(selectedCarId);
    updateProfileUI();
  }

  function renderCareer() {
    if (!ui.careerList) return;
    ui.careerCoins.textContent = String(profile.coins);
    const completed = CAREER_EVENTS.filter((e) => eventCompleted(e)).length;
    ui.careerSummary.innerHTML = `
      <div class="career-stat"><span>CREDITS</span><b>${profile.coins}</b></div>
      <div class="career-stat"><span>WINS</span><b>${profile.wins}</b></div>
      <div class="career-stat"><span>PODIUMS</span><b>${profile.podiums}</b></div>
      <div class="career-stat"><span>EVENTS</span><b>${completed} / ${CAREER_EVENTS.length}</b></div>`;
    const activeCar = carDefForRace();
    ui.careerLoadout.innerHTML = `<span>当前赛车</span><b>${activeCar.name}</b><i></i><span>可在快速比赛设置中更换</span>`;

    ui.careerList.innerHTML = CAREER_EVENTS.map((event, index) => {
      const unlocked = eventUnlocked(index);
      const state = profile.events[event.id] || {};
      const rank = state.bestRank || 0;
      const done = eventCompleted(event);
      const medal = medalForRank(rank);
      const previous = index > 0 ? CAREER_EVENTS[index - 1] : null;
      const objective = `TOP ${event.target} · ${event.reward} CR`;
      const status = done
        ? `已完成 · 最佳 P${rank}`
        : unlocked
          ? (rank ? `最佳 P${rank} · ${objective}` : `等待发车 · ${objective}`)
          : `完成「${previous ? previous.name : ''}」解锁 · ${objective}`;
      return `<div class="career-event ${unlocked ? 'available' : 'locked'}" style="--ec:${event.color}">
        <div class="event-index">0${index + 1}</div>
        <div class="event-main">
          <span>${TRACK_BY_ID[event.track].name} · ${event.laps} LAPS</span>
          <b>${event.name}</b>
          <small>${event.cn} · ${event.desc}</small>
        </div>
        <div class="event-rule">目标 <b>TOP ${event.target}</b><br>${DIFFICULTY[event.difficulty].label} · 奖励 <b>${event.reward} CR</b></div>
        <div class="event-medal">
          <i class="${medal}">★</i>
          <i class="${done ? 'gold' : ''}">${done ? '✓' : '—'}</i>
        </div>
        <div class="event-action">
          <button type="button" data-event="${event.id}" ${unlocked ? '' : 'disabled'}>${done ? '重跑' : unlocked ? '开始' : '锁定'}</button>
          <span class="event-status">${status}</span>
        </div>
      </div>`;
    }).join('');
    updateProfileUI();
  }

  function renderProfile() {
    if (!ui.profileContent) return;
    ensureDaily();
    updateProfileUI();
    ui.profileCoinsLarge.textContent = String(profile.coins);
    const completedEvents = CAREER_EVENTS.filter((e) => eventCompleted(e)).length;
    const unlockedAchievements = Object.keys(profile.achievements).length;
    ui.profileSummary.innerHTML = `
      <div class="profile-stat"><span>RACES</span><b>${profile.races}</b></div>
      <div class="profile-stat"><span>WINS</span><b>${profile.wins}</b></div>
      <div class="profile-stat"><span>PODIUMS</span><b>${profile.podiums}</b></div>
      <div class="profile-stat"><span>CARS</span><b>${profile.cars.length}<small>/3</small></b></div>
      <div class="profile-stat"><span>EVENTS</span><b>${completedEvents}<small>/5</small></b></div>
      <div class="profile-stat"><span>CLEAN LAPS</span><b>${profile.stats.cleanLaps}</b></div>
      <div class="profile-stat"><span>TOP SPEED</span><b>${Math.round(profile.stats.topSpeed)}<small>KM/H</small></b></div>
      <div class="profile-stat"><span>DRIFT TIME</span><b>${Math.floor(profile.stats.driftTime)}<small>SEC</small></b></div>`;

    [...ui.profileTabs.children].forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-profile-tab') === profileTab);
    });

    if (profileTab === 'daily') {
      const daily = ensureDaily();
      const cards = daily.ids.map((id) => {
        const challenge = dailyChallengeById(id);
        if (!challenge) return '';
        const value = Math.min(challenge.target, daily.progress[challenge.metric] || 0);
        const claimed = daily.claimed.includes(id);
        const pct = clamp((value / challenge.target) * 100, 0, 100);
        return `<div class="daily-card ${claimed ? 'done' : ''}" style="--dc:${claimed ? '#52ffb8' : currentTheme.accent}">
          <div class="daily-icon">${challenge.icon}</div>
          <div class="daily-main">
            <span>DAILY · ${challenge.reward} CR</span>
            <b>${challenge.name}</b>
            <div class="progress-track"><i style="width:${pct.toFixed(1)}%"></i></div>
          </div>
          <div class="daily-state"><b>${claimed ? '✓' : `${value}/${challenge.target}`}</b><small>${claimed ? '已领取' : '进行中'}</small></div>
        </div>`;
      }).join('');
      ui.profileContent.innerHTML = `
        <div class="profile-section-head"><div><span>DAILY CHALLENGES</span><h3>今日挑战</h3></div><p>${daily.date} · 每日 00:00 刷新</p></div>
        <div class="daily-list">${cards}</div>
        <div class="profile-note">完成挑战后奖励会自动发放到 CR 余额。</div>`;
    } else if (profileTab === 'achievements') {
      const items = ACHIEVEMENTS.map((ach) => {
        const unlocked = !!profile.achievements[ach.id];
        const value = Math.min(ach.target, achievementValue(ach.metric));
        const pct = clamp((value / ach.target) * 100, 0, 100);
        return `<div class="achievement-card ${unlocked ? 'unlocked' : ''}">
          <div class="achievement-icon">${unlocked ? '✓' : ach.icon}</div>
          <div class="achievement-main">
            <span>${ach.name}</span>
            <b>${ach.cn}</b>
            <small>${ach.desc}</small>
            <div class="progress-track"><i style="width:${pct.toFixed(1)}%"></i></div>
          </div>
          <div class="achievement-reward"><b>+${ach.reward}</b><small>CR</small><em>${unlocked ? '已解锁' : `${value}/${ach.target}`}</em></div>
        </div>`;
      }).join('');
      ui.profileContent.innerHTML = `
        <div class="profile-section-head"><div><span>ACHIEVEMENTS</span><h3>成就</h3></div><p>${unlockedAchievements} / ${ACHIEVEMENTS.length} 已解锁</p></div>
        <div class="achievement-list">${items}</div>`;
    } else {
      const blocks = TRACK_DEFS.map((track) => {
        const record = getTrackRecord(track.id);
        const list = profile.leaderboards[track.id] || [];
        const rows = list.length
          ? list.map((entry, i) => `<div class="record-row">
              <span>${i + 1}</span>
              <b>${formatTime(entry.time)}</b>
              <em>${entry.carName || 'UNKNOWN'}</em>
              <small>P${entry.rank || '-'}</small>
            </div>`).join('')
          : '<div class="record-empty">暂无完赛记录</div>';
        return `<div class="record-block" style="--rc:${THEMES[track.theme].accent}">
          <div class="record-head"><div><span>${track.sector}</span><b>${track.name}</b></div><em>BEST ${record.bestTime ? formatTime(record.bestTime) : '--:--.---'}</em></div>
          <div class="record-list">${rows}</div>
        </div>`;
      }).join('');
      ui.profileContent.innerHTML = `
        <div class="profile-section-head"><div><span>TRACK RECORDS</span><h3>本地 Top 5</h3></div><p>你的每一条赛道纪录</p></div>
        <div class="record-grid">${blocks}</div>`;
    }
  }

  function openProfile(tab = profileTab) {
    profileTab = tab;
    setScreen(ui.menu, false);
    setScreen(ui.setup, false);
    setScreen(ui.career, false);
    setScreen(ui.results, false);
    setScreen(ui.profileScreen, true);
    showRaceHud(false);
    renderProfile();
  }

  function closeProfile() {
    setScreen(ui.profileScreen, false);
    setScreen(ui.menu, true);
    updateProfileUI();
  }

  function renderSettings() {
    const s = getSettings();
    ui.setDifficulty.value = s.difficulty;
    ui.setAssist.value = s.assist;
    ui.setCamera.value = s.camera;
    ui.setAutoThrottle.checked = !!s.autoThrottle;
    ui.setGhost.checked = !!s.ghost;
    ui.setMaster.value = Math.round((s.masterVolume ?? 0.8) * 100);
    ui.setMusic.value = Math.round((s.musicVolume ?? 0.65) * 100);
    ui.setEngine.value = Math.round((s.engineVolume ?? 0.85) * 100);
  }

  function applySettingsFromUI() {
    const s = {
      ...getSettings(),
      difficulty: ui.setDifficulty.value,
      assist: ui.setAssist.value,
      camera: ui.setCamera.value,
      autoThrottle: ui.setAutoThrottle.checked,
      ghost: ui.setGhost.checked,
      masterVolume: Number(ui.setMaster.value) / 100,
      musicVolume: Number(ui.setMusic.value) / 100,
      engineVolume: Number(ui.setEngine.value) / 100,
    };
    profile.settings = s;
    applyCameraSetting();
    audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, engine: s.engineVolume });
    if (race.ghost) race.ghost.visible = !!s.ghost;
    saveProfile();
    if (race.mode === 'menu') updateProfileUI();
  }

  function resetSettings() {
    profile.settings = { ...DEFAULT_SETTINGS };
    applyCameraSetting();
    audio.setVolumes({
      master: profile.settings.masterVolume,
      music: profile.settings.musicVolume,
      engine: profile.settings.engineVolume,
    });
    saveProfile();
    renderSettings();
  }

  function applyCarSelection(carId) {
    const baseCar = CAR_BY_ID[carId];
    if (!baseCar || !isCarUnlocked(carId)) return;
    const car = effectiveCar(baseCar);
    selectedCarId = carId;
    profile.lastCar = carId;
    player.carId = carId;
    player.maxSpeed = car.maxSpeed;
    player.nitroSpeed = car.nitroSpeed;
    player.accel = car.accel;
    player.grip = car.grip;
    player.steerRate = car.steer;
    player.nitroDrain = car.nitroDrain;
    player.nitroRegen = car.nitroRegen;
    cars.player = carSprites[carId];
    ui.menuCarName.textContent = car.name;
    saveProfile();
    renderSetup();
  }

  function buyCar(carId) {
    const car = CAR_BY_ID[carId];
    if (!car || isCarUnlocked(carId)) return;
    if (profile.coins < car.cost) return;
    profile.coins -= car.cost;
    profile.cars.push(carId);
    saveProfile();
    applyCarSelection(carId);
    const newAchievements = checkAchievements();
    if (newAchievements.length) {
      const total = newAchievements.reduce((sum, a) => sum + a.reward, 0);
      showToast(`成就解锁 · ${newAchievements[0].cn} +${total} CR`, 2200, true);
    }
    renderCareer();
    updateProfileUI();
  }

  function openSetup() {
    currentEvent = null;
    currentRaceMode = 'QUICK RACE';
    setScreen(ui.menu, false);
    setScreen(ui.career, false);
    setScreen(ui.profileScreen, false);
    setScreen(ui.results, false);
    setScreen(ui.setup, true);
    showRaceHud(false);
    applyTrack(selectedTrackId, true);
    renderSetup();
  }

  function closeSetup() {
    setScreen(ui.setup, false);
    setScreen(ui.menu, true);
    updateProfileUI();
  }

  function openCareer() {
    currentEvent = null;
    setScreen(ui.menu, false);
    setScreen(ui.setup, false);
    setScreen(ui.profileScreen, false);
    setScreen(ui.results, false);
    setScreen(ui.career, true);
    showRaceHud(false);
    renderCareer();
  }

  function closeCareer() {
    setScreen(ui.career, false);
    setScreen(ui.menu, true);
    updateProfileUI();
  }

  let settingsReturn = 'menu';

  function openSettings(from = 'menu') {
    settingsReturn = from;
    renderSettings();
    if (from === 'pause') setScreen(ui.pause, false);
    setScreen(ui.settings, true);
  }

  function closeSettings() {
    setScreen(ui.settings, false);
    if (settingsReturn === 'pause') {
      setScreen(ui.pause, true);
    } else if (settingsReturn === 'setup') {
      setScreen(ui.setup, true);
      renderSetup();
    } else {
      setScreen(ui.menu, true);
    }
  }

  function startQuickRace() {
    currentEvent = null;
    currentRaceMode = 'QUICK RACE';
    setScreen(ui.setup, false);
    setScreen(ui.menu, false);
    setScreen(ui.career, false);
    setScreen(ui.profileScreen, false);
    startRace();
  }

  function startCareerEvent(eventId) {
    const event = CAREER_EVENTS.find((e) => e.id === eventId);
    if (!event) return;
    const index = CAREER_EVENTS.indexOf(event);
    if (!eventUnlocked(index)) return;
    currentEvent = event;
    currentRaceMode = `CAREER · ${event.name}`;
    selectedTrackId = event.track;
    profile.lastTrack = event.track;
    applyTrack(event.track, true);
    setScreen(ui.career, false);
    setScreen(ui.setup, false);
    setScreen(ui.menu, false);
    setScreen(ui.profileScreen, false);
    startRace();
  }

  const minimapPoints = [];
  const MAP_W = 360;
  const MAP_H = 220;

  function buildMinimapPath() {
    minimapPoints.length = 0;
    const def = currentTrackDef();
    let seed = 0;
    for (let i = 0; i < def.id.length; i++) seed = (seed * 31 + def.id.charCodeAt(i)) >>> 0;
    const rand = mulberry32(seed || 1);
    const harmonics = [
      { k: 3, amp: 0.1 + rand() * 0.09, phase: rand() * Math.PI * 2 },
      { k: 5, amp: 0.045 + rand() * 0.06, phase: rand() * Math.PI * 2 },
      { k: 2, amp: 0.08 + rand() * 0.07, phase: rand() * Math.PI * 2 },
    ];
    const points = 180;
    for (let i = 0; i <= points; i++) {
      const t = i / points;
      const angle = -Math.PI * 0.5 + t * Math.PI * 2;
      let radius = 1;
      harmonics.forEach((h) => { radius += Math.sin(angle * h.k + h.phase) * h.amp; });
      const x = Math.cos(angle) * radius * 1.28;
      const y = Math.sin(angle) * radius * 0.82;
      minimapPoints.push({ x, y, p: t });
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of minimapPoints) {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    }
    const pad = 32;
    const scale = Math.min((MAP_W - pad * 2) / Math.max(0.001, maxX - minX), (MAP_H - pad * 2) / Math.max(0.001, maxY - minY));
    const offsetX = (MAP_W - (maxX - minX) * scale) / 2;
    const offsetY = (MAP_H - (maxY - minY) * scale) / 2;
    for (const pt of minimapPoints) {
      pt.x = offsetX + (pt.x - minX) * scale;
      pt.y = MAP_H - offsetY - (pt.y - minY) * scale;
    }
  }

  function minimapPoint(progress) {
    if (!minimapPoints.length) return { x: MAP_W / 2, y: MAP_H / 2 };
    const f = mod(progress, TRACK_LENGTH) / TRACK_LENGTH;
    const idx = f * (minimapPoints.length - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(minimapPoints.length - 1, i0 + 1);
    const t = idx - i0;
    return {
      x: lerp(minimapPoints[i0].x, minimapPoints[i1].x, t),
      y: lerp(minimapPoints[i0].y, minimapPoints[i1].y, t),
    };
  }

  function drawMinimap() {
    if (!miniCtx || !minimapPoints.length) return;
    const g = miniCtx;
    g.clearRect(0, 0, MAP_W, MAP_H);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    minimapPoints.forEach((pt, i) => {
      if (i === 0) g.moveTo(pt.x, pt.y);
      else g.lineTo(pt.x, pt.y);
    });
    g.closePath();
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.lineWidth = 9;
    g.stroke();
    g.strokeStyle = currentTheme.accent;
    g.globalAlpha = 0.72;
    g.lineWidth = 2;
    g.stroke();
    g.globalAlpha = 1;

    for (const frac of [1 / 3, 2 / 3]) {
      const pt = minimapPoint(TRACK_LENGTH * frac);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    }
    const start = minimapPoint(0);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(start.x - 4, start.y - 4);
    g.lineTo(start.x + 4, start.y + 4);
    g.stroke();

    if (race.ghost && race.ghost.visible) {
      const pt = minimapPoint(race.ghost.p);
      g.fillStyle = 'rgba(39,230,255,0.6)';
      g.beginPath();
      g.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      g.fill();
    }

    for (const ai of opponents) {
      const pt = minimapPoint(ai.progress);
      g.fillStyle = ai.accent;
      g.globalAlpha = ai.finished ? 0.3 : 0.85;
      g.beginPath();
      g.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    const pp = minimapPoint(player.progress);
    g.save();
    g.shadowColor = '#ffffff';
    g.shadowBlur = 10;
    g.fillStyle = currentTheme.accent2;
    g.beginPath();
    g.arc(pp.x, pp.y, 5.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(pp.x, pp.y, 2.2, 0, Math.PI * 2);
    g.fill();
    g.restore();
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
    const railLeft = [];
    const railRight = [];
    const railPosts = [];

    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const segment = track[(base.index + n) % TRACK_SEGMENTS];
      const looped = segment.index < base.index;
      segment.clip = maxY;

      project(segment.p1, player.x * ROAD_WIDTH - x, playerY + cameraHeight,
        cameraZ - (looped ? TRACK_LENGTH : 0));
      project(segment.p2, player.x * ROAD_WIDTH - x - dx, playerY + cameraHeight,
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

      // Neon barrier rails define the track limits
      if (n < 170) {
        const railH = 285;
        const leftTop1 = y1 - p1.scale * railH * H / 2;
        const leftTop2 = y2 - p2.scale * railH * H / 2;
        const leftX1 = x1 - w1 * WALL_LIMIT;
        const leftX2 = x2 - w2 * WALL_LIMIT;
        const rightX1 = x1 + w1 * WALL_LIMIT;
        const rightX2 = x2 + w2 * WALL_LIMIT;
        railLeft.push([leftX1, leftTop1, leftX2, leftTop2]);
        railRight.push([rightX1, leftTop1, rightX2, leftTop2]);
        if (segment.index % 9 === 0) {
          railPosts.push([leftX1, y1, leftTop1, rightX1, leftTop1]);
        }
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

    // Draw barrier rails in two batched strokes instead of one per segment.
    if (railLeft.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = currentTheme.accent;
      ctx.beginPath();
      for (const r of railLeft) {
        ctx.moveTo(r[0], r[1]);
        ctx.lineTo(r[2], r[3]);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = currentTheme.accent2;
      ctx.beginPath();
      for (const r of railRight) {
        ctx.moveTo(r[0], r[1]);
        ctx.lineTo(r[2], r[3]);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = 1;
      ctx.strokeStyle = currentTheme.accent2;
      ctx.beginPath();
      for (const p of railPosts) {
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0], p[2]);
        ctx.moveTo(p[3], p[1]);
        ctx.lineTo(p[3], p[4]);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Add AI cars to the scene graph
    for (const ai of opponents) {
      if (ai.finished) continue;
      const rel = ai.progress - player.progress;
      if (rel <= 1900 || rel > DRAW_DISTANCE * SEGMENT_LENGTH) continue;
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

    if (race.ghost && race.ghost.visible) {
      const rel = race.ghost.p - player.progress;
      if (rel > 1900 && rel <= DRAW_DISTANCE * SEGMENT_LENGTH) {
        const n = rel / SEGMENT_LENGTH;
        const segment = track[(base.index + Math.floor(n)) % TRACK_SEGMENTS];
        if (segment && segment.p1.camera.z > 0) {
          const pct = n - Math.floor(n);
          const sx = lerp(segment.p1.screen.x, segment.p2.screen.x, pct);
          const sy = lerp(segment.p1.screen.y, segment.p2.screen.y, pct);
          const sw = lerp(segment.p1.screen.w, segment.p2.screen.w, pct);
          const scale = lerp(segment.p1.screen.scale, segment.p2.screen.scale, pct);
          const carW = scale * 940 * W / 2;
          if (carW >= 1.5) {
            const sprite = carSprites[race.ghost.carId] || carSprites.vanta;
            sceneItems.push({
              n,
              type: 'ghost',
              x: sx + sw * race.ghost.x,
              y: sy,
              w: carW,
              h: carW * (sprite.height / sprite.width),
              clip: segment.clip,
              alpha: clamp(0.26 * (1 - n / DRAW_DISTANCE * 0.5), 0.1, 0.3),
            });
          }
        }
      }
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
      } else if (item.type === 'ghost') {
        const sprite = carSprites[race.ghost ? race.ghost.carId : 'vanta'] || carSprites.vanta;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = item.alpha * 0.65;
        const glow = ctx.createRadialGradient(item.x, item.y - item.h * 0.38, 2, item.x, item.y - item.h * 0.38, item.w * 0.52);
        glow.addColorStop(0, 'rgba(39,230,255,0.42)');
        glow.addColorStop(1, 'rgba(39,230,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(item.x - item.w * 0.8, item.y - item.h * 1.1, item.w * 1.6, item.h * 1.2);
        ctx.restore();
        drawSprite(sprite, item.x, item.y, item.w, item.h, item.alpha, item.clip);
        if (item.w > 32) {
          ctx.save();
          ctx.globalAlpha = item.alpha * 1.7;
          ctx.fillStyle = currentTheme.accent2;
          ctx.font = '700 9px "Bahnschrift", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('GHOST', item.x, item.y - item.h - 7);
          ctx.restore();
        }
      }
    }
  }

  function playerCarWidth() {
    const portrait = H > W * 1.15;
    const far = getSettings().camera === 'far';
    const factor = (portrait ? 0.31 : far ? 0.235 : 0.285);
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
    const sprite = carSprites[player.carId] || carSprites.vanta;
    const baseH = baseW * (sprite.height / sprite.width);
    const speedRatio = clamp(player.speed / (player.maxSpeed || 13400), 0, 1.3);
    const bounce = Math.sin(performance.now() * 0.022) * (1.4 + speedRatio * 2.2) + player.bump;
    const tilt = player.steerInput * 0.048 + player.lateralVel * 0.026 + player.drift * 0.025 +
      Math.sin(performance.now() * 0.007) * 0.004;
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
    ctx.drawImage(sprite, x - baseW / 2, y - baseH, baseW, baseH);
    ctx.restore();

    // Car
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.drawImage(sprite, -baseW / 2, -baseH, baseW, baseH);

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
    const ratio = clamp(player.speed / (player.maxSpeed || 13400), 0, 1.3);
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

  function currentTrackDef() {
    return TRACK_BY_ID[selectedTrackId] || TRACK_DEFS[0];
  }

  function applyCarStats(car) {
    player.carId = car.id;
    player.maxSpeed = car.maxSpeed;
    player.nitroSpeed = car.nitroSpeed;
    player.accel = car.accel;
    player.grip = car.grip;
    player.steerRate = car.steer;
    player.nitroDrain = car.nitroDrain;
    player.nitroRegen = car.nitroRegen;
    cars.player = carSprites[car.id] || carSprites.vanta;
  }

  function resetRace() {
    const car = carDefForRace();
    const trackDef = currentTrackDef();
    applyCarStats(car);
    const difficultyKey = currentEvent ? currentEvent.difficulty : getSettings().difficulty;
    const difficulty = DIFFICULTY[difficultyKey] || DIFFICULTY.standard;
    race.totalLaps = currentEvent ? currentEvent.laps : trackDef.laps;
    race.trackId = trackDef.id;
    race.eventId = currentEvent ? currentEvent.id : null;
    race.aiSkill = difficulty.ai * trackDef.aiSkill;
    const record = getTrackRecord(trackDef.id);
    race.preferredSectors = Array.isArray(record.sectors) && record.sectors.length === 3
      ? record.sectors.slice()
      : [0, 0, 0];

    player.progress = 0;
    player.speed = 0;
    player.x = 0;
    player.lane = 0;
    player.lateralVel = 0;
    player.drift = 0;
    player.slipstream = 0;
    player.wallCooldown = 0;
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

    opponents = AI_DEFS.map((def, i) => ({
      ...def,
      id: i,
      progress: def.start,
      speed: 0,
      pace: def.base / 13400,
      homeLane: def.lane,
      targetLane: def.lane,
      lane: def.lane,
      finished: false,
      finishTime: 0,
      phase: Math.random() * Math.PI * 2,
      cooldown: 0,
      avoid: 0,
      mistakeTimer: 4 + Math.random() * 7,
      mistakeTime: 0,
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
    race.position = RACER_COUNT;
    race.shake = 0;
    race.shakeX = 0;
    race.shakeY = 0;
    race.flash = 0;
    race.collisionCooldown = 0;
    race.finishShown = false;
    race.result = null;
    race.hudAccumulator = 0;
    race.lastLbUpdate = 0;
    race.sectorIndex = 0;
    race.sectorStart = 0;
    race.sectorTimes = [0, 0, 0];
    race.ghostSamples = [];
    race.lastGhostSample = -1;
    race.driftTime = 0;
    race.nitroTime = 0;
    race.cleanLaps = 0;
    race.lapClean = true;
    const ghostData = record.ghost;
    race.ghost = getSettings().ghost && ghostData && Array.isArray(ghostData.samples) && ghostData.samples.length > 1
      ? {
        visible: true,
        carId: ghostData.carId || 'vanta',
        time: ghostData.time || 0,
        samples: ghostData.samples,
        p: ghostData.samples[0].p || 0,
        x: ghostData.samples[0].x || 0,
        idx: 0,
      }
      : null;
    particles.length = 0;
    setStartLights(-1, false);

    ui.lapTotal.textContent = `/${race.totalLaps}`;
    ui.modeLabel.textContent = currentRaceMode;
    ui.eventLabel.textContent = currentEvent ? `${trackDef.name} · ${currentEvent.name}` : trackDef.name;
    ui.mapTrackName.textContent = trackDef.name;
    ui.bestLapHud.textContent = record.bestLap ? formatTime(record.bestLap) : '--:--.---';
    ui.sector1.textContent = '--.--';
    ui.sector2.textContent = '--.--';
    ui.sector3.textContent = '--.--';
    ui.deltaValue.textContent = '--.---';
    ui.deltaValue.className = '';
    if (ui.ghostDelta) {
      ui.ghostDelta.textContent = '--.---';
      ui.ghostDelta.className = '';
    }
    ui.slipstreamBadge.classList.remove('show');
    updateProfileUI();
  }

  function startRace() {
    audio.start();
    applyCameraSetting();
    audio.setVolumes({
      master: getSettings().masterVolume,
      music: getSettings().musicVolume,
      engine: getSettings().engineVolume,
    });
    resetRace();
    race.mode = 'countdown';
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    clearTimeout(race.toastTimer);
    ui.toast.classList.remove('show');
    setScreen(ui.menu, false);
    setScreen(ui.setup, false);
    setScreen(ui.career, false);
    setScreen(ui.profileScreen, false);
    setScreen(ui.settings, false);
    setScreen(ui.results, false);
    setScreen(ui.pause, false);
    showRaceHud(true);
    showTouch(true);
    ui.countdown.classList.remove('is-hidden');
    setCountdown('3', 'HOLD THE LINE', false, 1);
    race.cdStage = 0;
    audio.countdown(false);
    updateSoundButton();
    updateHud();
  }

  function goRace() {
    race.mode = 'racing';
    race.time = 0;
    race.lapStart = 0;
    race.sectorStart = 0;
    race.lap = 1;
    race.goTimer = 0.82;
    audio.start();
    audio.countdown(true);
    showTouch(true);
    setStartLights(4, true);
    const label = currentEvent ? currentEvent.name : currentTrackDef().name;
    setTimeout(() => {
      if (race.mode === 'racing' && race.time > 0.5) {
        showToast(`${label} · ${race.totalLaps} LAPS`, 1500);
      }
    }, 900);
    setTimeout(() => {
      if (race.mode === 'racing' || race.mode === 'paused') hideCountdown();
    }, 780);
  }

  function currentSegmentIndex() {
    return Math.floor(player.progress / SEGMENT_LENGTH) % TRACK_SEGMENTS;
  }

  function updateGhost() {
    const ghost = race.ghost;
    if (!ghost || !ghost.visible || !ghost.samples || ghost.samples.length < 2) return;
    const t = race.time;
    if (t > ghost.time + 0.6) {
      ghost.visible = false;
      return;
    }
    const samples = ghost.samples;
    while (ghost.idx < samples.length - 2 && samples[ghost.idx + 1].t <= t) ghost.idx += 1;
    const a = samples[ghost.idx];
    const b = samples[Math.min(samples.length - 1, ghost.idx + 1)];
    const span = Math.max(0.001, b.t - a.t);
    const f = clamp((t - a.t) / span, 0, 1);
    ghost.p = lerp(a.p, b.p, f);
    ghost.x = lerp(a.x, b.x, f);
  }

  function ghostTimeAtProgress(progress) {
    const ghost = race.ghost;
    if (!ghost || !ghost.samples || ghost.samples.length < 2) return null;
    const samples = ghost.samples;
    if (progress <= samples[0].p) return samples[0].t;
    const last = samples[samples.length - 1];
    if (progress >= last.p) return last.t;
    let lo = 0;
    let hi = samples.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].p <= progress) lo = mid;
      else hi = mid;
    }
    const a = samples[lo];
    const b = samples[hi];
    const span = Math.max(1, b.p - a.p);
    const f = clamp((progress - a.p) / span, 0, 1);
    return lerp(a.t, b.t, f);
  }

  function computeSlipstream() {
    let best = 0;
    for (const ai of opponents) {
      if (ai.finished) continue;
      const rel = ai.progress - player.progress;
      if (rel < 500 || rel > 9000) continue;
      const lateral = Math.abs(ai.lane - player.x);
      if (lateral > 0.34) continue;
      const distFactor = 1 - (rel - 500) / 8500;
      const laneFactor = 1 - lateral / 0.34;
      best = Math.max(best, distFactor * laneFactor);
    }
    return best;
  }

  function updateSectorProgress() {
    const frac = mod(player.progress, TRACK_LENGTH) / TRACK_LENGTH;
    const idx = Math.min(2, Math.floor(frac * 3));
    if (idx !== race.sectorIndex) {
      if (race.sectorStart > 0 || race.time > 0) {
        race.sectorTimes[race.sectorIndex] = race.time - race.sectorStart;
      }
      race.sectorIndex = idx;
      race.sectorStart = race.time;
    }
  }

  function updatePlayer(dt) {
    const settings = getSettings();
    const auto = settings.autoThrottle;
    const throttle = input.throttle || input.throttleAxis > 0.08 || auto;
    const brake = input.brake || input.brakeAxis > 0.08;
    const boostWanted = (input.nitro || input.gamepadNitro) && player.nitro > 1.5 && player.speed > 1600;
    player.boosting = boostWanted;
    player.slipstream = computeSlipstream();
    const draft = player.slipstream;
    const speedLimit = (player.boosting ? player.nitroSpeed : player.maxSpeed) + draft * 380;

    if (throttle) {
      const accel = player.accel * (player.boosting ? 1.42 : 1) * (1 + draft * 0.18);
      player.speed += accel * (1 - clamp(player.speed / speedLimit, 0, 1)) * dt;
    } else {
      player.speed -= 1500 * dt;
    }
    if (brake) player.speed -= 15000 * dt;

    if (player.speed > speedLimit) {
      player.speed -= (player.speed - speedLimit) * 1.6 * dt;
    }

    if (player.boosting) {
      player.nitro = Math.max(0, player.nitro - player.nitroDrain * dt);
    } else {
      player.nitro = Math.min(100, player.nitro + player.nitroRegen * dt + draft * 1.2 * dt);
    }

    const steerKey = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const steerTarget = clamp(steerKey + input.steerAxis, -1, 1);
    player.steerInput += (steerTarget - player.steerInput) * Math.min(1, dt * 12);
    player.steer += (player.steerInput - player.steer) * Math.min(1, dt * 9);

    const speedRatio = clamp(player.speed / player.maxSpeed, 0, 1.3);
    const seg = track[currentSegmentIndex()];
    playerSegment = seg;
    const curve = seg.curve;
    currentCurve = curve;

    const gripAssist = settings.assist === 'high' ? 1.08 : 1;
    const offroadGrip = Math.abs(player.x) > 0.985 ? 0.42 : 1;
    const brakeGrip = brake && Math.abs(player.steerInput) > 0.35 && speedRatio > 0.35 ? 0.78 : 1;
    const grip = player.grip * offroadGrip * brakeGrip;
    const steerVelocity = steerTarget * 1.24 * (0.24 + Math.min(1, speedRatio) * 0.92) * player.steerRate * gripAssist;
    player.lateralVel += (steerVelocity - player.lateralVel) * Math.min(1, dt * (4.6 * grip + 1.4));
    const curvePush = 0.42 * (settings.assist === 'high' ? 0.68 : 1);
    player.lateralVel -= curve * Math.pow(Math.min(1.3, speedRatio), 2) * curvePush * dt;

    if (Math.abs(steerTarget) < 0.06 && settings.assist !== 'off') {
      const centerPull = settings.assist === 'high' ? 2.2 : 0.8;
      player.lateralVel += (0 - player.lateralVel) * Math.min(1, dt * centerPull);
      if (settings.assist === 'high') player.x += (0 - player.x) * Math.min(1, dt * 0.42);
    }

    player.x += player.lateralVel * dt;
    player.drift = clamp(
      Math.abs(player.lateralVel - steerVelocity) * 0.85 +
      (brake && Math.abs(player.steerInput) > 0.4 && speedRatio > 0.45 ? speedRatio * 0.55 : 0),
      0,
      1
    );
    if (player.drift > 0.34 && player.speed > 6000) race.driftTime += dt;

    player.offroad = Math.abs(player.x) > 0.985 && Math.abs(player.x) <= WALL_LIMIT;
    if (player.offroad) {
      race.lapClean = false;
      player.speed -= Math.max(0, player.speed - 5200) * 1.45 * dt;
      player.speed -= 2400 * dt;
      race.shake = Math.min(8, race.shake + 18 * dt);
      spawnOffroadParticles();
    }

    player.wallCooldown = Math.max(0, player.wallCooldown - dt);
    if (Math.abs(player.x) > WALL_LIMIT) {
      const side = Math.sign(player.x) || 1;
      player.x = side * WALL_LIMIT;
      if (player.wallCooldown <= 0) {
        race.lapClean = false;
        player.speed *= 0.58;
        player.lateralVel = -player.lateralVel * 0.5 - side * 0.2;
        player.wallCooldown = 0.55;
        race.shake = 15;
        race.flash = 0.7;
        spawnCrashSparks();
        audio.crash();
        showToast('WALL CONTACT · 保持走线', 900);
      }
    }

    player.speed = clamp(player.speed, 0, player.nitroSpeed * 1.08);
    player.x = clamp(player.x, -WALL_LIMIT, WALL_LIMIT);

    player.bump = Math.sin(performance.now() * 0.024) * 0.8 * speedRatio +
      (player.offroad ? Math.sin(performance.now() * 0.09) * 2.6 : 0);

    player.progress += player.speed * dt;
    player.topSpeed = Math.max(player.topSpeed, player.speed);
    player.lap = Math.min(race.totalLaps, Math.floor(player.progress / TRACK_LENGTH) + 1);
    updateSectorProgress();

    if (race.ghostSamples.length < 2400 && race.time - race.lastGhostSample >= 0.12) {
      race.lastGhostSample = race.time;
      race.ghostSamples.push({
        t: Math.round(race.time * 100) / 100,
        p: Math.round(player.progress),
        x: Math.round(player.x * 1000) / 1000,
      });
    }

    if (player.boosting) {
      race.nitroTime += dt;
      spawnBoostParticles();
      race.shake = Math.max(race.shake, 1.9);
    }
    if (player.offroad) spawnOffroadParticles();
    if (!player.offroad && player.speed > 8000 && (player.drift > 0.32 || Math.abs(player.steerInput) > 0.72) && Math.random() < 0.55) {
      spawnTireSmoke();
    }

    const lapBoundary = race.lap * TRACK_LENGTH;
    if (player.progress >= lapBoundary) {
      const lapTime = race.time - race.lapStart;
      if (race.lapClean) race.cleanLaps += 1;
      player.lastLap = lapTime;
      const record = getTrackRecord(race.trackId);
      if (lapTime > 0 && (!player.bestLap || lapTime < player.bestLap)) {
        player.bestLap = lapTime;
        if (!record.bestLap || lapTime < record.bestLap) {
          record.bestLap = lapTime;
          record.sectors = race.sectorTimes.slice();
          race.preferredSectors = race.sectorTimes.slice();
          saveProfile();
          if (!savedBestLap || lapTime < savedBestLap) {
            savedBestLap = lapTime;
            storage.set('nightshift.bestLap', String(lapTime));
          }
        }
      }
      race.lastLap = lapTime;
      race.bestLap = player.bestLap;
      player.lapStart = race.time;
      race.lapStart = race.time;

      if (race.lap >= race.totalLaps) {
        finishRace();
        return;
      }

      race.lap += 1;
      player.lap = race.lap;
      race.lapClean = true;
      player.nitro = Math.min(100, player.nitro + 16);
      race.flash = 1;
      race.sectorTimes = [0, 0, 0];
      race.sectorIndex = 0;
      race.sectorStart = race.time;
      showToast(`LAP ${race.lap} / ${race.totalLaps} · ${formatTime(lapTime)}`, 1900);
      audio.lap();
    }

    if (player.progress >= race.totalLaps * TRACK_LENGTH) {
      finishRace();
    }
  }

  function updateAI(dt) {
    const playerFrac = player.progress;
    const finishDistance = race.totalLaps * TRACK_LENGTH;

    for (const ai of opponents) {
      if (ai.finished) continue;

      ai.phase += dt;
      ai.mistakeTimer -= dt;
      if (ai.mistakeTimer <= 0) {
        ai.mistakeTimer = 8 + Math.random() * 13;
        ai.mistakeTime = 0.45 + Math.random() * 1.1;
      }
      ai.mistakeTime = Math.max(0, ai.mistakeTime - dt);

      const segIndex = Math.floor(ai.progress / SEGMENT_LENGTH) % TRACK_SEGMENTS;
      const seg = track[segIndex];
      const ahead = track[(segIndex + 22) % TRACK_SEGMENTS];
      const curvePenalty = Math.min(0.15, Math.abs(seg.curve) * 0.037);
      const baseCar = CAR_BY_ID[player.carId] || CAR_BY_ID.vanta;
      let target = baseCar.maxSpeed * ai.pace * race.aiSkill * (1 - curvePenalty);
      const gap = ai.progress - playerFrac;

      if (gap > 11000) target *= 0.96;
      if (gap > 22000) target *= 0.97;
      if (gap < -8000) target *= 1.018;
      if (player.finished) target *= 0.6;

      const racingLane = clamp(seg.curve * 0.09 + ahead.curve * 0.13, -0.58, 0.58);
      let desiredLane = clamp(racingLane + ai.homeLane * 0.42, -0.76, 0.76);
      let blocked = false;

      for (const other of opponents) {
        if (other === ai || other.finished) continue;
        const rel = other.progress - ai.progress;
        if (rel > 260 && rel < 5200 && Math.abs(other.lane - desiredLane) < 0.27) {
          blocked = true;
          break;
        }
      }
      const playerRel = player.progress - ai.progress;
      if (playerRel > 320 && playerRel < 4300 && Math.abs(player.x - desiredLane) < 0.26) {
        blocked = true;
      }
      if (blocked) {
        const leftSpace = desiredLane - (-0.78);
        const rightSpace = 0.78 - desiredLane;
        let side = leftSpace > rightSpace ? -1 : 1;
        if (Math.abs(desiredLane) > 0.55) side = -Math.sign(desiredLane);
        desiredLane = clamp(desiredLane + side * 0.36, -0.78, 0.78);
      }

      for (const other of opponents) {
        if (other === ai || other.finished) continue;
        const dz = other.progress - ai.progress;
        if (Math.abs(dz) < 1500 && Math.abs(other.lane - ai.lane) < 0.3) {
          const side = ai.lane >= other.lane ? 1 : -1;
          desiredLane = clamp(desiredLane + side * 0.2, -0.82, 0.82);
        }
      }

      if (race.aiSkill > 1.04 && gap > 500 && gap < 6500 && Math.abs(player.x) < 0.7) {
        desiredLane = lerp(desiredLane, clamp(player.x * 0.78, -0.7, 0.7), 0.38);
      }

      if (ai.mistakeTime > 0) {
        desiredLane = clamp(desiredLane + Math.sin(ai.phase * 6.2 + ai.id) * 0.2, -0.82, 0.82);
        target *= 0.965;
      }

      ai.speed += (target - ai.speed) * Math.min(1, dt * 1.28);
      ai.progress += ai.speed * dt;
      ai.targetLane = desiredLane;
      ai.lane = clamp(ai.lane + (ai.targetLane - ai.lane) * Math.min(1, dt * (1.1 + race.aiSkill * 0.3)), -0.85, 0.85);

      ai.cooldown = Math.max(0, ai.cooldown - dt);
      const rel = ai.progress - player.progress;
      const lateral = Math.abs(ai.lane - player.x);
      if (ai.cooldown <= 0 && race.collisionCooldown <= 0 &&
          rel > -80 && rel < 1850 && lateral < 0.3 && player.speed > 1500) {
        crash(ai, rel);
      }

      if (ai.progress >= finishDistance) {
        ai.progress = finishDistance;
        ai.finished = true;
        ai.finishTime = race.time;
      }
    }
  }

  function crash(ai, rel) {
    race.collisionCooldown = 0.6;
    race.lapClean = false;
    ai.cooldown = 1.2;
    player.speed *= 0.79;
    player.lateralVel *= 0.65;
    race.shake = 12;
    race.flash = 0.8;
    spawnCrashSparks();
    audio.crash();
    const push = player.x < ai.lane ? -1 : 1;
    player.x = clamp(player.x + push * 0.105, -WALL_LIMIT, WALL_LIMIT);
    ai.lane = clamp(ai.lane - push * 0.13, -0.85, 0.85);
    if (rel > 0) ai.speed *= 1.04;
    showToast('CONTACT · 保持走线', 900);
  }

  function updateDailyProgress(rank) {
    const daily = ensureDaily();
    const p = daily.progress;
    p.races += 1;
    if (rank <= 3) p.podiums += 1;
    if (rank === 1) p.wins += 1;
    p.drift += race.driftTime;
    p.nitro += race.nitroTime;
    p.topSpeed = Math.max(p.topSpeed, Math.round(player.topSpeed * 0.0265));
    p.cleanLaps += race.cleanLaps;
    const completed = [];
    daily.ids.forEach((id) => {
      const challenge = dailyChallengeById(id);
      if (!challenge || daily.claimed.includes(id)) return;
      if ((p[challenge.metric] || 0) >= challenge.target) {
        daily.claimed.push(id);
        profile.coins += challenge.reward;
        profile.stats.dailies += 1;
        completed.push(challenge);
      }
    });
    saveProfile();
    return completed;
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
    const finishDistance = race.totalLaps * TRACK_LENGTH;
    const finishedAI = opponents.filter((a) => {
      if (a.finished) return a.finishTime <= player.finishTime;
      return a.progress >= finishDistance;
    });
    const rank = 1 + finishedAI.length;
    race.position = rank;
    audio.finish(rank === 1);

    if (race.ghostSamples.length && race.ghostSamples[race.ghostSamples.length - 1].p < player.progress) {
      race.ghostSamples.push({ t: Math.round(race.time * 100) / 100, p: Math.round(player.progress), x: Math.round(player.x * 1000) / 1000 });
    }

    const record = getTrackRecord(race.trackId);
    const previousBest = record.bestTime || 0;
    const newRecord = !previousBest || race.time < previousBest;
    if (newRecord) {
      record.bestTime = race.time;
      if (race.ghostSamples.length > 1) {
        record.ghost = {
          time: race.time,
          carId: player.carId,
          samples: race.ghostSamples.slice(),
        };
      }
    }
    const newLap = !!(player.bestLap && record.bestLap && Math.abs(record.bestLap - player.bestLap) < 0.0005);

    profile.stats.driftTime += race.driftTime;
    profile.stats.nitroTime += race.nitroTime;
    profile.stats.cleanLaps += race.cleanLaps;
    profile.stats.topSpeed = Math.max(profile.stats.topSpeed, Math.round(player.topSpeed * 0.0265));
    if (newRecord) profile.stats.records += 1;
    const leaderboardPos = addLeaderboardEntry(race.trackId, race.time, rank, player.carId);

    const baseReward = [300, 200, 140, 95, 70, 55][rank - 1] || 50;
    let eventBonus = 0;
    let eventCompletedNow = false;
    let eventState = null;
    let unlockedNext = null;
    if (currentEvent) {
      eventState = profile.events[currentEvent.id] || { bestRank: 0, bestTime: 0, completed: false };
      if (!eventState.bestRank || rank < eventState.bestRank) eventState.bestRank = rank;
      if (!eventState.bestTime || race.time < eventState.bestTime) eventState.bestTime = race.time;
      if (rank <= currentEvent.target && !eventState.completed) {
        eventState.completed = true;
        eventBonus = currentEvent.reward;
        eventCompletedNow = true;
      }
      eventState.medal = medalForRank(eventState.bestRank);
      profile.events[currentEvent.id] = eventState;
      const index = CAREER_EVENTS.indexOf(currentEvent);
      if (eventCompletedNow && index >= 0 && index < CAREER_EVENTS.length - 1) {
        unlockedNext = CAREER_EVENTS[index + 1];
      }
    }

    profile.coins += baseReward + eventBonus;
    profile.races += 1;
    if (rank === 1) profile.wins += 1;
    if (rank <= 3) profile.podiums += 1;

    const dailyCompletions = updateDailyProgress(rank);
    const newAchievements = checkAchievements();
    const dailyReward = dailyCompletions.reduce((sum, c) => sum + c.reward, 0);
    const achievementReward = newAchievements.reduce((sum, a) => sum + a.reward, 0);
    saveProfile();
    updateProfileUI();

    const standings = buildStandings();
    race.result = {
      rank,
      time: race.time,
      bestLap: player.bestLap || race.time,
      topSpeed: player.topSpeed,
      standings,
      newRecord,
      newLap,
      baseReward,
      eventBonus,
      eventCompletedNow,
      eventState,
      unlockedNext,
      event: currentEvent,
      trackName: currentTrackDef().name,
      totalLaps: race.totalLaps,
      dailyCompletions,
      newAchievements,
      dailyReward,
      achievementReward,
      leaderboardPos: leaderboardPos >= 0 ? leaderboardPos + 1 : null,
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

    const chips = [];
    chips.push(`<div class="reward-chip">奖金 <b>+${result.baseReward} CR</b></div>`);
    if (result.eventBonus > 0) chips.push(`<div class="reward-chip unlock">赛事奖励 <b>+${result.eventBonus} CR</b></div>`);
    if (result.newRecord) chips.push(`<div class="reward-chip record">新赛道纪录 <b>${formatTime(result.time)}</b></div>`);
    if (result.newLap) chips.push(`<div class="reward-chip record">最快单圈 <b>${formatTime(result.bestLap)}</b></div>`);
    if (result.event) {
      chips.push(`<div class="reward-chip">${result.event.name} · 目标 TOP ${result.event.target}</div>`);
    }
    if (result.eventCompletedNow && result.unlockedNext) {
      chips.push(`<div class="reward-chip unlock">解锁赛事 <b>${result.unlockedNext.name}</b></div>`);
    }
    if (result.dailyCompletions && result.dailyCompletions.length) {
      result.dailyCompletions.forEach((challenge) => {
        chips.push(`<div class="reward-chip unlock">每日挑战 <b>${challenge.name} +${challenge.reward} CR</b></div>`);
      });
    }
    if (result.newAchievements && result.newAchievements.length) {
      result.newAchievements.forEach((ach) => {
        chips.push(`<div class="reward-chip record">成就 <b>${ach.cn} +${ach.reward} CR</b></div>`);
      });
    }
    if (result.leaderboardPos && result.leaderboardPos <= 5) {
      chips.push(`<div class="reward-chip">本地榜 <b>#${result.leaderboardPos}</b></div>`);
    }
    ui.resultExtra.innerHTML = chips.join('');

    const list = result.standings;
    const raceDistance = result.totalLaps * TRACK_LENGTH;
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
    player.lateralVel = 0;
    player.drift = 0;
    player.slipstream = 0;
    race.ghost = null;

    opponents.forEach((ai, i) => {
      ai.progress = player.progress + 1700 + i * 920 + Math.sin(race.menuTime * 0.33 + i) * 380;
      ai.speed = 4200 + i * 80;
      ai.lane = clamp(ai.homeLane + Math.sin(race.menuTime * 0.27 + i * 1.4) * 0.16, -0.8, 0.8);
      ai.finished = false;
    });

    race.shakeX *= 0.9;
    race.shakeY *= 0.9;
    if (Math.random() < 0.4) {
      spawnBoostParticles();
    }
  }

  function update(dt) {
    pollGamepad();
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
        if (stage === 1) { setCountdown('2', 'HEAT THE TIRES', false, 3); audio.countdown(false); }
        else if (stage === 2) { setCountdown('1', 'SEND IT', false, 4); audio.countdown(false); }
        else if (stage >= 3) { setCountdown('GO', 'NIGHTSHIFT', true, 4); goRace(); }
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

    const active = race.mode === 'racing';
    if (active) {
      race.time += dt;
      if (getSettings().ghost) updateGhost();
      audio.setEngine(clamp(player.speed / (player.maxSpeed || 13400), 0, 1.25), input.throttle || input.throttleAxis > 0.08, player.boosting, true);
      updatePlayer(dt);
      if (race.mode === 'racing') updateAI(dt);
      updateParticles(dt);
      race.collisionCooldown = Math.max(0, race.collisionCooldown - dt);
    } else {
      player.boosting = false;
      player.speed *= (1 - dt * 0.7);
      updateParticles(dt);
      audio.setEngine(clamp(player.speed / (player.maxSpeed || 13400), 0, 1.2), false, false, true);
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
      const thresholds = [0, 58, 122, 188, 254, 320];
      gear = String(clamp(thresholds.filter((t) => kmh >= t).length, 1, 6));
    }
    ui.gearValue.textContent = gear;

    const nitro = Math.round(player.nitro);
    ui.nitroFill.style.width = `${nitro}%`;
    ui.nitroValue.textContent = `${nitro}%`;
    ui.nitroFill.classList.toggle('low', nitro < 25);

    ui.lapValue.textContent = String(Math.min(race.totalLaps, race.lap));
    ui.raceTime.textContent = formatTime(race.time);
    const lapTime = Math.max(0, race.time - race.lapStart);
    ui.lapTime.textContent = formatTime(lapTime);
    const record = getTrackRecord(race.trackId);
    const shownBest = player.bestLap > 0
      ? (record.bestLap > 0 ? Math.min(player.bestLap, record.bestLap) : player.bestLap)
      : record.bestLap;
    ui.bestLapHud.textContent = shownBest ? formatTime(shownBest) : '--:--.---';

    const sectorEls = [ui.sector1, ui.sector2, ui.sector3];
    sectorEls.forEach((el, i) => {
      const parent = el.parentElement;
      parent.classList.toggle('active', i === race.sectorIndex);
      parent.classList.toggle('done', i < race.sectorIndex || (race.sectorIndex === 0 && race.sectorTimes[i] > 0));
      if (i < race.sectorIndex) el.textContent = formatTime(race.sectorTimes[i]).slice(3);
      else if (i === race.sectorIndex) el.textContent = formatTime(Math.max(0, race.time - race.sectorStart)).slice(3);
      else el.textContent = '--.--';
    });
    const deltaIdx = race.sectorIndex > 0 ? race.sectorIndex - 1 : (race.sectorTimes[2] > 0 ? 2 : -1);
    const pref = deltaIdx >= 0 ? (race.preferredSectors[deltaIdx] || 0) : 0;
    if (pref > 0 && deltaIdx >= 0 && race.mode === 'racing') {
      const diff = (race.sectorTimes[deltaIdx] || 0) - pref;
      ui.deltaValue.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(3)}`;
      ui.deltaValue.className = diff <= 0 ? 'better' : 'slower';
    } else {
      ui.deltaValue.textContent = '--.---';
      ui.deltaValue.className = '';
    }

    const ghostTime = ghostTimeAtProgress(player.progress);
    if (ghostTime !== null && race.mode === 'racing' && race.ghost && race.ghost.visible) {
      const diff = race.time - ghostTime;
      ui.ghostDelta.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(3)}`;
      ui.ghostDelta.className = diff <= 0 ? 'better' : 'slower';
    } else {
      ui.ghostDelta.textContent = '--.---';
      ui.ghostDelta.className = '';
    }

    const slip = player.slipstream > 0.22 && player.speed > 5000 && race.mode === 'racing';
    ui.slipstreamBadge.classList.toggle('show', slip);
    if (slip) ui.slipstreamBadge.textContent = `SLIPSTREAM ${Math.round(player.slipstream * 100)}%`;

    const standings = buildStandings();
    const rank = standings.findIndex((r) => r.isYou) + 1;
    ui.posValue.textContent = String(rank);
    ui.posValue.style.color = rank === 1 ? 'var(--amber)' : '';

    if (race.time - race.lastLbUpdate > 0.14 || race.lastLbUpdate === 0) {
      race.lastLbUpdate = race.time;
      const leader = standings[0];
      const gapSpeed = Math.max(9000, player.maxSpeed * 0.92);
      const rows = standings.map((racer, i) => {
        const gap = i === 0 ? '--' : formatGap(Math.max(0, (leader.progress - racer.progress) / gapSpeed));
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

    drawMinimap();
  }

  /* -------------------------------- Controls -------------------------------- */

  let gamepadStartPrev = false;

  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    const pad = pads ? Array.from(pads).find((p) => p && p.connected) : null;
    if (!pad) {
      input.steerAxis = 0;
      input.throttleAxis = 0;
      input.brakeAxis = 0;
      input.gamepadNitro = false;
      gamepadStartPrev = false;
      return;
    }
    let steer = Math.abs(pad.axes[0] || 0) > 0.14 ? pad.axes[0] : 0;
    if (pad.buttons[14] && pad.buttons[14].pressed) steer -= 1;
    if (pad.buttons[15] && pad.buttons[15].pressed) steer += 1;
    input.steerAxis = clamp(steer, -1, 1);
    input.throttleAxis = pad.buttons[7] ? pad.buttons[7].value : 0;
    input.brakeAxis = pad.buttons[6] ? pad.buttons[6].value : 0;
    input.gamepadNitro = !!(pad.buttons[0] && pad.buttons[0].pressed);

    const start = !!(pad.buttons[9] && pad.buttons[9].pressed);
    if (start && !gamepadStartPrev) {
      if (!ui.settings.classList.contains('is-hidden')) {
        closeSettings();
      } else if (!ui.setup.classList.contains('is-hidden')) {
        startQuickRace();
      } else if (!ui.career.classList.contains('is-hidden')) {
        closeCareer();
      } else if (!ui.profileScreen.classList.contains('is-hidden')) {
        closeProfile();
      } else if (race.mode === 'racing') {
        pauseRace();
      } else if (race.mode === 'paused') {
        resumeRace();
      } else if (race.mode === 'finished') {
        startRace();
      } else if (race.mode === 'menu' && !ui.menu.classList.contains('is-hidden')) {
        openSetup();
      }
    }
    gamepadStartPrev = start;
  }

  function keyDown(e) {
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      e.preventDefault();
    }
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
      if (code !== 'Escape') return;
    }
    if (code === 'ArrowLeft' || code === 'KeyA') input.left = true;
    if (code === 'ArrowRight' || code === 'KeyD') input.right = true;
    if (code === 'ArrowUp' || code === 'KeyW') input.throttle = true;
    if (code === 'ArrowDown' || code === 'KeyS') input.brake = true;
    if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') input.nitro = true;

    if (e.repeat) return;

    const setupOpen = !ui.setup.classList.contains('is-hidden');
    const careerOpen = !ui.career.classList.contains('is-hidden');
    const settingsOpen = !ui.settings.classList.contains('is-hidden');
    const profileOpen = !ui.profileScreen.classList.contains('is-hidden');

    if (code === 'Escape') {
      if (settingsOpen) { closeSettings(); return; }
      if (setupOpen) { closeSetup(); return; }
      if (careerOpen) { closeCareer(); return; }
      if (profileOpen) { closeProfile(); return; }
      if (race.mode === 'racing') { pauseRace(); return; }
      if (race.mode === 'paused') { resumeRace(); return; }
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (settingsOpen) { closeSettings(); return; }
      if (setupOpen) { startQuickRace(); return; }
      if (careerOpen || profileOpen) return;
      if (race.mode === 'menu') openSetup();
      else if (race.mode === 'finished') startRace();
    }
    if (settingsOpen || setupOpen || careerOpen || profileOpen) {
      if (code === 'KeyM') toggleMute();
      return;
    }
    if (code === 'KeyP') {
      if (race.mode === 'racing') pauseRace();
      else if (race.mode === 'paused') resumeRace();
      return;
    }
    if (code === 'KeyM') toggleMute();
    if (code === 'KeyR' && (race.mode === 'racing' || race.mode === 'paused' || race.mode === 'finished')) {
      startRace();
    }
    if (race.mode === 'menu' && code === 'Space' && !setupOpen && !careerOpen && !settingsOpen && !profileOpen) openSetup();
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
    currentEvent = null;
    currentRaceMode = 'QUICK RACE';
    race.mode = 'menu';
    setScreen(ui.pause, false);
    setScreen(ui.results, false);
    setScreen(ui.career, false);
    setScreen(ui.profileScreen, false);
    setScreen(ui.setup, false);
    setScreen(ui.settings, false);
    setScreen(ui.menu, true);
    showRaceHud(false);
    showTouch(false);
    hideCountdown();
    resetRace();
    race.mode = 'menu';
    audio.resume();
    showTouch(false);
    updateProfileUI();
  }

  $('startBtn').addEventListener('click', openSetup);
  $('setupBackBtn').addEventListener('click', closeSetup);
  $('setupStartBtn').addEventListener('click', startQuickRace);
  $('careerBtn').addEventListener('click', openCareer);
  $('careerBackBtn').addEventListener('click', closeCareer);
  $('profileBtn').addEventListener('click', () => openProfile('daily'));
  $('profileBackBtn').addEventListener('click', closeProfile);
  $('settingsBtn').addEventListener('click', () => openSettings('menu'));
  $('pauseSettingsBtn').addEventListener('click', () => openSettings('pause'));
  $('settingsCloseBtn').addEventListener('click', closeSettings);
  $('settingsDoneBtn').addEventListener('click', closeSettings);
  $('settingsResetBtn').addEventListener('click', resetSettings);
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

  ui.trackGrid.addEventListener('click', (e) => {
    const card = e.target.closest('[data-track]');
    if (!card) return;
    const id = card.getAttribute('data-track');
    if (!TRACK_BY_ID[id] || id === selectedTrackId) return;
    selectedTrackId = id;
    profile.lastTrack = id;
    applyTrack(id, true);
    renderSetup();
    updateProfileUI();
  });

  ui.carGrid.addEventListener('click', (e) => {
    const buy = e.target.closest('[data-buy]');
    if (buy) {
      e.stopPropagation();
      buyCar(buy.getAttribute('data-buy'));
      return;
    }
    const card = e.target.closest('[data-car]');
    if (!card) return;
    const id = card.getAttribute('data-car');
    if (isCarUnlocked(id)) applyCarSelection(id);
  });

  ui.carGrid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-car]');
    if (!card) return;
    const id = card.getAttribute('data-car');
    if (isCarUnlocked(id)) {
      e.preventDefault();
      applyCarSelection(id);
    }
  });

  ui.careerList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-event]');
    if (!btn) return;
    startCareerEvent(btn.getAttribute('data-event'));
  });

  ui.upgradeList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-upgrade]');
    if (!btn || btn.disabled) return;
    buyUpgrade(btn.getAttribute('data-upgrade'));
  });

  ui.profileTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-profile-tab]');
    if (!btn) return;
    profileTab = btn.getAttribute('data-profile-tab');
    renderProfile();
  });

  [ui.setDifficulty, ui.setAssist, ui.setCamera, ui.setAutoThrottle, ui.setGhost].forEach((el) => {
    el.addEventListener('change', () => {
      applySettingsFromUI();
      if (!getSettings().ghost && race.ghost) race.ghost.visible = false;
    });
  });
  [ui.setMaster, ui.setMusic, ui.setEngine].forEach((el) => {
    el.addEventListener('input', applySettingsFromUI);
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
  applyTrack(selectedTrackId, true);
  applyCarSelection(selectedCarId);
  const legacyRecord = getTrackRecord('midnight');
  if (!legacyRecord.bestLap && savedBestLap) legacyRecord.bestLap = savedBestLap;
  audio.setVolumes({
    master: getSettings().masterVolume,
    music: getSettings().musicVolume,
    engine: getSettings().engineVolume,
  });
  resetRace();
  race.mode = 'menu';
  player.progress = 0;
  race.menuTime = 0;
  opponents.forEach((ai, i) => {
    ai.progress = 3200 + i * 1050;
    ai.speed = 3200;
  });
  ui.soundBtn.classList.toggle('muted', savedMuted);
  updateSoundButton();
  updateProfileUI();
  renderSetup();
  setStartLights(-1, false);

  if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
    document.body.classList.add('supports-touch');
    document.body.classList.add('touch');
  }

  requestAnimationFrame(frame);
})();
