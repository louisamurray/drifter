import { createSession, type Activity, type LessonId } from './game/session';
import {
  createLesson,
  LESSON_EIGHT,
  LESSONS,
  lessonEight,
  observe,
  updateLesson,
} from './game/lessons';
import {
  CHALLENGE_REVISION,
  CHALLENGE_SCORING,
  CHALLENGE_GATES,
  CHALLENGE_SPAWN,
  createChallenge,
  endChallenge,
  updateChallenge,
  challengeTotal,
  pathPoint,
} from './game/challenge';
import { loadRecord, saveRecord, type RecordIdentity } from './storage';
import './style.css';
import { ASSISTANCE, type AssistanceProfile } from './game/assistance';
import { config } from './config';
import { CanvasSurface } from './core/canvas';
import { TouchControls, type ControlScheme } from './core/input';
import { GameLoop } from './core/loop';
import type { GameMode } from './core/mode';
import type { GameState } from './core/state';
import { autopilot } from './game/autopilot';
import { assistYaw, cornerLift, liftLookahead, type CarState } from './game/car';
import { FORCE_PHYSICS, Handling, type HandlingModel } from './game/handling';
import type { InputState } from './core/input';
import { createLapState, updateLaps } from './game/laps';
import { createLotPilot, insideLot, lotBounds, lotStartPose } from './game/lot';
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
  trackBounds,
  type Bounds,
} from './game/track';
import { createCamera, fitOverview, moveCameraTo, updateCamera } from './render/camera';
import {
  beginWorld,
  drawCar,
  drawChain,
  drawDebug,
  drawGrass,
  drawLot,
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
import {
  loadAssistance,
  saveAssistance,
  loadBest,
  loadMode,
  loadScheme,
  saveBest,
  saveMode,
  saveScheme,
} from './storage';
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
hud.setInstallHint(!isStandalone() && matchMedia('(pointer: coarse)').matches);

// ---- Courses --------------------------------------------------------------

const track = buildTrack({ ...CIRCUIT, width: config.track.width, scale: config.track.scale });
const TRACK_BOUNDS = trackBounds(track);
const lot = config.lot;

/**
 * Where the run happens. On the track the car has a road to follow: assist,
 * corner lift, laps, and grass beyond the edge line. On the lot there is only
 * asphalt and its edge, so `offTrack` means off the slab and nothing steers
 * the car but the player.
 */
let mode: GameMode = loadMode();
let session = createSession('timed', mode);
let lessonState = createLesson('initiate');
let challenge = createChallenge();
const sources = new Set<string>();
let start = startFor(mode);
let timedModel: HandlingModel = 'legacy';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
/** One thumb with automatic throttle, or two thumbs with a gas column. Only the player drives manually. */
let scheme: ControlScheme = loadScheme();
input.scheme = scheme;
input.pad = config.input.pad;
hud.setPadLayout(config.input.pad);
input.safeRight = safeArea('--sar');
input.safeBottom = safeArea('--sab');
window.addEventListener('blur', () => {
  if (state === 'playing' || state === 'countdown') setState('paused');
});
window.addEventListener('resize', () => {
  input.safeRight = safeArea('--sar');
  input.safeBottom = safeArea('--sab');
});

function startFor(m: GameMode): { x: number; y: number; heading: number } {
  return m === 'track' ? startPose(track) : lotStartPose();
}

/** Extent of the asphalt and the margin around it, for the rubber canvas and the overview. */
function courseBounds(m: GameMode): { bounds: Bounds; pad: number } {
  return m === 'track'
    ? { bounds: TRACK_BOUNDS, pad: track.width }
    : { bounds: lotBounds(lot), pad: 40 };
}

/** One rubber canvas per course, built the first time that course is driven. */
const skidLayers = new Map<GameMode, SkidLayer>();
function skidsFor(m: GameMode): SkidLayer {
  let layer = skidLayers.get(m);
  if (!layer) {
    const c = courseBounds(m);
    layer = new SkidLayer(c.bounds, c.pad * 1.5);
    skidLayers.set(m, layer);
  }
  return layer;
}

// Run state, rebuilt on every restart
let assistance: AssistanceProfile = loadAssistance();
let usedController = false;
const canSaveBest = () => handling.canSaveBest && !usedController;
let handling = new Handling('legacy', start, assistance);
let car = handling.car;
const prev: CarState = { ...car };
let laps = createLapState();
let score = createScore();
let offTrack = false;
let roadHeading = start.heading;
let trackIndex = 0;
let popups: Popup[] = [];
/** Best score per mode. Each keeps its own, and the title lists both. */
const bests: Record<GameMode, number> = { track: loadBest('track'), free: loadBest('free') };
let newBest = false;
let countdownLeft = 0;
let lastTick = 0;
/** What the car looked like it was doing on the last physics step, for the renderer. */
const carLook = { steer: 0, roll: 0, brake: 0 };
let lastControl: InputState = { steer: 0, throttle: 0, handbrake: false };

let skids = skidsFor(mode);
const smoke = new SmokePool(config.juice.smokeMax);
const shake = createShake();
let everDrifted = false;
/** The title ghost's driver on the lot. The circuit's ghost is the stateless autopilot. */
let lotGhost = createLotPilot(lot);

const camera = createCamera(car);
let state: GameState = 'title';

function resetRun(): void {
  handling.reset(start);
  sources.clear();
  challenge = createChallenge();
  lessonState = createLesson(session.lesson ?? 'initiate');
  if (session.activity !== 'timed')
    hud.setActivityFeedback(
      session.lesson
        ? LESSONS[session.lesson].objective
        : session.activity === 'challenge'
          ? 'Cross Start, then follow the targets in order. First corner turns left.'
          : 'Build speed, start a slide, then countersteer to catch it.',
    );
  audio.stopEngine(0);
  usedController = false;
  lastControl = { steer: 0, throttle: 0, handbrake: false };
  Object.assign(carLook, { steer: 0, roll: 0, brake: 0 });
  Object.assign(shake, createShake());
  Object.assign(camera, createCamera(car));
  Object.assign(prev, car);
  laps = createLapState();
  score = createScore();
  offTrack = false;
  roadHeading = start.heading;
  trackIndex = 0;
  popups = [];
  newBest = false;
  everDrifted = false;
  lotGhost = createLotPilot(lot);
  hud.setZones(false, input.held);
  hud.setOffRoad(false);
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
    hud.setBests(canSaveBest() ? bests : { track: 0, free: 0 });
    audio.stopEngine();
  } else if (next === 'countdown') {
    resetRun();
    countdownLeft = config.scoring.countdownSeconds;
    hud.setCountdown(countdownLeft);
    lastTick = Math.ceil(countdownLeft) + 1;
    audio.unlock();
    audio.startEngine();
  } else if (next === 'paused') {
    input.reset();
    audio.suspend();
  } else if (next === 'gameover') {
    input.reset();
    audio.stopEngine(1.2);
    if (session.activity === 'practice' || session.activity === 'lesson') {
      hud.setPracticeOverview();
      return;
    }
    if (session.activity === 'challenge') {
      const identity = challengeIdentity();
      const previousBest = loadRecord(identity);
      const eligible =
        challenge.finished &&
        challenge.next === CHALLENGE_GATES.length &&
        sources.size === 1 &&
        !debug;
      const saved =
        eligible &&
        (challengeTotal(challenge) <= previousBest ||
          saveRecord(identity, challengeTotal(challenge)));
      hud.setChallengeResults(
        challenge,
        previousBest,
        saved,
        `${assistance === 'assisted' ? 'Assisted' : 'Reduced assistance'} · ${identity.controls} · ${identity.course} · ${identity.physics} / ${identity.scoring}`,
      );
      return;
    }
    newBest = canSaveBest() && score.score > bests[mode];
    if (newBest) {
      bests[mode] = score.score;
      saveBest(mode, score.score);
    }
    hud.setGameOver(score.score, bests[mode], newBest, canSaveBest());
  }
}

