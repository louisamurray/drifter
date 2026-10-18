import './style.css';
import { config } from './config';
import { CanvasSurface } from './core/canvas';
import { TouchControls } from './core/input';
import { GameLoop } from './core/loop';
import type { GameState } from './core/state';
import { autopilot } from './game/autopilot';
import {
  assistYaw,
  cornerLift,
  createCar,
  liftLookahead,
  ROAD,
  stepCar,
  telemetry,
  type CarState,
  type Surface,
} from './game/car';
import type { InputState } from './core/input';
import { createLapState, updateLaps } from './game/laps';
import {
  bankShakeAmplitude,
  createShake,
  SmokePool,
  triggerShake,
  updateShake,
} from './game/particles';
import { createScore, drainEvents, multiplierProgress, updateScore } from './game/scoring';
import {
  buildTrack,
  CIRCUIT,
  isOffTrack,
  minRadiusAhead,
  nearestOnTrack,
  startPose,
} from './game/track';
import { createCamera, moveCameraTo, trackOverview, updateCamera } from './render/camera';
import {
  beginWorld,
  drawCar,
  drawChain,
  drawDebug,
  drawPopups,
  drawSmoke,
  drawTrack,
  endWorld,
  rearWheels,
  type Popup,
} from './render/draw';
import { SkidLayer } from './render/skids';
import { haptic, hapticsDescription } from './core/haptics';
import { fmtScore, Hud } from './render/hud';
import { mountDebugPanel } from './debug/panel';
import { debugState } from './debug/state';
import { loadBest, saveBest } from './storage';
import { AudioEngine } from './audio/audio';

const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error('#game canvas not found');
}

const debug = new URLSearchParams(location.search).has('debug');
const surface = new CanvasSurface(canvasEl);
const { ctx, viewport } = surface;
const input = new TouchControls(canvasEl);
const hud = new Hud(document.body);
const audio = new AudioEngine();
hud.setSound(!audio.muted);

const track = buildTrack({ ...CIRCUIT, width: config.track.width, scale: config.track.scale });
const start = startPose(track);
const grass: Surface = config.offTrack;

// Run state, rebuilt on every restart
const car = createCar(start.x, start.y, start.heading);
const prev: CarState = { ...car };
let laps = createLapState();
let score = createScore();
let offTrack = false;
let roadHeading = start.heading;
let trackIndex = 0;
let popups: Popup[] = [];
let best = loadBest();
let newBest = false;
let countdownLeft = 0;
let playTime = 0;
let lastTick = 0;

const skids = new SkidLayer(track);
const smoke = new SmokePool(config.juice.smokeMax);
const shake = createShake();
let everDrifted = false;

const camera = createCamera(car);
let state: GameState = 'title';

function resetRun(): void {
  Object.assign(car, createCar(start.x, start.y, start.heading));
  Object.assign(prev, car);
  laps = createLapState();
  score = createScore();
  offTrack = false;
  roadHeading = start.heading;
  trackIndex = 0;
  popups = [];
  newBest = false;
  everDrifted = false;
  playTime = 0;
  hud.setZones(false, false, false);
  skids.clear();
  smoke.clear();
  input.reset();
}

function setState(next: GameState): void {
  const from = state;
  state = next;
  hud.show(next);
  if (from === 'paused' && next !== 'paused') audio.resume();
  if (next === 'title') {
    resetRun();
    hud.setTitleBest(best);
    audio.stopEngine();
  } else if (next === 'countdown') {
    resetRun();
    countdownLeft = config.scoring.countdownSeconds;
    hud.setCountdown(countdownLeft);
    lastTick = Math.ceil(countdownLeft) + 1;
    audio.unlock();
    audio.startEngine();
  } else if (next === 'paused') {
    audio.suspend();
  } else if (next === 'gameover') {
    input.reset();
    audio.stopEngine(1.2);
    newBest = score.score > best;
    if (newBest) {
      best = score.score;
      saveBest(best);
    }
    hud.setGameOver(score.score, best, newBest);
  }
}

