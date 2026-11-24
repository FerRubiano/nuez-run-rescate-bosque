/* =====================================================================
   NUEZ RUN – Rescate del Bosque · Demo mejorada (Tarea 3)
   Endless runner de 3 carriles en perspectiva (inspirado en Subway Surfers)
   ===================================================================== */
"use strict";

// ---------------------------------------------------------------------
// 1. Referencias al DOM
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");
const gameArea = $("gameArea");

const mainMenu = $("mainMenu");
const instructionsPanel = $("instructionsPanel");
const gamePanel = $("gamePanel");
const resultPanel = $("resultPanel");

const ui = {
  score: $("score"),
  acorns: $("acorns"),
  multiplier: $("multiplier"),
  lives: $("lives"),
  powerups: $("powerups"),
  forestLabel: $("forestLabel"),
  forestFill: $("forestFill"),
  prompt: $("prompt"),
  banner: $("banner"),
  countdown: $("countdown"),
  pauseOverlay: $("pauseOverlay"),
  muteButton: $("muteButton"),
  menuRecord: $("menuRecord"),
  resultTitle: $("resultTitle"),
  resultCause: $("resultCause"),
  resultMessage: $("resultMessage"),
  resultTip: $("resultTip"),
  finalScore: $("finalScore"),
  finalDistance: $("finalDistance"),
  finalAcorns: $("finalAcorns"),
  finalForest: $("finalForest")
};

// ---------------------------------------------------------------------
// 2. Constantes del mundo y de la cámara
// ---------------------------------------------------------------------
// Tamaño lógico del lienzo: se recalcula según la pantalla (diseño responsivo).
let W = 800;
let H = 450;

const LANE_X = [-1.7, 0, 1.7];     // posición X de cada carril (unidades de mundo)
const ROAD_HALF = 2.6;              // medio ancho del sendero
let CAM_H = 2.4;                    // altura de la cámara (más alta en celular vertical)
const CAM_BACK = 5;                 // distancia de la cámara detrás de Nuez
let FOCAL = 520;                    // distancia focal (px)
let HORIZON = 150;                  // línea de horizonte en pantalla
let IS_PORTRAIT = false;
let VIEW_DIST = 110;                // hasta dónde se alcanza a ver (en celular vertical hay neblina más cerca)
let TREE_SCALE = 1;
const IS_TOUCH = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
const DRAW_DIST = 110;              // distancia máxima de dibujo

const GRAVITY = 30;
const JUMP_V = 10.5;
const SUPER_JUMP_V = 15.5;
const ROLL_TIME = 0.6;
const PLAYER_H = 1.15;
const PLAYER_ROLL_H = 0.55;

const START_LIVES = 3;
const FOREST_GOAL = 60;             // bellotas para restaurar el bosque
const FOREST_STAGES = [
  { at: 0,  name: "🍂 Bosque seco",        short: "Seco" },
  { at: 15, name: "🌱 Brotes nuevos",      short: "Brotando" },
  { at: 35, name: "🌿 Bosque despertando", short: "Despertando" },
  { at: 60, name: "🌳 ¡Bosque restaurado!", short: "Restaurado" }
];

const POWERS = {
  magnet: { icon: "🧲", name: "Imán de semillas", time: 10, color: "#d9534f" },
  jump:   { icon: "🍄", name: "Hongo saltarín",   time: 10, color: "#e07b39" },
  shield: { icon: "🍃", name: "Escudo de hojas",  time: 20, color: "#4f9d55" },
  double: { icon: "✨", name: "Semilla doble",     time: 10, color: "#9a5fd1" }
};

const CAUSES = {
  log:    { icon: "🪵", text: "Chocaste con un tronco",            tip: "Consejo: los troncos están en el suelo. ¡Salta con ↑ o deslizando hacia arriba!" },
  branch: { icon: "🌿", text: "Te golpeó un árbol caído",           tip: "Consejo: los árboles caídos están a media altura. ¡Rueda por debajo con ↓ o deslizando hacia abajo!" },
  truck:  { icon: "🚜", text: "Chocaste de frente con un camión maderero", tip: "Consejo: los camiones no se pueden saltar. Cambia de sendero con ← → con anticipación." },
  chaser: { icon: "⚙️", text: "La Taladora te alcanzó",             tip: "Consejo: si tropiezas de lado, la Taladora se acerca. Evita un segundo tropiezo mientras te persigue." }
};

const RECORD_KEY = "nuezRunRecord";
const TUTORIAL_KEY = "nuezRunTutorialDone";
const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------
// 3. Estado del juego
// ---------------------------------------------------------------------
let state = "menu";        // menu | countdown | running | paused | over
let player, entities, scenery, floaters, sparkles;
let speed, distance, score, acornCount, lives, elapsed, runTime;
let camX, shake, nextRowZ, countdownTime, chaser;
let activePowers, forestStage, lastCause;
let tutorial;              // null o { step, rows, doneShown }
let lastFrame = 0;
let rafId = null;
let promptTimer = 0;
let bannerTimer = 0;
let hudCache = {};
let record = loadNumber(RECORD_KEY);

// ---------------------------------------------------------------------
// 4. Utilidades
// ---------------------------------------------------------------------
function loadNumber(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; }
}
function saveValue(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) { /* sin almacenamiento */ }
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function hexToRgb(hex) {
  const c = hex.replace("#", "");
  return { r: parseInt(c.substring(0, 2), 16), g: parseInt(c.substring(2, 4), 16), b: parseInt(c.substring(4, 6), 16) };
}
function mixColor(colorA, colorB, amount) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const t = clamp(amount, 0, 1);
  const ch = (s, e) => Math.round(s + (e - s) * t);
  return `rgb(${ch(a.r, b.r)}, ${ch(a.g, b.g)}, ${ch(a.b, b.b)})`;
}

// ---------------------------------------------------------------------
// 5. Sonido (Web Audio, sin archivos externos)
// ---------------------------------------------------------------------
let audioCtx = null;
let muted = false;

function sound(freq, dur = 0.12, type = "sine", vol = 0.07, slideTo = null, delay = 0) {
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (e) { /* audio no disponible */ }
}
const sfx = {
  acorn: () => sound(880, 0.08, "triangle", 0.05, 1320),
  jump: () => sound(320, 0.16, "sine", 0.06, 640),
  roll: () => sound(240, 0.18, "sine", 0.05, 120),
  lane: () => sound(500, 0.05, "sine", 0.03, 560),
  stumble: () => sound(200, 0.2, "sawtooth", 0.05, 110),
  hit: () => { sound(140, 0.35, "square", 0.07, 60); },
  power: () => { sound(520, 0.1, "triangle", 0.06); sound(780, 0.12, "triangle", 0.06, null, 0.09); sound(1040, 0.16, "triangle", 0.06, null, 0.18); },
  stage: () => { [523, 659, 784, 1046].forEach((f, i) => sound(f, 0.16, "triangle", 0.06, null, i * 0.1)); },
  tick: () => sound(660, 0.08, "square", 0.04),
  go: () => sound(990, 0.2, "square", 0.05)
};


// ---------------------------------------------------------------------
// 5b. Música de fondo original (generada con Web Audio: sin archivos ni derechos de autor)
//     Tema alegre de bosque en Do mayor (Do – La menor – Fa – Sol), 112 pulsaciones por minuto.
//     A medida que el bosque se restaura se suman instrumentos: la música también "reverdece".
// ---------------------------------------------------------------------
const MUSIC_KEY = "nuezRunMusic";
let musicOn = loadNumber(MUSIC_KEY) !== 2;   // 2 = el jugador la apagó
const music = {
  bus: null,        // volumen general de la música
  timer: null,
  step: 0,
  nextTime: 0,
  playing: false,
  noise: null
};
const MUSIC_VOLUME = 0.2;                     // bajo, para que quede de fondo
const STEP_TIME = 60 / 112 / 2;               // duración de una corchea

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Acordes (bajo + notas del acorde) para cada compás.
const CHORDS = [
  { bass: 48, notes: [60, 64, 67] },   // Do
  { bass: 45, notes: [57, 60, 64] },   // La menor
  { bass: 41, notes: [53, 57, 60] },   // Fa
  { bass: 43, notes: [55, 59, 62] }    // Sol
];
// Melodía: 2 frases de 4 compases (8 corcheas por compás). -1 = silencio.
const MELODY = [
  [72, -1, 76, -1, 79, 76, 74, 72], [69, -1, 72, -1, 76, 74, 72, 69],
  [65, -1, 69, 72, 74, -1, 72, 69], [67, 71, 74, -1, 72, -1, 71, 67],
  [79, -1, 77, 76, 74, -1, 76, 79], [81, -1, 79, 76, 72, -1, 74, 76],
  [77, 76, 74, 72, 69, -1, 72, 74], [74, -1, 71, 74, 79, -1, -1, -1]
];
// Contramelodía tipo "campanitas", solo con el bosque restaurado.
const BELLS = [84, -1, -1, 88, -1, -1, 91, -1];

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  if (!music.bus) {
    music.bus = audioCtx.createGain();
    music.bus.gain.value = 0;
    music.bus.connect(audioCtx.destination);
    // Ruido blanco corto para la percusión suave.
    const len = Math.floor(audioCtx.sampleRate * 0.2);
    music.noise = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = music.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
}