/** Switch control scheme from the title screen. */
function setScheme(next: ControlScheme): void {
  if (next === scheme) return;
  scheme = next;
  saveScheme(scheme);
  input.scheme = scheme;
  input.reset();
  hud.setControls(scheme);
}

/** Switch course from the title screen. Each mode keeps its own best. */
function setMode(next: GameMode): void {
  if (next === mode && session.activity === 'timed') return;
  session = createSession('timed', next);
  mode = next;
  handling = new Handling(timedModel, startFor(mode), assistance);
  car = handling.car;
  saveMode(mode);
  start = startFor(mode);
  skids = skidsFor(mode);
  hud.setMode(mode);
  hud.setActivity('timed');

  hud.setAssistance(assistance);
  setState('title');
}

function challengeIdentity(): RecordIdentity {
  return {
    physics: FORCE_PHYSICS,
    scoring: CHALLENGE_SCORING,
    course: CHALLENGE_REVISION,
    assistance,
    controls: [...sources].sort().join('+') || `${input.source}-${scheme}`,
  };
}

function selectActivity(activity: Activity, lesson: LessonId | null = null): void {
  session = createSession(activity, mode, lesson);
  mode = session.course;
  start =
    activity === 'challenge' ? CHALLENGE_SPAWN : lesson ? LESSONS[lesson].spawn : startFor(mode);
  handling = new Handling(session.model, start, assistance);
  car = handling.car;
  skids = skidsFor(mode);
  hud.setMode(mode);
  hud.setActivity(activity, lesson);
  hud.setAssistance(assistance);
  setState('title');
}