hud.onStart = () => {
  audio.unlock();
  setState('countdown');
};
hud.onSound = () => {
  audio.unlock();
  hud.setSound(!audio.toggleMuted());
};
// Unlock on both ends of a touch: older iOS only honours the release
for (const type of ['pointerdown', 'pointerup', 'touchend'] as const) {
  canvasEl.addEventListener(
    type,
    () => {
      audio.unlock();
    },
    { passive: true },
  );
}
hud.onRestart = () => {
  setState('countdown');
};
hud.onResume = () => {
  input.reset();
  setState('playing');
};
hud.onShare = () => {
  void share();
};
hud.onPause = () => {
  if (state === 'playing') setState('paused');
};
input.onPauseKey = () => {
  if (state === 'playing') setState('paused');
  else if (state === 'paused') hud.onResume?.();
};

async function share(): Promise<void> {
  const text = `I scored ${fmtScore(score.score)} in Drifter. Can you beat it?`;
  const url = location.origin + location.pathname;
  try {
    const file = await captureFrame();
    if (file && navigator.canShare({ files: [file] })) {
      await navigator.share({ title: 'Drifter', text, files: [file] });
      return;
    }
    await navigator.share({ title: 'Drifter', text, url });
  } catch {
    // Cancelled or unsupported; nothing to do
  }
}

/** The game-over overview, with the run's rubber on it, as a PNG. */
function captureFrame(): Promise<File | null> {
  return new Promise((resolve) => {
    surface.canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], 'drifter.png', { type: 'image/png' }) : null);
    }, 'image/png');
  });
}

// ---- Simulation -----------------------------------------------------------

function stepPhysics(dt: number, ctl: InputState): void {
  Object.assign(prev, car);
  const p = config.physics;
  const assist = assistYaw(car.heading, roadHeading, car.drifting, offTrack, p);
  const forward = telemetry(car).forwardSpeed;
  const lift = cornerLift(forward, minRadiusAhead(track, trackIndex, liftLookahead(forward, p)), p);
  stepCar(car, ctl, dt, p, offTrack ? grass : ROAD, assist, lift);
  const q = nearestOnTrack(track, car.x, car.y);
  trackIndex = q.index;
  const tp = track.points[q.index];
  if (tp) roadHeading = Math.atan2(tp.ty, tp.tx);
  offTrack = isOffTrack(track, q.distance);
  const lapsBefore = laps.laps;
  updateLaps(laps, q.s, track.length, dt);
  const t = telemetry(car);
  layRubber(t.lateralSpeed, dt);
  audio.update({
    speedRatio: t.speed / config.physics.maxSpeed,
    throttle: ctl.throttle,
    drifting: car.drifting,
    handbrake: ctl.handbrake,
    slide: Math.min(1, Math.abs(t.lateralSpeed) / config.juice.fullIntensityLateral),
    offTrack,
  });

  if (state === 'playing') {
    updateScore(
      score,
      {
        drifting: car.drifting,
        offTrack,
        slipAngle: t.slipAngle,
        speed: t.speed,
        lapCompleted: laps.laps > lapsBefore,
        handbrake: ctl.handbrake,
      },
      dt,
    );
    handleScoreEvents();
    if (score.finished) setState('gameover');
  }
  updateCamera(camera, car, t.speed, dt);
}

/** Skid marks and smoke from the rear wheels, scaled by how hard the car is sliding. */
function layRubber(lateralSpeed: number, dt: number): void {
  const intensity = Math.min(1, Math.abs(lateralSpeed) / config.juice.fullIntensityLateral);
  if (!car.drifting || offTrack) return;
  if (!everDrifted) {
    everDrifted = true;
    if (state === 'playing') haptic(10);
  }
  const [ax, ay, bx, by] = rearWheels(car.x, car.y, car.heading);
  const [pax, pay, pbx, pby] = rearWheels(prev.x, prev.y, prev.heading);
  skids.mark(pax, pay, ax, ay, intensity);
  skids.mark(pbx, pby, bx, by, intensity);
  const heat = Math.min(1, Math.abs(telemetry(car).slipAngle) / 0.8);
  const rate = config.juice.smokeRate * intensity;
  smoke.emit(ax, ay, car.vx, car.vy, rate, dt, heat);
  smoke.emit(bx, by, car.vx, car.vy, rate, dt, heat);
}