function musicNote(freq, t, dur, type, vol) {
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(music.bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function musicHat(t, vol) {
  const src = audioCtx.createBufferSource();
  src.buffer = music.noise;
  const filter = audioCtx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 7000;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(filter).connect(g).connect(music.bus);
  src.start(t);
  src.stop(t + 0.06);
}

function musicKick(t, vol) {
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.frequency.setValueAtTime(130, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  osc.connect(g).connect(music.bus);
  osc.start(t);
  osc.stop(t + 0.16);
}

function scheduleStep(step, t) {
  const bar = Math.floor(step / 8) % 8;          // 8 compases = frase A + frase B
  const beat = step % 8;
  const chord = CHORDS[bar % 4];
  const layer = typeof forestStage === "number" ? forestStage : 0;

  // Bajo: en los tiempos 1 y 3.
  if (beat === 0 || beat === 4) musicNote(midi(chord.bass), t, STEP_TIME * 3.5, "triangle", 0.16);
  // Arpegio suave del acorde.
  const arp = [0, 1, 2, 1, 0, 1, 2, 1][beat];
  musicNote(midi(chord.notes[arp] + 12), t, STEP_TIME * 1.6, "sine", 0.045);
  // Melodía principal.
  const m = MELODY[bar][beat];
  if (m > 0) musicNote(midi(m), t, STEP_TIME * 1.8, "triangle", 0.075);

  // Capas que aparecen cuando el bosque se recupera.
  if (layer >= 1 && beat % 2 === 1) musicHat(t, 0.035);
  if (layer >= 2 && (beat === 0 || beat === 4)) musicKick(t, 0.15);
  if (layer >= 3 && BELLS[beat] > 0 && bar % 2 === 0) musicNote(midi(BELLS[beat]), t, STEP_TIME * 2.5, "sine", 0.04);
}

function musicScheduler() {
  // Programa las notas un poco por adelantado para que el ritmo sea estable.
  while (music.nextTime < audioCtx.currentTime + 0.15) {
    scheduleStep(music.step, music.nextTime);
    music.step++;
    music.nextTime += STEP_TIME;
  }
}

function musicStart(fromBeginning = true) {
  if (!musicOn || muted) return;
  try {
    ensureAudio();
    if (music.playing) return;
    if (fromBeginning) music.step = 0;
    music.nextTime = audioCtx.currentTime + 0.08;
    music.bus.gain.cancelScheduledValues(audioCtx.currentTime);
    music.bus.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    music.bus.gain.linearRampToValueAtTime(MUSIC_VOLUME, audioCtx.currentTime + 1.2); // entrada suave
    music.timer = setInterval(musicScheduler, 25);
    music.playing = true;
  } catch (e) { /* audio no disponible */ }
}

function musicStop() {
  if (!music.playing) return;
  clearInterval(music.timer);
  music.timer = null;
  music.playing = false;
  if (music.bus && audioCtx) {
    const now = audioCtx.currentTime;
    music.bus.gain.cancelScheduledValues(now);
    music.bus.gain.setValueAtTime(music.bus.gain.value, now);
    music.bus.gain.linearRampToValueAtTime(0.0001, now + 0.25);   // salida suave
  }
}

function toggleMusic() {
  musicOn = !musicOn;
  saveValue(MUSIC_KEY, musicOn ? 1 : 2);
  updateMusicButton();
  if (musicOn && (state === "running" || state === "countdown")) musicStart(false);
  else musicStop();
}

function updateMusicButton() {
  const btn = document.getElementById("musicButton");
  if (!btn) return;
  btn.classList.toggle("off", !musicOn);
  btn.setAttribute("aria-label", musicOn ? "Apagar música" : "Encender música");
  btn.setAttribute("aria-pressed", String(musicOn));
}

// ---------------------------------------------------------------------
// 6. Navegación entre pantallas
// ---------------------------------------------------------------------
function showOnly(panel) {
  for (const p of [mainMenu, instructionsPanel, gamePanel, resultPanel]) p.hidden = p !== panel;
}

function exitFullscreen() {
  document.body.classList.remove("playing");
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}

function showMenu() {
  stopLoop();
  musicStop();
  exitFullscreen();
  state = "menu";
  ui.menuRecord.textContent = record;
  showOnly(mainMenu);
}

function showInstructions() {
  stopLoop();
  musicStop();
  exitFullscreen();
  state = "menu";
  showOnly(instructionsPanel);
}

function stopLoop() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
}

// ---------------------------------------------------------------------
// 7. Inicio de partida
// ---------------------------------------------------------------------
function startGame(forceTutorial = false) {
  stopLoop();
  document.body.classList.add("playing");
  showOnly(gamePanel);
  setupCanvas();

  player = {
    lane: 1, prevLane: 1, x: 0, y: 0, vy: 0,
    grounded: true, rollTime: 0, runPhase: 0, invuln: 0, stumbleAnim: 0
  };
  entities = [];
  floaters = [];
  sparkles = [];
  activePowers = {};
  speed = 0;
  distance = 0;
  score = 0;
  acornCount = 0;
  lives = START_LIVES;
  elapsed = 0;
  runTime = 0;
  camX = 0;
  shake = 0;
  forestStage = 0;
  lastCause = null;
  chaser = { timer: 2.6, z: -2.4 };   // la Taladora persigue al inicio
  hudCache = {};

  const tutorialDone = loadNumber(TUTORIAL_KEY) === 1;
  tutorial = (forceTutorial || !tutorialDone)
    ? { rows: ["log", "branch", "truck"], step: 0, active: true }
    : null;

  // Distancia de gracia antes del primer obstáculo (hallazgo de usabilidad).
  nextRowZ = tutorial ? 40 : 55;

  buildScenery();
  hidePrompt();
  ui.banner.hidden = true;
  ui.pauseOverlay.hidden = true;

  showOnly(gamePanel);
  updateHUD(true);

  state = "countdown";
  musicStop();
  musicStart(true);
  countdownTime = 3;
  ui.countdown.hidden = false;
  ui.countdown.textContent = "3";
  sfx.tick();

  lastFrame = performance.now();
  rafId = requestAnimationFrame(loop);
}

function setupCanvas() {
  // El lienzo toma el tamaño real que le da el CSS (escritorio 16:9, celular pantalla completa).
  const rect = canvas.getBoundingClientRect();
  W = Math.max(280, Math.round(rect.width || 800));
  H = Math.max(240, Math.round(rect.height || 450));
  IS_PORTRAIT = H > W * 1.05;

  if (IS_PORTRAIT) {
    // Celular vertical: cámara más alta y más cerca, como Subway Surfers en móvil.
    // Celular vertical: cámara baja, justo detrás de Nuez (como en el computador),
    // con neblina para que no se vea el camino desde muy lejos.
    FOCAL = W * 1.15;
    CAM_H = 2.4;
    VIEW_DIST = 62;
    TREE_SCALE = 1.7;   // árboles más altos que llenan la parte superior de la pantalla
  } else {
    CAM_H = 2.4;
    FOCAL = Math.min(W * 0.65, H * 1.16);
    VIEW_DIST = DRAW_DIST;
    TREE_SCALE = 1;
  }
  // Los pies de Nuez quedan siempre cerca del borde inferior.
  HORIZON = H * (IS_PORTRAIT ? 0.84 : 0.88) - CAM_H * FOCAL / CAM_BACK;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function handleResize() {
  if (gamePanel.hidden) return;
  setupCanvas();
  if (state !== "running") draw();
}
window.addEventListener("resize", handleResize);
window.addEventListener("orientationchange", () => setTimeout(handleResize, 250));

// ---------------------------------------------------------------------
// 8. Entrada: teclado y gestos táctiles
// ---------------------------------------------------------------------
function moveLane(dir) {
  if (state !== "running") return;
  const target = clamp(player.lane + dir, 0, 2);
  if (target === player.lane) {
    // Golpe contra el borde del bosque: pequeño tropiezo visual sin castigo.
    player.stumbleAnim = 0.2;
    return;
  }
  player.prevLane = player.lane;
  player.lane = target;
  sfx.lane();
}

function jump() {
  if (state !== "running") return;
  if (player.grounded) {
    player.vy = activePowers.jump ? SUPER_JUMP_V : JUMP_V;
    player.grounded = false;
    player.rollTime = 0;
    sfx.jump();
  }
}

function roll() {
  if (state !== "running") return;
  if (!player.grounded) {
    // En el aire: caída rápida y luego rodar (como en Subway Surfers).
    player.vy = -22;
  }
  player.rollTime = ROLL_TIME;
  sfx.roll();
}

const KEY_ACTIONS = {
  ArrowLeft: () => moveLane(-1), KeyA: () => moveLane(-1),
  ArrowRight: () => moveLane(1), KeyD: () => moveLane(1),
  ArrowUp: jump, KeyW: jump, Space: jump,
  ArrowDown: roll, KeyS: roll
};

window.addEventListener("keydown", (event) => {
  if (state === "running" && KEY_ACTIONS[event.code]) {
    event.preventDefault();
    if (!event.repeat) KEY_ACTIONS[event.code]();
    return;
  }
  if ((state === "running" || state === "countdown") && ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === "KeyP" || event.code === "Escape") {
    if (state === "running" || state === "countdown") pauseGame();
    else if (state === "paused") resumeGame();
  }
  if (event.code === "KeyM") toggleMute();
  if (event.code === "KeyN") toggleMusic();
  if (event.code === "Enter" && state === "over" && !resultPanel.hidden) startGame();
});

// Gestos: deslizar para moverse, tocar para saltar.
let touchStart = null;
canvas.addEventListener("pointerdown", (e) => {
  touchStart = { x: e.clientX, y: e.clientY, t: performance.now(), used: false };
});
canvas.addEventListener("pointermove", (e) => {
  if (!touchStart || touchStart.used) return;
  handleSwipe(e.clientX - touchStart.x, e.clientY - touchStart.y, false);
});
canvas.addEventListener("pointerup", (e) => {
  if (!touchStart) return;
  if (!touchStart.used) handleSwipe(e.clientX - touchStart.x, e.clientY - touchStart.y, true);
  touchStart = null;
});
canvas.addEventListener("pointercancel", () => { touchStart = null; });

function handleSwipe(dx, dy, released) {
  const threshold = 28;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) {
    if (released) jump(); // toque simple = saltar
    return;
  }
  touchStart.used = true;
  if (ax > ay) moveLane(dx > 0 ? 1 : -1);
  else if (dy < 0) jump();
  else roll();
}

// ---------------------------------------------------------------------
// 9. Pausa y sonido
// ---------------------------------------------------------------------
function pauseGame() {
  if (state !== "running" && state !== "countdown") return;
  pausedFrom = state;
  state = "paused";
  ui.pauseOverlay.hidden = false;
  musicStop();
  $("resumeButton").focus();
}
let pausedFrom = "running";

function resumeGame() {
  if (state !== "paused") return;
  ui.pauseOverlay.hidden = true;
  state = pausedFrom;
  lastFrame = performance.now();
  musicStart(false);
}

function toggleMute() {
  muted = !muted;
  ui.muteButton.textContent = muted ? "🔇" : "🔊";
  ui.muteButton.setAttribute("aria-label", muted ? "Activar sonido" : "Silenciar");
  // Silenciar apaga todo (efectos y música); al reactivar, la música vuelve si estaba encendida.
  if (muted) musicStop();
  else if (state === "running" || state === "countdown") musicStart(false);
}

window.addEventListener("blur", () => { if (state === "running") pauseGame(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && state === "running") pauseGame(); });

// ---------------------------------------------------------------------
// 10. Generación del recorrido
// ---------------------------------------------------------------------
function difficulty() {
  return clamp(runTime / 150, 0, 1);   // 0 → 1 a lo largo de 2,5 minutos
}

function makeObstacle(type, lane, z) {
  const base = { kind: "obstacle", type, lane, x: LANE_X[lane], z, hit: false, tutorial: false };
  if (type === "log") return { ...base, w: 1.5, h: 0.65, d: 0.7, y0: 0, y1: 0.65 };
  if (type === "branch") return { ...base, w: 1.7, h: 0.55, d: 0.55, y0: 0.85, y1: 2.0 };
  return { ...base, type: "truck", w: 1.6, h: 2.6, d: 7, y0: 0, y1: 2.6, color: pick(["#e5a12f", "#d9772b", "#c9a227"]) };
}

function laneFree(lane, z0, z1) {
  return !entities.some((e) => e.kind === "obstacle" && e.lane === lane && e.z < z1 + 1 && e.z + e.d > z0 - 1);
}

function addAcorn(lane, z, y, golden = false) {
  entities.push({ kind: "acorn", lane, x: LANE_X[lane], y, z, taken: false, golden, phase: Math.random() * 6 });
}

function addAcornLine(lane, zStart, count, arcOverZ = null, y = 0.55) {
  for (let i = 0; i < count; i++) {
    const z = zStart + i * 2.2;
    let ay = y;
    if (arcOverZ !== null) {
      const dz = (z - arcOverZ) / 3.6;
      ay = 0.55 + Math.max(0, 1.5 * (1 - dz * dz));
    }
    if (arcOverZ === null && !laneFree(lane, z - 0.5, z + 0.5)) continue;
    addAcorn(lane, z, ay);
  }
}

function spawnTutorialRow(z) {
  const type = tutorial.rows[tutorial.step];
  tutorial.step++;
  if (type === "truck") {
    const truck = makeObstacle("truck", 1, z);
    truck.tutorial = true;
    truck.lesson = "lane";
    entities.push(truck);
    addAcornLine(0, z - 2, 5);
    addAcornLine(2, z - 2, 5);
  } else {
    // El obstáculo ocupa los tres carriles para que el jugador practique la acción.
    for (let lane = 0; lane < 3; lane++) {
      const obs = makeObstacle(type, lane, z);
      obs.tutorial = true;
      obs.lesson = type === "log" ? "jump" : "roll";
      entities.push(obs);
    }
    if (type === "log") addAcornLine(player.lane, z - 6.6, 7, z + 0.35);
    else addAcornLine(1, z + 3, 4);
  }
}

function spawnRow(z) {
  const d = difficulty();
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  let count = Math.random() < 0.3 + d * 0.45 ? 2 : 1;
  if (d > 0.35 && Math.random() < 0.18 * d) count = 3;

  const types = [];
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    types.push(r < 0.3 + d * 0.15 ? "truck" : r < 0.65 + d * 0.05 ? "log" : "branch");
  }
  // Siempre debe existir al menos un camino posible: con 3 obstáculos, uno no puede ser camión.
  if (count === 3 && types.every((t) => t === "truck")) types[0] = pick(["log", "branch"]);
  if (count === 3 && types.filter((t) => t === "truck").length === 3) types[1] = "log";

  const used = [];
  for (let i = 0; i < count; i++) {
    const lane = lanes[i];
    used.push(lane);
    entities.push(makeObstacle(types[i], lane, z));
  }

  const freeLanes = [0, 1, 2].filter((l) => !used.includes(l));

  placeAcorns(z, used, types, freeLanes);

  // Potenciador ocasional en un carril libre.
  const hasPower = entities.some((e) => e.kind === "power");
  if (!hasPower && freeLanes.length && Math.random() < 0.09) {
    const lane = pick(freeLanes);
    if (laneFree(lane, z + 3, z + 4)) {
      entities.push({ kind: "power", type: pick(Object.keys(POWERS)), lane, x: LANE_X[lane], y: 0.8, z: z + 3.5, taken: false });
    }
  }
}

// ---------------------------------------------------------------------
// 10b. Ubicación de bellotas con riesgo y recompensa
// (Retroalimentación del docente: las bellotas ya no marcan siempre el camino seguro)
// ---------------------------------------------------------------------
function placeAcorns(z, used, types, freeLanes) {
  const d = difficulty();
  const risk = 0.3 + d * 0.5;               // qué tan "tramposas" son las bellotas (sube con el tiempo)
  const laneOf = (type) => used.find((l, i) => types[i] === type);
  const logLane = laneOf("log");
  const branchLane = laneOf("branch");
  const truckLane = laneOf("truck");

  const options = [
    // Tramo sin bellotas: el jugador debe leer los obstáculos por sí mismo.
    { w: 0.18, run: () => {} },
    // Fila segura en un carril libre (más corta y, a veces, cortada).
    { w: freeLanes.length ? 1.1 - risk : 0, run: () => {
      const lane = pick(freeLanes);
      const n = Math.random() < 0.4 ? 3 : 5;
      addAcornLine(lane, z - rand(2, 8), n);
    } },
    // Carnada: bellotas que llevan directo hacia un obstáculo; hay que reaccionar a tiempo.
    { w: risk * 0.9, run: () => {
      const lane = truckLane !== undefined ? truckLane : (logLane !== undefined ? logLane : branchLane);
      if (lane === undefined) return addAcornLine(pick(freeLanes), z - 4, 4);
      addAcornLine(lane, z - 10.5, 4);
      // La bellota dorada queda justo antes del obstáculo: mayor premio, mayor riesgo.
      if (Math.random() < 0.35 * risk && laneFree(lane, z - 4.3, z - 3.8)) addAcorn(lane, z - 4, 0.55, true);
    } },
    // Arco sobre el tronco: solo se recoge saltando.
    { w: logLane !== undefined ? 0.5 : 0, run: () => {
      addAcornLine(logLane, z - 6.6, 7, z + 0.35);
    } },
    // Bajo el árbol caído: solo se recoge rodando.
    { w: branchLane !== undefined ? 0.45 * risk + 0.15 : 0, run: () => {
      for (const dz of [-1.6, 0.25, 2.1]) addAcorn(branchLane, z + dz, 0.3);
      if (Math.random() < 0.3 * risk) addAcorn(branchLane, z + 0.25, 0.3, true);
    } },
    // Bellotas en el aire: hay que saltar en un carril libre.
    { w: freeLanes.length ? 0.35 * risk : 0, run: () => {
      const lane = pick(freeLanes);
      for (let i = 0; i < 4; i++) {
        const zz = z - 6 + i * 1.8;
        if (laneFree(lane, zz - 0.5, zz + 0.5)) addAcorn(lane, zz, 2.1, i === 1 && Math.random() < 0.4 * risk);
      }
    } },
    // Zigzag: la fila cambia de carril y obliga a moverse.
    { w: 0.25 * risk, run: () => {
      let lane = Math.floor(Math.random() * 3);
      for (let i = 0; i < 6; i++) {
        const zz = z - 12 + i * 2;
        if (i === 3) lane = clamp(lane + pick([-1, 1]), 0, 2);
        if (laneFree(lane, zz - 0.5, zz + 0.5)) addAcorn(lane, zz, 0.55);
      }
    } }
  ];

  const total = options.reduce((a, o) => a + Math.max(0, o.w), 0);
  let r = Math.random() * total;
  for (const o of options) {
    r -= Math.max(0, o.w);
    if (r <= 0) { o.run(); return; }
  }
}

function rowGap() {
  const d = difficulty();
  return rand(lerp(17, 12, d), lerp(24, 16, d));
}

// ---------------------------------------------------------------------
// 11. Paisaje (árboles a los lados del sendero)
// ---------------------------------------------------------------------
function buildScenery() {
  scenery = [];
  for (let z = -4; z < DRAW_DIST + 6; z += 4.2) {
    for (const side of [-1, 1]) {
      scenery.push(makeTree(side, z + rand(-1, 1)));
    }
  }
}

function makeTree(side, z) {
  return {
    side,
    x: side * rand(3.6, 7.5),
    z,
    seed: Math.random(),
    size: rand(0.85, 1.3),
    flower: Math.random() < 0.5,
    flowerX: side * rand(2.85, 3.3),
    flowerColor: pick(["#f7a8c4", "#fff2a6", "#e9b7ff", "#ffffff"])
  };
}

// ---------------------------------------------------------------------
// 12. Bucle principal
// ---------------------------------------------------------------------
function loop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  if (state === "countdown") updateCountdown(dt);
  else if (state === "running") update(dt);

  if (state !== "over") {
    draw();
    rafId = requestAnimationFrame(loop);
  }
}