function startActivity(): void {
  audio.unlock();
  if (session.activity === 'timed') setState('countdown');
  else {
    resetRun();
    setState('playing');
    audio.startEngine();
  }
}

hud.setAssistance(assistance);
hud.onAssistance = (profile) => {
  if (state !== 'title') return;
  assistance = profile;
  saveAssistance(profile);
  handling = new Handling(handling.model, start, assistance);
  car = handling.car;
  hud.setAssistance(profile);
  setState('title');
};
input.onControllerDisconnect = () => {
  if (state === 'playing' || state === 'countdown') setState('paused');
};
hud.setMode(mode);
hud.onMode = setMode;
hud.setControls(scheme);
hud.onControls = setScheme;
hud.onStart = startActivity;
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
hud.onRestart = startActivity;
hud.onReset = () => {
  if (
    session.activity !== 'timed' &&
    (state === 'playing' || state === 'paused' || state === 'gameover')
  )
    startActivity();
};
input.onResetKey = () => hud.onReset?.();
hud.onExit = () => {
  if (state !== 'paused' || session.activity === 'timed') return;
  if (session.activity === 'challenge') endChallenge(challenge);
  setState('gameover');
};
hud.onTitle = () => {
  setState('title');
};
hud.onActivity = (activity) => {
  selectActivity(activity);
};
hud.onLesson = (id) => {
  selectActivity('lesson', id);
};
hud.onLeaveLesson = () => {
  if (session.activity !== 'lesson') return;
  session = createSession('practice', 'free');
  hud.setActivity('practice');
  input.reset();
  if (state === 'paused') setState('playing');
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
input.onConfirmKey = () => {
  if (state === 'title') hud.onStart?.();
  else if (state === 'gameover') hud.onRestart?.();
  else if (state === 'paused') hud.onResume?.();
};
input.onPauseKey = () => {
  if (state === 'playing') setState('paused');
  else if (state === 'paused') hud.onResume?.();
};

async function share(): Promise<void> {
  const where = mode === 'track' ? 'in Drifter' : "in Drifter's open lot";
  const text =
    session.activity === 'practice' || session.activity === 'lesson'
      ? 'My practice drawing in Drifter.'
      : session.activity === 'challenge'
        ? `Drifter challenge: ${fmtScore(challengeTotal(challenge))} · ${assistance} · ${CHALLENGE_REVISION}`
        : canSaveBest()
          ? `I scored ${fmtScore(score.score)} ${where}. Can you beat it?`
          : `Handling prototype ${where}`;
  const url = location.origin + location.pathname;
  try {
    const file = await captureFrame();
    if (typeof navigator.share === 'function') {
      if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }))
        await navigator.share({ title: 'Drifter', text, files: [file] });
      else await navigator.share({ title: 'Drifter', text, url });
      hud.setShareStatus('Drawing shared.');
    } else if (file) {
      const href = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'drifter.png';
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(href);
      }, 1000);
      hud.setShareStatus('Drawing downloaded. Your result stays here.');
    } else
      hud.setShareStatus(
        'Could not capture the drawing. Retry and Back to title are still available.',
      );
  } catch (error) {
    hud.setShareStatus(
      error instanceof DOMException && error.name === 'AbortError'
        ? 'Share cancelled. Your result stays here.'
        : 'Sharing unavailable. Your result stays here; try again.',
    );
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

/**
 * `manual` means the player is on the gas pedal: no corner lift, and tail
 * lights when they lift. `pointed` means a thumb is on the stick: the stick
 * owns the heading, so road assist stays out of it until the thumb lets go.
 */
function stepPhysics(dt: number, ctl: InputState, manual = false, pointed = false): void {
  lastControl = { ...ctl };
  Object.assign(prev, car);
  const p = config.physics;
  const onRoad = mode === 'track';
  const assist =
    onRoad && !pointed ? assistYaw(car.heading, roadHeading, car.drifting, offTrack, p) : 0;
  const forward = handling.telemetry().forwardSpeed;
  const lift =
    onRoad && !manual
      ? cornerLift(forward, minRadiusAhead(track, trackIndex, liftLookahead(forward, p)), p)
      : 0;
  handling.step(ctl, dt, { offTrack, roadYaw: assist, lift, counterSteer: 1 });
  carLook.steer = handling.appliedWheelAngle;
  carLook.brake = ctl.handbrake
    ? 1
    : Math.max(lift * ASSISTANCE[assistance].cornerBraking, manual && ctl.throttle < 0.5 ? 0.6 : 0);
  const lapsBefore = laps.laps;
  if (onRoad) {
    const q = nearestOnTrack(track, car.x, car.y);
    trackIndex = q.index;
    const tp = track.points[q.index];
    if (tp) roadHeading = Math.atan2(tp.ty, tp.tx);
    offTrack = isOffTrack(track, q.distance);
    updateLaps(laps, q.s, track.length, dt);
  } else {
    offTrack = !insideLot(lot, car.x, car.y);
  }
  const t = handling.telemetry();
  carLook.roll = Math.max(-1, Math.min(1, t.lateralSpeed / config.juice.fullIntensityLateral));
  layRubber(t.lateralSpeed, dt);
  audio.update({
    speedRatio: t.speed / handling.referenceSpeed,
    throttle: ctl.throttle,
    drifting: car.drifting,
    handbrake: ctl.handbrake,
    slide:
      handling.model === 'force'
        ? handling.feedback().utilisation
        : Math.min(1, Math.abs(t.lateralSpeed) / config.juice.fullIntensityLateral),
    wheelspin: handling.feedback().wheelspin,
    offTrack,
  });

  if (state === 'playing' && session.activity === 'timed') {
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
  if (state === 'playing' && session.activity !== 'timed') {
    const observation = observe(car, t, offTrack);
    if (session.activity === 'lesson' && session.lesson) {
      const wasComplete = lessonState.complete;
      updateLesson(lessonState, session.lesson, observation, dt);
      hud.setActivityFeedback(
        lessonState.cue,
        lessonState.complete ? 1 : lessonState.held / LESSONS[session.lesson].duration,
      );
      if (lessonState.complete && !wasComplete) {
        setState('paused');
        hud.setLessonComplete();
      }
    } else if (session.activity === 'challenge') {
      updateChallenge(challenge, observation, dt);
      const target = CHALLENGE_GATES[challenge.next];
      hud.setActivityFeedback(
        challenge.reason ||
          (target
            ? `Next: ${target.label}${challenge.next < 3 ? ' · slide left' : ' · slide right'}`
            : 'Sequence complete'),
      );
      if (challenge.finished) setState('gameover');
    }
  }
  updateCamera(camera, car, t.speed, dt, handling.referenceSpeed);
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
  const heat = Math.min(1, Math.abs(handling.telemetry().slipAngle) / 0.8);
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
      if (!reducedMotion.matches)
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

/** The course's own driver: laps the circuit, or draws an eight on the lot. */
function ghostInput(dt: number, aggression = 1): InputState {
  return mode === 'track' ? autopilot(track, car, aggression) : lotGhost(car, dt);
}

function update(dt: number): void {
  input.pollController();
  switch (state) {
    case 'title': {
      // Title drivers remain calibrated to legacy handling, independently of the selected activity.
      if (handling.model === 'legacy') stepPhysics(dt, ghostInput(dt));
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
      const manual =
        !debugState.autopilot && (scheme === 'pedals' || input.source === 'controller');
      if (!debugState.autopilot && input.source === 'controller') usedController = true;
      const force = handling.model === 'force';
      input.pad = {
        ...config.input.pad,
        stickFullAngle: force ? config.input.force.stickFullAngle : config.input.pad.stickFullAngle,
      };
      input.carHeading = car.heading;
      const ctl = debugState.autopilot
        ? ghostInput(dt, debugState.aggression)
        : input.sample(
            dt,
            force ? config.input.force.steer : config.input.steer,
            force ? config.input.force.throttleSeconds : config.input.throttleSeconds,
            force ? config.input.force.throttleReleaseSeconds : 0,
          );
      sources.add(input.source === 'controller' ? 'controller' : `${input.source}-${scheme}`);
      stepPhysics(dt, ctl, manual, manual && input.held.stick);
      // Hold cues stay up for a new player until their first lap, or first banked chain on the lot
      const learning =
        bests[mode] === 0 && (mode === 'track' ? laps.laps === 0 : score.score === 0);
      hud.setZones(learning, input.held);
      hud.setPad(input.held, input.stick);
      hud.setOffRoad(offTrack);
      break;
    }
    case 'paused': {
      break;
    }
    case 'gameover': {
      Object.assign(prev, car);
      const band = hud.overviewBand();
      const c = courseBounds(mode);
      const o = fitOverview(
        c.bounds,
        c.pad,
        viewport.width,
        viewport.height,
        band.top,
        band.bottom,
      );
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

function drawTargets(): void {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = config.palette.edgeLine;
  ctx.globalAlpha = 0.35;
  ctx.setLineDash([16, 18]);
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const p =
      session.activity === 'lesson' ? lessonEight((i / 100) * Math.PI * 2) : pathPoint(i / 100);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (session.activity === 'lesson') {
    ctx.fillStyle = config.palette.accent;
    ctx.font = '18px Archivo Expanded, sans-serif';
    ctx.fillText('Switch · left to right', LESSON_EIGHT.x + 24, LESSON_EIGHT.y - 24);
    ctx.restore();
    return;
  }
  for (const [i, g] of CHALLENGE_GATES.entries()) {
    const zone = challenge.zones[i];
    ctx.strokeStyle = i === challenge.next ? config.palette.accent : config.palette.edgeLine;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.setLineDash(zone === 'complete' ? [] : [12, 10]);
    ctx.beginPath();
    ctx.moveTo(g.x - g.ny * g.halfWidth, g.y + g.nx * g.halfWidth);
    ctx.lineTo(g.x + g.ny * g.halfWidth, g.y - g.nx * g.halfWidth);
    ctx.stroke();
    ctx.font = '18px Archivo Expanded, sans-serif';
    ctx.fillText(
      `${String(i + 1)} ${g.label}${zone === 'complete' ? ' · Done' : zone === 'missed' ? ' · Missed' : ''}`,
      g.x + 24,
      g.y - 24,
    );
  }
  ctx.restore();
}

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
  drawGrass(ctx, viewport, camera);
  if (mode === 'track') drawTrack(ctx, track);
  else drawLot(ctx, lot);
  skids.draw(ctx);
  if (
    session.activity === 'challenge' ||
    (session.activity === 'lesson' && session.lesson === 'transition')
  )
    drawTargets();
  drawSmoke(ctx, smoke);
  drawCar(ctx, x, y, heading, carLook);
  endWorld(ctx);

  if (state === 'playing') {
    const sx = width / 2 + (x - camera.x) * camera.zoom;
    const sy = height * config.render.carScreenY + (y - camera.y) * camera.zoom;
    if (session.activity === 'timed') drawChain(ctx, sx, sy - 44, score.chain, score.multiplier);
    if (session.activity === 'timed')
      hud.setPlaying(
        score.score,
        score.timeLeft,
        config.scoring.runSeconds,
        score.multiplier,
        multiplierProgress(score),
      );
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
      handling.telemetry(),
      laps,
      offTrack,
      fps,
      lastControl.steer,
      lastControl.throttle,
      safeArea('--sat') + 70,
      `${handling.diagnostics()}\n${mode} ${scheme} ${input.source} ${assistance} · ${audio.describe()}\nhaptics: ${hapticsDescription()}`,
    );
  }
}

/** True when launched from the Home Screen, where no browser toolbar sits under the thumb. */
function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

/** A safe-area inset in CSS px, from the variables the stylesheet sets. */
function safeArea(name: '--sat' | '--sab' | '--sal' | '--sar'): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ---- Boot -----------------------------------------------------------------

const loop = new GameLoop({ update, render }, config.loop);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === 'playing' || state === 'countdown') setState('paused');
    input.reset();
    audio.suspend();
    loop.stop();
  } else {
    if (state !== 'paused') audio.resume();
    loop.start();
  }
});

if (debug)
  mountDebugPanel(
    import.meta.env.DEV
      ? (model: HandlingModel) => {
          timedModel = model;
          start = startFor(mode);
          session = createSession('timed', mode);
          hud.setActivity('timed');
          handling = new Handling(model, start, assistance);
          car = handling.car;
          setState('title');
        }
      : undefined,
  );
setState('title');
loop.start();
