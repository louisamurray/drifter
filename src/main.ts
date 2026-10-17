import { config } from './config';
import { CanvasSurface } from './core/canvas';
import { PointerInput } from './core/input';
import { GameLoop } from './core/loop';
import { createCar, ROAD, stepCar, telemetry, type CarState, type Surface } from './game/car';
import { buildTrack, CIRCUIT, isOffTrack, nearestOnTrack, startPose } from './game/track';
import { createLapState, updateLaps } from './game/laps';
import { createCamera, updateCamera } from './render/camera';
import { beginWorld, drawCar, drawDebug, drawTrack, endWorld } from './render/draw';
import { mountDebugPanel } from './debug/panel';

const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error('#game canvas not found');
}

const surface = new CanvasSurface(canvasEl);
const { ctx, viewport } = surface;
const input = new PointerInput(canvasEl);

const track = buildTrack({ ...CIRCUIT, width: config.track.width, scale: config.track.scale });
const start = startPose(track);
const car = createCar(start.x, start.y, start.heading);
const prev: CarState = { ...car };
const laps = createLapState();
let offTrack = false;
const grass: Surface = config.offTrack;
const camera = createCamera(car);

let frames = 0;
let fpsWindowStart = performance.now();
let fps = 0;

function update(dt: number): void {
  Object.assign(prev, car);
  stepCar(car, input.state, dt, config.physics, offTrack ? grass : ROAD);
  const q = nearestOnTrack(track, car.x, car.y);
  offTrack = isOffTrack(track, q.distance);
  updateLaps(laps, q.s, track.length, dt);
  updateCamera(camera, car, telemetry(car).speed, dt);
}

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

  beginWorld(ctx, viewport, camera);
  drawTrack(ctx, track);
  drawCar(ctx, x, y, heading);
  endWorld(ctx);

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
    safeAreaTop(),
  );
}

function safeAreaTop(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--sat');
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const loop = new GameLoop({ update, render }, config.loop);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) loop.stop();
  else loop.start();
});

if (new URLSearchParams(location.search).has('debug')) {
  mountDebugPanel();
}

loop.start();