function updateCountdown(dt) {
  const before = Math.ceil(countdownTime);
  countdownTime -= dt;
  const after = Math.ceil(countdownTime);
  player.runPhase += dt * 4;
  if (countdownTime <= 0) {
    ui.countdown.textContent = "¡Corre!";
    sfx.go();
    setTimeout(() => { if (state !== "countdown") ui.countdown.hidden = true; }, 600);
    state = "running";
    if (tutorial) showPrompt("🎓 Tutorial: aprende los 3 movimientos<small>Los golpes no cuentan durante el tutorial</small>", 2.5);
  } else if (after !== before) {
    ui.countdown.textContent = String(after);
    sfx.tick();
  }
}

function update(dt) {
  elapsed += dt;
  if (!tutorial) runTime += dt;

  // Velocidad: más lenta y constante durante el tutorial, luego aumenta gradualmente.
  const targetSpeed = tutorial ? 11 : lerp(13, 28, difficulty());
  speed = lerp(speed, targetSpeed, Math.min(1, dt * 1.5));
  const move = speed * dt;
  distance += move;

  // ----- Nuez -----
  player.runPhase += dt * speed * 0.55;
  player.x = lerp(player.x, LANE_X[player.lane], Math.min(1, dt * 14));
  player.vy -= GRAVITY * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) {
    player.y = 0;
    player.vy = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }
  if (player.rollTime > 0) player.rollTime -= dt;
  if (player.invuln > 0) player.invuln -= dt;
  if (player.stumbleAnim > 0) player.stumbleAnim -= dt;

  camX = lerp(camX, player.x * 0.55, Math.min(1, dt * 6));
  shake = Math.max(0, shake - dt * 3);

  // ----- Taladora -----
  if (chaser.timer > 0) {
    chaser.timer -= dt;
    chaser.z = lerp(chaser.z, -2.4, Math.min(1, dt * 3));
  } else {
    chaser.z = lerp(chaser.z, -4.2, Math.min(1, dt * 1.5));
  }

  // ----- Potenciadores -----
  for (const key of Object.keys(activePowers)) {
    activePowers[key] -= dt;
    if (activePowers[key] <= 0) delete activePowers[key];
  }

  // ----- Mover el mundo -----
  for (const e of entities) e.z -= move;
  for (const t of scenery) {
    t.z -= move;
    if (t.z < -5) Object.assign(t, makeTree(t.side, t.z + DRAW_DIST + 9));
  }
  nextRowZ -= move;
  while (nextRowZ < DRAW_DIST) {
    if (tutorial && tutorial.step < tutorial.rows.length) {
      spawnTutorialRow(nextRowZ);
      nextRowZ += 30;
    } else if (tutorial) {
      break; // esperar a que termine el tutorial antes de generar el recorrido normal
    } else {
      spawnRow(nextRowZ);
      nextRowZ += rowGap();
    }
  }

  // ----- Tutorial: indicaciones contextuales -----
  if (tutorial) updateTutorial();

  // ----- Colisiones y recolección -----
  handleCollectibles(dt, move);
  handleObstacles(move);
  if (state !== "running") return;

  entities = entities.filter((e) => e.z + (e.d || 0) > -4 && !(e.taken));

  // ----- Puntuación -----
  const mult = currentMultiplier();
  score += move * 0.5 * mult;

  // ----- Efectos -----
  for (const f of floaters) { f.life -= dt; f.y -= dt * 40; }
  floaters = floaters.filter((f) => f.life > 0);
  for (const s of sparkles) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 300 * dt; }
  sparkles = sparkles.filter((s) => s.life > 0);

  if (promptTimer > 0) { promptTimer -= dt; if (promptTimer <= 0) hidePrompt(); }
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) ui.banner.hidden = true; }

  updateHUD();
}