function handleScoreEvents(): void {
  const cx = viewport.width / 2;
  const cy = viewport.height * config.render.carScreenY;
  for (const e of drainEvents(score)) {
    if (e.type === 'bank') {
      popups.push(popup(`+${fmtScore(e.amount)}`, cx, cy - 70, config.palette.hudText, 34));
      const j = config.juice;
      triggerShake(
        shake,
        bankShakeAmplitude(e.amount, j.shakeBase, j.shakePerDecade, j.shakeMax),
        j.shakeDuration,
      );
      haptic(20);
    } else if (e.type === 'lost') {
      popups.push(
        popup(`+${fmtScore(e.kept)}  ran wide`, cx, cy - 70, 'rgba(242,238,230,0.55)', 20),
      );
    } else if (e.type === 'lap') {
      popups.push(popup(`LAP +${fmtScore(e.bonus)}`, cx, cy - 110, config.palette.edgeLine, 22));
    } else {
      popups.push(popup(`×${String(e.value)}`, cx + 70, cy - 40, config.palette.accent, 26));
      haptic(15);
      audio.play('multiplier');
    }
  }
}

function popup(text: string, x: number, y: number, color: string, size: number): Popup {
  return { text, x, y, age: 0, life: 1.1, color, size };
}

function update(dt: number): void {
  switch (state) {
    case 'title': {
      stepPhysics(dt, autopilot(track, car));
      break;
    }
    case 'countdown': {
      countdownLeft -= dt;
      hud.setCountdown(countdownLeft);
      const tick = Math.ceil(countdownLeft);
      if (tick < lastTick) {
        lastTick = tick;
        audio.play(tick <= 0 ? 'go' : 'tick');
      }
      audio.update({
        speedRatio: 0,
        throttle: 0,
        drifting: false,
        handbrake: false,
        slide: 0,
        offTrack: false,
      });
      Object.assign(prev, car);
      updateCamera(camera, car, 0, dt);
      if (countdownLeft <= -0.4) setState('playing');
      break;
    }
    case 'playing': {
      const ctl = debugState.autopilot
        ? autopilot(track, car, debugState.aggression)
        : input.sample(dt, config.input.steer);
      stepPhysics(dt, ctl);
      playTime += dt;
      hud.setZones(best === 0 && playTime < 5, input.held.left, input.held.right);
      break;
    }
    case 'paused': {
      break;
    }
    case 'gameover': {
      Object.assign(prev, car);
      const o = trackOverview(track, viewport.width, viewport.height);
      moveCameraTo(camera, o.x, o.y, o.zoom, dt);
      break;
    }
  }
  for (const p of popups) p.age += dt;
  popups = popups.filter((p) => p.age < p.life);
  smoke.update(dt);
  updateShake(shake, dt);
}

// ---- Rendering ------------------------------------------------------------

let frames = 0;
let fpsWindowStart = performance.now();
let fps = 0;

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function render(alpha: number): void {
  const { width, height } = viewport;
  ctx.fillStyle = config.palette.offTrack;
  ctx.fillRect(0, 0, width, height);

  const x = prev.x + (car.x - prev.x) * alpha;
  const y = prev.y + (car.y - prev.y) * alpha;
  const heading = lerpAngle(prev.heading, car.heading, alpha);

  beginWorld(ctx, viewport, camera, shake);
  drawTrack(ctx, track);
  skids.draw(ctx);
  drawSmoke(ctx, smoke);
  drawCar(ctx, x, y, heading);
  endWorld(ctx);

  if (state === 'playing') {
    const sx = width / 2 + (x - camera.x) * camera.zoom;
    const sy = height * config.render.carScreenY + (y - camera.y) * camera.zoom;
    drawChain(ctx, sx, sy - 44, score.chain, score.multiplier);
    hud.setPlaying(score.score, score.timeLeft, score.multiplier, multiplierProgress(score));
  }
  drawPopups(ctx, popups);

  if (debug && state !== 'gameover') {
    frames += 1;
    const now = performance.now();
    if (now - fpsWindowStart >= 1000) {
      fps = frames;
      frames = 0;
      fpsWindowStart = now;
    }
    drawDebug(
      ctx,
      viewport,
      car,
      telemetry(car),
      laps,
      offTrack,
      fps,
      input.state.steer,
      input.state.throttle,
      safeAreaTop() + 70,
      `${audio.describe()}  haptics: ${hapticsDescription()}`,
    );
  }
}

function safeAreaTop(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--sat');
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ---- Boot -----------------------------------------------------------------

const loop = new GameLoop({ update, render }, config.loop);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === 'playing') setState('paused');
    audio.suspend();
    loop.stop();
  } else {
    if (state !== 'paused') audio.resume();
    loop.start();
  }
});

if (debug) mountDebugPanel();
setState('title');
loop.start();