function updateTutorial() {
  const lesson = entities.find((e) => e.tutorial && !e.passed && e.z + e.d > -0.5);
  if (lesson && lesson.z < 26 && lesson.z > -0.3) {
    // Las indicaciones cambian según el dispositivo (teclado o pantalla táctil).
    const texts = IS_TOUCH ? {
      jump: "⬆️ ¡SALTA el tronco!<small>Desliza el dedo hacia arriba o toca la pantalla</small>",
      roll: "⬇️ ¡RUEDA bajo el árbol!<small>Desliza el dedo hacia abajo</small>",
      lane: "⬅️ ➡️ ¡CAMBIA de sendero!<small>Desliza el dedo a la izquierda o derecha</small>"
    } : {
      jump: "⬆️ ¡SALTA el tronco!<small>Flecha ↑ · W · Espacio</small>",
      roll: "⬇️ ¡RUEDA bajo el árbol!<small>Flecha ↓ · S</small>",
      lane: "⬅️ ➡️ ¡CAMBIA de sendero!<small>Flechas ← → · A / D</small>"
    };
    showPrompt(texts[lesson.lesson], 0.2);
  }
  for (const e of entities) if (e.tutorial && e.z + e.d < -0.5) e.passed = true;

  const remaining = entities.some((e) => e.tutorial && !e.passed);
  if (tutorial.step >= tutorial.rows.length && !remaining) {
    tutorial = null;
    saveValue(TUTORIAL_KEY, 1);
    showPrompt("✅ ¡Muy bien! Ahora corre de verdad<small>Recoge bellotas para restaurar el bosque</small>", 2.5);
    nextRowZ = Math.max(nextRowZ, 50);
    chaser.timer = 2;
  }
}

function currentMultiplier() {
  return (1 + forestStage) * (activePowers.double ? 2 : 1);
}

// ---------------------------------------------------------------------
// 13. Recolección de bellotas y potenciadores
// ---------------------------------------------------------------------
function handleCollectibles(dt, move) {
  const magnet = !!activePowers.magnet;
  for (const e of entities) {
    if (e.kind !== "acorn" && e.kind !== "power") continue;
    if (e.taken) continue;

    if (magnet && e.kind === "acorn" && e.z < 16 && e.z > -1) {
      e.x = lerp(e.x, player.x, Math.min(1, dt * 7));
      e.y = lerp(e.y, player.y + 0.6, Math.min(1, dt * 7));
      e.z = lerp(e.z, 0, Math.min(1, dt * 4));
    }

    const near = e.z < 0.7 && e.z + move > -0.7 && Math.abs(e.x - player.x) < 0.8 &&
      e.y > player.y - 0.4 && e.y < player.y + (player.rollTime > 0 ? PLAYER_ROLL_H : PLAYER_H) + 0.35;
    if (!near) continue;

    e.taken = true;
    const p = project(e.x, e.y, Math.max(e.z, 0.2));
    if (e.kind === "acorn") {
      const value = e.golden ? 3 : 1;
      acornCount += value;
      score += (e.golden ? 50 : 10) * (activePowers.double ? 2 : 1);
      if (e.golden) {
        sfx.power();
        floaters.push({ x: p.x, y: p.y - 24, text: "🌟 +50 · bellota dorada", color: "#a56c12", life: 1.2 });
      } else {
        sfx.acorn();
      }
      for (let i = 0; i < 6; i++) {
        sparkles.push({ x: p.x, y: p.y, vx: rand(-120, 120), vy: rand(-200, -60), life: rand(0.3, 0.55), color: pick(["#ffd75e", "#fff2a6", "#9bcf83"]) });
      }
      checkForestStage();
    } else {
      const info = POWERS[e.type];
      activePowers[e.type] = info.time;
      sfx.power();
      floaters.push({ x: p.x, y: p.y - 20, text: info.icon + " " + info.name, color: info.color, life: 1.4 });
    }
  }
}

function checkForestStage() {
  let stage = 0;
  FOREST_STAGES.forEach((s, i) => { if (acornCount >= s.at) stage = i; });
  if (stage > forestStage) {
    forestStage = stage;
    sfx.stage();
    showBanner(FOREST_STAGES[stage].name + "  ·  Multiplicador x" + (1 + stage));
  }
}

// ---------------------------------------------------------------------
// 14. Obstáculos: choques frontales y tropiezos laterales
// ---------------------------------------------------------------------
function handleObstacles(move) {
  const pz0 = -0.3;
  const pz1 = 0.3 + move;   // margen según el avance del cuadro (evita "atravesar" obstáculos)
  const height = player.rollTime > 0 ? PLAYER_ROLL_H : PLAYER_H;
  const py0 = player.y;
  const py1 = player.y + height;

  for (const o of entities) {
    if (o.kind !== "obstacle" || o.hit || o.grazed) continue;
    if (!(o.z < pz1 && o.z + o.d > pz0)) continue;
    const dx = Math.abs(player.x - o.x);
    if (dx > o.w / 2 + 0.3) continue;
    if (!(py0 < o.y1 && py1 > o.y0)) continue;

    // ¿Lateral (entrando de lado al carril del obstáculo) o frontal?
    const movingInto = player.lane === o.lane && player.prevLane !== o.lane && dx > 0.45;
    if (movingInto) {
      o.grazed = true;
      stumble(o);
      return;
    }
    if (dx < 0.6) {
      crash(o);
      return;
    }
    // Roce mientras sale del carril: se perdona.
  }
}

function stumble(o) {
  player.lane = player.prevLane;
  player.prevLane = player.lane;
  player.stumbleAnim = 0.35;
  shake = REDUCED_MOTION ? 0 : 0.5;
  sfx.stumble();

  if (o.tutorial) {
    floaters.push({ x: W / 2, y: H * 0.42, text: "¡Cuidado con los lados!", color: "#a33b32", life: 1.2 });
    return;
  }
  if (chaser.timer > 0 && player.invuln <= 0) {
    // Segundo tropiezo con la Taladora encima: pierde una vida.
    loseLife("chaser");
  } else {
    chaser.timer = 6;
    floaters.push({ x: W / 2, y: H * 0.42, text: "⚠️ ¡La Taladora se acerca!", color: "#a33b32", life: 1.4 });
  }
}

function crash(o) {
  o.hit = true;
  if (o.tutorial) {
    // Durante el tutorial no se pierden vidas: se repite la indicación.
    shake = REDUCED_MOTION ? 0 : 0.6;
    sfx.stumble();
    const again = { jump: "¡Casi! Presiona ↑ para saltar", roll: "¡Casi! Presiona ↓ para rodar", lane: "¡Casi! Usa ← → para cambiar de sendero" };
    floaters.push({ x: W / 2, y: H * 0.44, text: again[o.lesson], color: "#a33b32", life: 1.6 });
    return;
  }
  if (player.invuln > 0) return;
  loseLife(o.type);
}

function loseLife(cause) {
  if (activePowers.shield) {
    delete activePowers.shield;
    player.invuln = 1.2;
    sfx.power();
    floaters.push({ x: W / 2, y: H * 0.42, text: "🍃 ¡El escudo te protegió!", color: "#397b46", life: 1.4 });
    return;
  }
  lives--;
  lastCause = cause;
  player.invuln = 2;
  chaser.timer = 4;
  shake = REDUCED_MOTION ? 0 : 1;
  sfx.hit();
  floaters.push({ x: W / 2, y: H * 0.42, text: "💔 −1 vida · " + CAUSES[cause].text, color: "#a33b32", life: 1.6 });
  updateHUD(true);
  if (lives <= 0) endGame(cause);
}

// ---------------------------------------------------------------------
// 15. Fin de partida (indica claramente la causa)
// ---------------------------------------------------------------------
function endGame(cause) {
  state = "over";
  musicStop();
  stopLoop();
  draw();
  hidePrompt();
  ui.banner.hidden = true;

  const finalScore = Math.floor(score);
  const isRecord = finalScore > record;
  if (isRecord) {
    record = finalScore;
    saveValue(RECORD_KEY, record);
  }

  const restored = acornCount >= FOREST_GOAL;
  resultPanel.classList.remove("victory", "defeat");
  resultPanel.classList.add(restored ? "victory" : "defeat");
  ui.resultTitle.textContent = restored ? "🌳 ¡BOSQUE RESTAURADO! 🌳" : "💔 FIN DE LA CARRERA";

  const c = CAUSES[cause] || CAUSES.log;
  ui.resultCause.textContent = c.icon + " " + c.text;
  ui.finalScore.textContent = finalScore;
  ui.finalDistance.textContent = Math.floor(distance) + " m";
  ui.finalAcorns.textContent = acornCount;
  ui.finalForest.textContent = FOREST_STAGES[forestStage].short;

  let msg = restored
    ? "¡Nuez recogió suficientes bellotas para que el bosque vuelva a crecer! "
    : "Recogiste " + acornCount + " de " + FOREST_GOAL + " bellotas para restaurar el bosque. ";
  msg += isRecord ? "🎉 ¡Nuevo récord personal!" : "Récord personal: " + record + " puntos.";
  ui.resultMessage.textContent = msg;
  ui.resultTip.textContent = c.tip;

  exitFullscreen();
  showOnly(resultPanel);
  window.scrollTo({ top: 0, behavior: "instant" });
  $("restartButton").focus();
}

// ---------------------------------------------------------------------
// 16. HUD, avisos y banners
// ---------------------------------------------------------------------
function setText(el, key, value) {
  if (hudCache[key] !== value) {
    hudCache[key] = value;
    el.textContent = value;
  }
}

function updateHUD(force = false) {
  if (force) hudCache = {};
  setText(ui.score, "score", String(Math.floor(score)).padStart(6, "0"));
  setText(ui.acorns, "acorns", String(acornCount));
  setText(ui.multiplier, "mult", String(currentMultiplier()));
  ui.multiplier.parentElement.classList.toggle("boosted", !!activePowers.double);
  setText(ui.lives, "lives", "❤️".repeat(Math.max(lives, 0)) + "🤍".repeat(START_LIVES - Math.max(lives, 0)));
  setText(ui.forestLabel, "forest", FOREST_STAGES[forestStage].name);
  const pct = Math.round(clamp(acornCount / FOREST_GOAL, 0, 1) * 100);
  if (hudCache.pct !== pct) { hudCache.pct = pct; ui.forestFill.style.width = pct + "%"; }

  // Potenciadores activos con barra de tiempo restante.
  const keys = Object.keys(activePowers).sort().join(",");
  if (hudCache.powers !== keys) {
    hudCache.powers = keys;
    ui.powerups.innerHTML = "";
    for (const k of Object.keys(activePowers).sort()) {
      const chip = document.createElement("div");
      chip.className = "power-chip";
      chip.innerHTML = `<span>${POWERS[k].icon}</span><div class="power-bar"><div data-power="${k}"></div></div>`;
      ui.powerups.appendChild(chip);
    }
  }
  for (const bar of ui.powerups.querySelectorAll("[data-power]")) {
    const k = bar.dataset.power;
    if (activePowers[k] !== undefined) {
      bar.style.width = clamp(activePowers[k] / POWERS[k].time, 0, 1) * 100 + "%";
      bar.style.background = POWERS[k].color;
    }
  }
}

function showPrompt(html, seconds) {
  ui.prompt.innerHTML = html;
  ui.prompt.hidden = false;
  promptTimer = seconds;
}
function hidePrompt() {
  ui.prompt.hidden = true;
  promptTimer = 0;
}
function showBanner(text) {
  ui.banner.textContent = text;
  ui.banner.hidden = false;
  // reiniciar la animación
  ui.banner.style.animation = "none";
  void ui.banner.offsetWidth;
  ui.banner.style.animation = "";
  bannerTimer = 2.4;
}

// ---------------------------------------------------------------------
// 17. Proyección en perspectiva
// ---------------------------------------------------------------------
function project(x, y, z) {
  const dz = Math.max(z + CAM_BACK, 0.4);
  const s = FOCAL / dz;
  return { x: W / 2 + (x - camX) * s, y: HORIZON + (CAM_H - y) * s, s };
}

function poly(points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
}

function drawBox(cx, y0, z0, w, h, d, cFront, cSide, cTop) {
  const xl = cx - w / 2;
  const xr = cx + w / 2;
  const y1 = y0 + h;
  const z1 = z0 + d;
  const clipped = z0 < -1.0;
  z0 = Math.max(z0, -1.0);   // recorta lo que ya pasó muy cerca de la cámara (evita "paredes" gigantes)
  if (z1 <= z0) return null;
  const fl = project(xl, y0, z0), fr = project(xr, y0, z0);
  const flt = project(xl, y1, z0), frt = project(xr, y1, z0);
  const bl = project(xl, y0, z1), br = project(xr, y0, z1);
  const blt = project(xl, y1, z1), brt = project(xr, y1, z1);
  if (y1 < CAM_H) poly([flt, frt, brt, blt], cTop);
  if (xl > camX) poly([fl, flt, blt, bl], cSide);
  if (xr < camX) poly([fr, frt, brt, br], cSide);
  // Si el objeto ya pasó a Nuez, no se dibuja la cara frontal "cortada": solo sus lados.
  if (clipped) return null;
  poly([fl, fr, frt, flt], cFront);
  return { fl, fr, flt, frt };
}

// ---------------------------------------------------------------------
// 18. Paleta del bosque (se recupera con las bellotas)
// ---------------------------------------------------------------------
function getForestPalette() {
  const progress = clamp(acornCount / FOREST_GOAL, 0, 1);
  const dry =      { sky: "#f8e8c7", skyTop: "#f3d29b", hill: "#d8c98b", trunk: "#986b45", canopy: "#d58b48", canopyDark: "#b76b3d", soil: "#c49a63", soilDark: "#b78a55", grass: "#b6a25a", grassDark: "#a39050" };
  const waking =   { sky: "#e7f0c9", skyTop: "#bfe0d0", hill: "#b5cf83", trunk: "#8b6841", canopy: "#91b85b", canopyDark: "#6e9b49", soil: "#c39a66", soilDark: "#b28956", grass: "#8fbb5e", grassDark: "#7eaa50" };
  const restored = { sky: "#d9f3d5", skyTop: "#9fd8e8", hill: "#9bcf83", trunk: "#805b3b", canopy: "#5eaa58", canopyDark: "#39834b", soil: "#bf9665", soilDark: "#ad8455", grass: "#5fa552", grassDark: "#4f9447" };
  const pal = {};
  for (const key of Object.keys(dry)) {
    pal[key] = progress <= 0.5
      ? mixColor(dry[key], waking[key], progress * 2)
      : mixColor(waking[key], restored[key], (progress - 0.5) * 2);
  }
  pal.progress = progress;
  return pal;
}

// ---------------------------------------------------------------------
// 19. Dibujo
// ---------------------------------------------------------------------
function draw() {
  const pal = getForestPalette();
  ctx.save();
  if (shake > 0) ctx.translate(rand(-6, 6) * shake, rand(-4, 4) * shake);

  drawSky(pal);
  drawGround(pal);
  drawMist(pal);

  // Ordenar todos los objetos de lejos a cerca.
  const drawables = [];
  for (const t of scenery) if (t.z < DRAW_DIST && t.z > -CAM_BACK + 0.6) drawables.push({ z: t.z, fn: () => drawTree(t, pal) });
  for (const e of entities) {
    if (e.z > DRAW_DIST || e.z + (e.d || 0) < -2.2) continue;
    if (e.kind === "obstacle") drawables.push({ z: e.z + e.d * 0.5, fn: () => drawObstacle(e) });
    else if (e.kind === "acorn") drawables.push({ z: e.z, fn: () => drawAcorn(e) });
    else if (e.kind === "power") drawables.push({ z: e.z, fn: () => drawPower(e) });
  }
  drawables.push({ z: 0.05, fn: drawPlayer });
  drawables.sort((a, b) => b.z - a.z);
  for (const d of drawables) d.fn();

  drawChaser();
  drawEffects();
  ctx.restore();
}

// Neblina del bosque: oculta lo que está lejos (sobre todo en celular vertical).
function drawMist(pal) {
  if (VIEW_DIST >= DRAW_DIST) return;
  const yFar = HORIZON - 30;
  const yNear = project(0, 0, VIEW_DIST - 28).y;
  const g = ctx.createLinearGradient(0, yFar, 0, yNear);
  g.addColorStop(0, pal.sky);
  g.addColorStop(0.55, pal.sky);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-20, yFar, W + 40, yNear - yFar);
}

function fogAlpha(z) {
  return clamp((VIEW_DIST - z) / 18, 0, 1);
}

function drawSky(pal) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(1, pal.sky);
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, HORIZON + 30);

  // Sol
  ctx.fillStyle = mixColor("#f6c85f", "#ffe98a", pal.progress);
  ctx.beginPath();
  ctx.arc(W * 0.8 - camX * 8, Math.min(70, HORIZON * 0.45), 30 + pal.progress * 5, 0, Math.PI * 2);
  ctx.fill();

  // Colinas lejanas con ligero paralaje
  const off = (distance * 0.6) % 2000;
  ctx.fillStyle = pal.hill;
  ctx.beginPath();
  ctx.moveTo(-20, HORIZON + 4);
  for (let x = -20; x <= W + 20; x += 16) {
    const wx = x + off - camX * 20;
    ctx.lineTo(x, HORIZON - 22 - Math.sin(wx * 0.011) * 14 - Math.sin(wx * 0.027) * 6);
  }
  ctx.lineTo(W + 20, HORIZON + 4);
  ctx.closePath();
  ctx.fill();

  // Línea de árboles en el horizonte
  ctx.fillStyle = pal.canopyDark;
  for (let x = -40; x < W + 40; x += 22) {
    const wx = x + ((distance * 1.2) % 22);
    const h = 10 + ((Math.floor((x + distance * 1.2) / 22) * 37) % 9);
    ctx.beginPath();
    ctx.arc(wx - camX * 30, HORIZON - h * 0.4, h * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGround(pal) {
  // Césped de fondo
  ctx.fillStyle = pal.grass;
  ctx.fillRect(-20, HORIZON, W + 40, H - HORIZON + 20);

  // Franjas del suelo para dar sensación de velocidad
  const step = 2;
  const startZ = DRAW_DIST - ((DRAW_DIST + distance) % step);
  for (let z = startZ + step; z > -CAM_BACK + 0.6; z -= step) {
    const zn = Math.max(z - step, -CAM_BACK + 0.5);
    const band = Math.floor((z + distance) / step) % 2 === 0;
    const a = project(-40, 0, z), b = project(40, 0, z), c = project(40, 0, zn), d = project(-40, 0, zn);
    if (band) poly([a, b, c, d], pal.grassDark);
    // Sendero
    const ra = project(-ROAD_HALF, 0, z), rb = project(ROAD_HALF, 0, z), rc = project(ROAD_HALF, 0, zn), rd = project(-ROAD_HALF, 0, zn);
    poly([ra, rb, rc, rd], band ? pal.soil : pal.soilDark);
  }

  // Bordes del sendero (piedras/raíces)
  ctx.strokeStyle = "rgba(90, 60, 30, 0.45)";
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    const far = project(side * ROAD_HALF, 0, DRAW_DIST);
    const near = project(side * ROAD_HALF, 0, -CAM_BACK + 0.6);
    ctx.beginPath();
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(near.x, near.y);
    ctx.stroke();
  }

  // Separadores de carril discontinuos (hojitas)
  ctx.fillStyle = "rgba(255, 245, 220, 0.55)";
  const dash = 4;
  const startD = DRAW_DIST - ((DRAW_DIST + distance) % dash);
  for (let z = startD; z > -CAM_BACK + 1; z -= dash) {
    for (const lx of [-0.85, 0.85]) {
      const a = project(lx - 0.05, 0, z), b = project(lx + 0.05, 0, z);
      const c = project(lx + 0.05, 0, z - 1.6), d = project(lx - 0.05, 0, z - 1.6);
      poly([a, b, c, d], ctx.fillStyle);
    }
  }
}

function drawTree(t, pal) {
  const alpha = fogAlpha(t.z);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Flores al borde del sendero cuando el bosque se recupera
  if (t.flower && pal.progress > 0.45) {
    const f = project(t.flowerX, 0.18, t.z);
    const r = 0.09 * f.s;
    ctx.fillStyle = "#4f9447";
    ctx.fillRect(f.x - r * 0.2, f.y, r * 0.4, r * 2);
    ctx.fillStyle = t.flowerColor;
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5;
      ctx.beginPath();
      ctx.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#f7c948";
    ctx.beginPath();
    ctx.arc(f.x, f.y, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const base = project(t.x, 0, t.z);
  const s = base.s * t.size * TREE_SCALE;
  const isStump = t.seed < 0.35 * (1 - pal.progress * 1.6);   // tocones que desaparecen al restaurar
  const isSapling = !isStump && t.seed < 0.35;

  if (isStump) {
    ctx.fillStyle = pal.trunk;
    ctx.fillRect(base.x - 0.28 * s, base.y - 0.45 * s, 0.56 * s, 0.45 * s);
    ctx.fillStyle = "#d9b98a";
    ctx.beginPath();
    ctx.ellipse(base.x, base.y - 0.45 * s, 0.28 * s, 0.09 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const scale = isSapling ? 0.55 : 1;
    const trunkH = 1.7 * scale;
    ctx.fillStyle = pal.trunk;
    ctx.fillRect(base.x - 0.16 * s * scale, base.y - trunkH * s, 0.32 * s * scale, trunkH * s);
    const cy = base.y - (trunkH + 0.6 * scale) * s;
    ctx.fillStyle = pal.canopyDark;
    ctx.beginPath();
    ctx.arc(base.x - 0.35 * s * scale, cy + 0.25 * s * scale, 0.75 * s * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.canopy;
    ctx.beginPath();
    ctx.arc(base.x + 0.15 * s * scale, cy, 0.9 * s * scale, 0, Math.PI * 2);
    ctx.fill();
    if (pal.progress > 0.25) {
      ctx.fillStyle = "rgba(214, 232, 139, 0.8)";
      ctx.beginPath();
      ctx.arc(base.x + 0.4 * s * scale, cy - 0.35 * s * scale, 0.22 * s * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawObstacle(o) {
  const alpha = fogAlpha(o.z) * (o.hit ? 0.35 : 1);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Sombra
  const sh = project(o.x, 0, o.z + o.d / 2);
  ctx.fillStyle = "rgba(60, 40, 20, 0.25)";
  ctx.beginPath();
  ctx.ellipse(sh.x, sh.y, (o.w / 2 + 0.1) * sh.s, 0.12 * sh.s, 0, 0, Math.PI * 2);
  ctx.fill();

  if (o.type === "log") drawLog(o);
  else if (o.type === "branch") drawBranch(o);
  else drawTruck(o);

  ctx.restore();
}

function drawLog(o) {
  const f = drawBox(o.x, 0, o.z, o.w, o.h, o.d, "#8a5a32", "#6f4526", "#9c6a3d");
  if (!f) return;
  const s = project(o.x, 0, o.z).s;
  // Vetas de corteza
  ctx.strokeStyle = "rgba(60, 35, 15, 0.5)";
  ctx.lineWidth = Math.max(1, s * 0.03);
  for (let i = 1; i < 3; i++) {
    const y = f.fl.y + (f.flt.y - f.fl.y) * (i / 3);
    ctx.beginPath();
    ctx.moveTo(f.fl.x + 4, y);
    ctx.lineTo(f.fr.x - 4, y);
    ctx.stroke();
  }
  // Anillos en los extremos
  const r = (f.fl.y - f.flt.y) / 2;
  for (const p of [f.fl, f.fr]) {
    ctx.fillStyle = "#e2c08d";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - r, r * 0.55, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a8794a";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - r, r * 0.3, r * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Brote verde: símbolo de la temática ecológica
  const top = project(o.x + 0.3, o.h, o.z + o.d / 2);
  ctx.fillStyle = "#68ad55";
  ctx.beginPath();
  ctx.ellipse(top.x, top.y - 0.08 * top.s, 0.1 * top.s, 0.05 * top.s, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawBranch(o) {
  // Postes (tocones) a los lados del carril
  for (const side of [-1, 1]) {
    drawBox(o.x + side * 0.82, 0, o.z + 0.1, 0.2, 1.0, 0.3, "#7a4f2c", "#5f3c20", "#8f6038");
  }
  // Tronco caído a media altura
  const f = drawBox(o.x, 0.95, o.z, o.w + 0.1, 0.42, o.d, "#87582f", "#6a4424", "#9a6b3e");
  if (!f) return;
  // Follaje encima (zona de colisión hasta 2.0)
  const p = project(o.x, 1.5, o.z);
  ctx.fillStyle = "#4f8f45";
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(p.x + i * 0.32 * p.s, p.y - Math.abs(i) * 0.04 * p.s, 0.26 * p.s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#6fb15f";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(p.x + i * 0.4 * p.s, p.y - 0.12 * p.s, 0.18 * p.s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cinta de advertencia para que se lea como "rueda por debajo"
  ctx.fillStyle = "#f2c230";
  const tapeY = f.fl.y - 2;
  ctx.fillRect(f.fl.x, tapeY - 0.07 * p.s, f.fr.x - f.fl.x, 0.07 * p.s);
}

function drawTruck(o) {
  const dark = "#3a2a1a";
  // Ruedas
  for (const side of [-1, 1]) {
    for (const dz of [0.9, 5.5]) {
      const w = project(o.x + side * 0.82, 0.32, o.z + dz);
      ctx.fillStyle = "#2b2b2b";
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, 0.12 * w.s, 0.32 * w.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Carga de troncos (detrás de la cabina)
  drawBox(o.x, 1.1, o.z + 2.4, o.w - 0.1, 1.9, o.d - 2.4, "#8a5a32", "#6f4526", "#9c6a3d");
  // Cabina
  const f = drawBox(o.x, 0.25, o.z, o.w, 2.35, 2.4, o.color, shade(o.color), o.color);
  if (!f) return;
  const left = f.fl.x, right = f.fr.x, top = f.flt.y, bottom = f.fl.y;
  const wdt = right - left, hgt = bottom - top;
  // Parabrisas
  ctx.fillStyle = "#3b5566";
  ctx.fillRect(left + wdt * 0.1, top + hgt * 0.1, wdt * 0.8, hgt * 0.32);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(left + wdt * 0.14, top + hgt * 0.13, wdt * 0.18, hgt * 0.26);
  // Rejilla
  ctx.fillStyle = dark;
  ctx.fillRect(left + wdt * 0.2, top + hgt * 0.55, wdt * 0.6, hgt * 0.18);
  ctx.fillStyle = "#6b6b6b";
  for (let i = 1; i < 6; i++) ctx.fillRect(left + wdt * (0.2 + i * 0.1) - 1, top + hgt * 0.55, 2, hgt * 0.18);
  // Faros
  ctx.fillStyle = "#fff6c2";
  ctx.beginPath();
  ctx.arc(left + wdt * 0.12, top + hgt * 0.64, wdt * 0.06, 0, Math.PI * 2);
  ctx.arc(right - wdt * 0.12, top + hgt * 0.64, wdt * 0.06, 0, Math.PI * 2);
  ctx.fill();
  // Franjas de peligro
  const by = top + hgt * 0.82;
  const bh = hgt * 0.12;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, by, wdt, bh);
  ctx.clip();
  ctx.fillStyle = "#222";
  ctx.fillRect(left, by, wdt, bh);
  ctx.fillStyle = "#f2c230";
  for (let x = left - bh; x < right + bh; x += bh * 1.2) {
    ctx.beginPath();
    ctx.moveTo(x, by + bh);
    ctx.lineTo(x + bh * 0.6, by);
    ctx.lineTo(x + bh * 1.2, by);
    ctx.lineTo(x + bh * 0.6, by + bh);
    ctx.fill();
  }
  ctx.restore();
}

function shade(color) {
  const c = hexToRgb(color);
  return `rgb(${Math.round(c.r * 0.72)}, ${Math.round(c.g * 0.72)}, ${Math.round(c.b * 0.72)})`;
}

function drawAcornShape(x, y, r, squash, golden = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.max(0.25, squash), 1);
  // Nuez
  ctx.fillStyle = golden ? "#f4c430" : "#c98a45";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.25, r * 0.78, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 230, 180, 0.6)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.25, r * 0.1, r * 0.18, r * 0.4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Punta
  ctx.fillStyle = "#8e5a2b";
  ctx.beginPath();
  ctx.arc(0, r * 1.2, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  // Capuchón
  ctx.fillStyle = golden ? "#b8860b" : "#6e4523";
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.35, r * 0.95, r * 0.5, 0, Math.PI, 0);
  ctx.lineTo(r * 0.95, -r * 0.3);
  ctx.ellipse(0, -r * 0.3, r * 0.95, r * 0.18, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = "#5a3618";
  ctx.fillRect(-r * 0.08, -r * 1.05, r * 0.16, r * 0.3);
  ctx.restore();
}

function drawAcorn(a) {
  const alpha = fogAlpha(a.z);
  if (alpha <= 0) return;
  const t = elapsed * 4 + a.phase;
  const p = project(a.x, a.y + Math.sin(t) * 0.06, a.z);
  ctx.save();
  ctx.globalAlpha = alpha;
  // brillo (más intenso en la bellota dorada)
  ctx.fillStyle = a.golden ? "rgba(255, 215, 60, 0.55)" : "rgba(255, 236, 150, 0.35)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, (a.golden ? 0.42 + Math.sin(t * 2) * 0.05 : 0.3) * p.s, 0, Math.PI * 2);
  ctx.fill();
  drawAcornShape(p.x, p.y, (a.golden ? 0.26 : 0.2) * p.s, Math.abs(Math.cos(t * 0.6)), a.golden);
  ctx.restore();
}

function drawPower(pw) {
  const alpha = fogAlpha(pw.z);
  if (alpha <= 0) return;
  const info = POWERS[pw.type];
  const p = project(pw.x, pw.y + Math.sin(elapsed * 3) * 0.1, pw.z);
  const r = 0.34 * p.s;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * (1.35 + Math.sin(elapsed * 6) * 0.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = info.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.stroke();
  ctx.font = `${Math.round(r * 1.15)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(info.icon, p.x, p.y + r * 0.05);
  ctx.restore();
}

// --- Nuez vista desde atrás ---
function drawPlayer() {
  const ground = project(player.x, 0, 0);
  const p = project(player.x, player.y, 0);
  const k = p.s;   // píxeles por unidad

  // Sombra (se achica al saltar)
  const shadowScale = clamp(1 - player.y / 4, 0.35, 1);
  ctx.fillStyle = "rgba(50, 30, 10, 0.3)";
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, 0.42 * k * shadowScale, 0.1 * k * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  if (player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0) ctx.globalAlpha = 0.45;
  if (activePowers.shield) {
    ctx.fillStyle = "rgba(120, 200, 120, 0.22)";
    ctx.strokeStyle = "rgba(80, 160, 80, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 0.6 * k, 0.65 * k, 0.75 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const lean = (LANE_X[player.lane] - player.x) * -0.12 + (player.stumbleAnim > 0 ? Math.sin(player.stumbleAnim * 40) * 0.15 : 0);
  ctx.translate(p.x, p.y);
  ctx.rotate(lean);

  const body = "#a0612f";
  const bodyDark = "#7e4721";
  const tailLight = "#d9a066";

  if (player.rollTime > 0 && player.grounded) {
    // Nuez hecha bolita, rodando
    const r = 0.36 * k;
    ctx.translate(0, -r);
    ctx.rotate(-elapsed * 14);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = tailLight;
    ctx.lineWidth = r * 0.28;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.fillStyle = "#3f8f4e";
    ctx.fillRect(-r * 0.15, -r, r * 0.3, r * 0.5);
    ctx.restore();
    return;
  }

  const run = player.grounded ? Math.sin(player.runPhase) : 0;
  const bob = player.grounded ? Math.abs(Math.cos(player.runPhase)) * 0.04 * k : 0;
  ctx.translate(0, -bob);

  // Piernas
  ctx.fillStyle = bodyDark;
  const legY = player.grounded ? 0 : -0.1 * k;
  ctx.beginPath();
  ctx.ellipse(-0.14 * k, legY - 0.08 * k - run * 0.06 * k, 0.09 * k, 0.12 * k, 0, 0, Math.PI * 2);
  ctx.ellipse(0.14 * k, legY - 0.08 * k + run * 0.06 * k, 0.09 * k, 0.12 * k, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cuerpo
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -0.45 * k, 0.3 * k, 0.38 * k, 0, 0, Math.PI * 2);
  ctx.fill();

  // Brazos
  ctx.fillStyle = bodyDark;
  const armSwing = player.grounded ? run * 0.1 * k : -0.12 * k;
  ctx.beginPath();
  ctx.ellipse(-0.3 * k, -0.5 * k + armSwing, 0.07 * k, 0.15 * k, 0.4, 0, Math.PI * 2);
  ctx.ellipse(0.3 * k, -0.5 * k - armSwing, 0.07 * k, 0.15 * k, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Cabeza
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, -0.92 * k, 0.24 * k, 0, Math.PI * 2);
  ctx.fill();
  // Orejas con mechones
  for (const side of [-1, 1]) {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(side * 0.08 * k, -1.08 * k);
    ctx.lineTo(side * 0.2 * k, -1.32 * k);
    ctx.lineTo(side * 0.24 * k, -1.02 * k);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = bodyDark;
    ctx.beginPath();
    ctx.arc(side * 0.2 * k, -1.32 * k, 0.035 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bufanda verde (cosmético de la propuesta de diseño)
  ctx.fillStyle = "#3f8f4e";
  ctx.beginPath();
  ctx.ellipse(0, -0.72 * k, 0.24 * k, 0.07 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  const flap = Math.sin(elapsed * 12) * 0.05 * k;
  ctx.beginPath();
  ctx.moveTo(-0.1 * k, -0.72 * k);
  ctx.quadraticCurveTo(-0.32 * k, -0.62 * k + flap, -0.42 * k, -0.7 * k - flap);
  ctx.lineTo(-0.36 * k, -0.6 * k);
  ctx.quadraticCurveTo(-0.24 * k, -0.58 * k, -0.06 * k, -0.68 * k);
  ctx.closePath();
  ctx.fill();

  // Cola esponjosa (lo más cercano a la cámara)
  const sway = Math.sin(player.runPhase * 0.5) * 0.05 * k;
  ctx.fillStyle = "#b8743d";
  ctx.beginPath();
  ctx.moveTo(0.05 * k, -0.2 * k);
  ctx.bezierCurveTo(0.55 * k + sway, -0.15 * k, 0.65 * k + sway, -0.9 * k, 0.3 * k + sway, -1.25 * k);
  ctx.bezierCurveTo(0.12 * k + sway, -1.4 * k, -0.08 * k + sway, -1.15 * k, 0.12 * k + sway, -1.0 * k);
  ctx.bezierCurveTo(0.35 * k + sway, -0.8 * k, 0.25 * k, -0.45 * k, -0.05 * k, -0.35 * k);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tailLight;
  ctx.beginPath();
  ctx.moveTo(0.12 * k, -0.3 * k);
  ctx.bezierCurveTo(0.45 * k + sway, -0.3 * k, 0.52 * k + sway, -0.85 * k, 0.3 * k + sway, -1.12 * k);
  ctx.bezierCurveTo(0.42 * k + sway, -0.8 * k, 0.32 * k, -0.45 * k, 0.12 * k, -0.3 * k);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// --- La Taladora (perseguidora) ---
function drawChaser() {
  if (chaser.z < -4.1) return;
  const p = project(player.x * 0.6, 0, chaser.z);
  const k = p.s;
  const w = 1.4 * k;
  const h = 0.9 * k;
  const x = p.x - w / 2;
  const y = p.y - h;

  ctx.save();
  // Cuchilla giratoria
  const bladeR = 0.32 * k;
  ctx.translate(p.x, y + 0.05 * k);
  ctx.rotate(elapsed * 12);
  ctx.fillStyle = "#b9c0c6";
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -bladeR);
    ctx.lineTo(bladeR * 0.25, -bladeR * 0.7);
    ctx.lineTo(-bladeR * 0.1, -bladeR * 0.65);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, bladeR * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6c757d";
  ctx.beginPath();
  ctx.arc(0, 0, bladeR * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Cuerpo amarillo
  ctx.fillStyle = "#e8b425";
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y + 0.1 * k, w, h, 0.12 * k) : ctx.rect(x, y + 0.1 * k, w, h);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.fillRect(x, y + 0.32 * k, w, 0.1 * k);
  ctx.fillStyle = "#f2c230";
  for (let i = 0; i < 10; i++) ctx.fillRect(x + i * w / 10, y + 0.32 * k, w / 20, 0.1 * k);
  // Ojos-faros
  ctx.fillStyle = "#ffef9f";
  ctx.beginPath();
  ctx.arc(x + w * 0.18, y + 0.24 * k, 0.07 * k, 0, Math.PI * 2);
  ctx.arc(x + w * 0.82, y + 0.24 * k, 0.07 * k, 0, Math.PI * 2);
  ctx.fill();
  // Luz de alarma
  if (Math.floor(elapsed * 6) % 2 === 0) {
    ctx.fillStyle = "rgba(230, 60, 40, 0.9)";
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + 0.05 * k, 0.07 * k, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEffects() {
  for (const s of sparkles) {
    ctx.globalAlpha = clamp(s.life * 3, 0, 1);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life * 2, 0, 1);
    ctx.font = 'bold 20px "Segoe UI", "Segoe UI Emoji", Arial, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

// ---------------------------------------------------------------------
// 20. Botones
// ---------------------------------------------------------------------
$("playButton").addEventListener("click", () => startGame(false));
$("tutorialButton").addEventListener("click", () => startGame(true));
$("instructionsButton").addEventListener("click", showInstructions);
$("backButton").addEventListener("click", showMenu);
$("restartButton").addEventListener("click", () => startGame(false));
$("menuButton").addEventListener("click", showMenu);
$("pauseButton").addEventListener("click", () => (state === "paused" ? resumeGame() : pauseGame()));
$("muteButton").addEventListener("click", toggleMute);
$("musicButton").addEventListener("click", toggleMusic);
updateMusicButton();

// Pantalla completa real (oculta las barras del navegador en celulares compatibles).
const fullscreenButton = $("fullscreenButton");
if (!document.documentElement.requestFullscreen) {
  fullscreenButton.hidden = true;
} else {
  fullscreenButton.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else gameArea.requestFullscreen().catch(() => {});
  });
  document.addEventListener("fullscreenchange", () => setTimeout(handleResize, 100));
}
$("resumeButton").addEventListener("click", resumeGame);
$("quitButton").addEventListener("click", showMenu);

// Mostrar el menú al abrir el proyecto.
showMenu();
