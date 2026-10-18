import { config } from '../config';
import type { CarState, CarTelemetry } from '../game/car';
import type { Lot } from '../game/lot';
import type { Track } from '../game/track';
import type { LapState } from '../game/laps';
import type { Shake, SmokePool } from '../game/particles';
import type { Camera } from './camera';
import type { Viewport } from '../core/canvas';

const UI_FONT = "'Archivo', ui-sans-serif, system-ui, sans-serif";

export function beginWorld(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  cam: Camera,
  shake?: Shake,
): void {
  ctx.save();
  ctx.translate(
    vp.width / 2 + (shake?.x ?? 0),
    vp.height * config.render.carScreenY + (shake?.y ?? 0),
  );
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

export function endWorld(ctx: CanvasRenderingContext2D): void {
  ctx.restore();
}

/** World-space rectangle visible through the camera, with a margin for shake. */
export function visibleWorld(
  vp: Viewport,
  cam: Camera,
  margin = 24,
): { x: number; y: number; w: number; h: number } {
  const w = vp.width / cam.zoom + margin * 2;
  const h = vp.height / cam.zoom + margin * 2;
  return {
    x: cam.x - vp.width / 2 / cam.zoom - margin,
    y: cam.y - (vp.height * config.render.carScreenY) / cam.zoom - margin,
    w,
    h,
  };
}

let grassPattern: CanvasPattern | null = null;

/**
 * Grass texture: mown stripes and sparse specks a few percent off the base
 * olive. Dull enough not to pull the eye off the road, textured enough that
 * running wide still shows motion. Built once, tiled in world space.
 */
function grass(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  if (grassPattern) return grassPattern;
  const size = 96;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const t = tile.getContext('2d');
  if (!t) return config.palette.offTrack;
  const p = config.palette;
  t.fillStyle = p.offTrack;
  t.fillRect(0, 0, size, size);
  t.fillStyle = p.offTrackStripe;
  t.fillRect(0, 0, size, size / 2);
  // Deterministic specks so every tile edge matches its neighbour
  let seed = 7;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 46; i++) {
    t.fillStyle = i % 2 === 0 ? p.offTrackSpeckLight : p.offTrackSpeckDark;
    const w = 2 + Math.round(rand() * 2);
    t.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), w, 2);
  }
  grassPattern = ctx.createPattern(tile, 'repeat');
  return grassPattern ?? p.offTrack;
}

/** Fill the visible world with textured grass. Call inside beginWorld. */
export function drawGrass(ctx: CanvasRenderingContext2D, vp: Viewport, cam: Camera): void {
  const r = visibleWorld(vp, cam);
  ctx.fillStyle = grass(ctx);
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

const EDGE = 6;
const RUMBLE_WIDTH = 10;

function tracePath(ctx: CanvasRenderingContext2D, track: Track): void {
  const pts = track.points;
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

export function drawTrack(ctx: CanvasRenderingContext2D, track: Track): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Soft shadow, then edge line, then asphalt over it, leaves a cream border each side
  tracePath(ctx, track);
  ctx.strokeStyle = config.palette.trackShadow;
  ctx.lineWidth = track.width + EDGE + 10;
  ctx.stroke();
  ctx.strokeStyle = config.palette.edgeLine;
  ctx.lineWidth = track.width + EDGE;
  ctx.stroke();
  ctx.strokeStyle = config.palette.asphalt;
  ctx.lineWidth = track.width;
  ctx.stroke();

  drawRumbles(ctx, track);
  drawStartLine(ctx, track);
}

function drawRumbles(ctx: CanvasRenderingContext2D, track: Track): void {
  const offset = track.width / 2 - RUMBLE_WIDTH / 2;
  ctx.lineCap = 'butt';
  ctx.lineWidth = RUMBLE_WIDTH;
  for (const r of track.rumbles) {
    ctx.beginPath();
    let started = false;
    for (const p of track.points) {
      if (p.s < r.startS || p.s > r.endS) continue;
      const x = p.x + -p.ty * offset * r.side;
      const y = p.y + p.tx * offset * r.side;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = config.palette.edgeLine;
    ctx.stroke();
    ctx.setLineDash([12, 12]);
    ctx.strokeStyle = config.palette.accent;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
}

function drawStartLine(ctx: CanvasRenderingContext2D, track: Track): void {
  const p = track.points[0];
  if (!p) return;
  const nx = -p.ty;
  const ny = p.tx;
  const cells = 8;
  const cell = track.width / cells;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(ny, nx));
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = (i + row) % 2 === 0 ? config.palette.edgeLine : config.palette.asphalt;
      ctx.fillRect(-track.width / 2 + i * cell, -cell + row * cell, cell, cell);
    }
  }
  ctx.restore();
}

/**
 * The open lot: a rounded slab of asphalt drawn like the road, with the same
 * cream edge and soft shadow, and a faint painted ring in the middle to slide
 * around. Nothing else, so the rubber stays the picture.
 */
export function drawLot(ctx: CanvasRenderingContext2D, lot: Lot): void {
  const p = config.palette;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  roundedRect(ctx, -lot.width / 2, -lot.height / 2, lot.width, lot.height, lot.corner);
  ctx.strokeStyle = p.trackShadow;
  ctx.lineWidth = EDGE + 10;
  ctx.stroke();
  ctx.strokeStyle = p.edgeLine;
  ctx.lineWidth = EDGE;
  ctx.stroke();
  ctx.fillStyle = p.asphalt;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, lot.ring, 0, Math.PI * 2);
  ctx.setLineDash([14, 14]);
  ctx.strokeStyle = p.edgeLine;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

const CAR_LENGTH = 40;
const CAR_WIDTH = 20;

/** Per-frame cues that make the car read as driven, not just moved. */
export interface CarLook {
  /** Steering input -1..1; turns the front wheels. */
  steer: number;
  /** Signed lateral speed ratio -1..1; shifts the body on its wheels in a slide. */
  roll: number;
  /** 0..1 tail-light intensity: handbrake or corner lift. */
  brake: number;
}

const STILL: CarLook = { steer: 0, roll: 0, brake: 0 };

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Body outline: wide shoulders at the rear tapering to a rounded nose. */
function bodyPath(ctx: CanvasRenderingContext2D): void {
  const L = CAR_LENGTH / 2;
  const W = CAR_WIDTH / 2;
  const nose = W * 0.72;
  ctx.beginPath();
  ctx.moveTo(-L + 3, -W);
  ctx.lineTo(L * 0.3, -W);
  ctx.quadraticCurveTo(L * 0.8, -W, L - 2, -nose);
  ctx.quadraticCurveTo(L, 0, L - 2, nose);
  ctx.quadraticCurveTo(L * 0.8, W, L * 0.3, W);
  ctx.lineTo(-L + 3, W);
  ctx.quadraticCurveTo(-L, W, -L, W - 3);
  ctx.lineTo(-L, -W + 3);
  ctx.quadraticCurveTo(-L, -W, -L + 3, -W);
  ctx.closePath();
}

function wheel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  angle: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = config.palette.carWheel;
  roundedRect(ctx, -len / 2, -2.6, len, 5.2, 1.6);
  ctx.fill();
  ctx.restore();
}

export function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  look: CarLook = STILL,
): void {
  const p = config.palette;
  const L = CAR_LENGTH / 2;
  const W = CAR_WIDTH / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);

  // Drop shadow, offset down-screen so the car sits on the road rather than in it
  ctx.save();
  ctx.rotate(-heading);
  ctx.translate(2, 4);
  ctx.rotate(heading);
  ctx.fillStyle = p.carShadow;
  bodyPath(ctx);
  ctx.fill();
  ctx.restore();

  // Wheels under the body. Rears sit wider so smoke and rubber visibly come
  // from them; fronts turn with the steer input.
  const rearX = -L * 0.72;
  const frontX = L * 0.52;
  wheel(ctx, rearX, -W * 1.1, 10, 0);
  wheel(ctx, rearX, W * 1.1, 10, 0);
  const steerAngle = look.steer * 0.42;
  wheel(ctx, frontX, -W * 0.98, 8.5, steerAngle);
  wheel(ctx, frontX, W * 0.98, 8.5, steerAngle);

  // Body shifts on its wheels in a slide: a hint of roll without a 3D car
  ctx.translate(0, look.roll * 1.6);

  ctx.fillStyle = p.carBody;
  bodyPath(ctx);
  ctx.fill();
  ctx.strokeStyle = p.carOutline;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Rear wing: a dark bar across the tail
  ctx.fillStyle = p.carWheel;
  roundedRect(ctx, -L + 1, -W * 1.05, 3.2, CAR_WIDTH * 1.05, 1);
  ctx.fill();

  // Glass: windscreen ahead, rear window behind, cream roof between so the
  // lighter patch still points the way the car faces
  ctx.fillStyle = p.carGlass;
  ctx.beginPath();
  ctx.moveTo(L * 0.2, -W * 0.74);
  ctx.lineTo(L * 0.5, -W * 0.56);
  ctx.lineTo(L * 0.5, W * 0.56);
  ctx.lineTo(L * 0.2, W * 0.74);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-L * 0.22, -W * 0.74);
  ctx.lineTo(-L * 0.42, -W * 0.6);
  ctx.lineTo(-L * 0.42, W * 0.6);
  ctx.lineTo(-L * 0.22, W * 0.74);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = p.carRoof;
  ctx.fillRect(-L * 0.22, -W * 0.74, L * 0.42, CAR_WIDTH * 0.74);

  // Headlights
  ctx.fillStyle = p.carRoof;
  ctx.fillRect(L - 4, -nose(W) - 1, 2.5, 3);
  ctx.fillRect(L - 4, nose(W) - 2, 2.5, 3);

  // Tail lights: dim at rest, lit on the handbrake or a corner lift
  const lit = look.brake;
  ctx.fillStyle = p.accent;
  ctx.globalAlpha = 0.35 + 0.65 * lit;
  ctx.fillRect(-L + 0.5, -W * 0.95, 2.2, 4);
  ctx.fillRect(-L + 0.5, W * 0.95 - 4, 2.2, 4);
  if (lit > 0.05) {
    ctx.globalAlpha = 0.2 * lit;
    ctx.beginPath();
    ctx.arc(-L - 1, -W * 0.95 + 2, 4.5, 0, Math.PI * 2);
    ctx.arc(-L - 1, W * 0.95 - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

function nose(halfWidth: number): number {
  return halfWidth * 0.72 - 1.5;
}

export function drawDebug(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  car: CarState,
  t: CarTelemetry,
  laps: LapState,
  offTrack: boolean,
  fps: number,
  steer: number,
  throttle: number,
  safeTop: number,
  extra = '',
): void {
  const lines = [
    `${String(fps)} fps  ${String(vp.width)}x${String(vp.height)} @${String(vp.dpr)}x`,
    `speed ${t.speed.toFixed(0)}  fwd ${t.forwardSpeed.toFixed(0)}  lat ${t.lateralSpeed.toFixed(0)}`,
    `slip ${((t.slipAngle * 180) / Math.PI).toFixed(0)}°  ${car.drifting ? 'DRIFT' : ''}`,
    `steer ${steer.toFixed(2)}  throttle ${String(throttle)}${offTrack ? '  OFF TRACK' : ''}`,
    `lap ${String(laps.laps)}  ${fmt(laps.lapTime)}  best ${laps.bestLap === null ? '--' : fmt(laps.bestLap)}`,
    extra,
  ];
  ctx.fillStyle = car.drifting ? config.palette.accent : config.palette.hudText;
  ctx.font = '600 14px ui-monospace, Menlo, monospace';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, 16, 16 + safeTop + i * 18);
  });
}

function fmt(seconds: number): string {
  return seconds.toFixed(2) + 's';
}

export interface Popup {
  text: string;
  /** Screen-space origin. */
  x: number;
  y: number;
  age: number;
  life: number;
  color: string;
  size: number;
}

/** Floating score text in screen space: rises, holds, then fades. */
export function drawPopups(ctx: CanvasRenderingContext2D, popups: Popup[]): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of popups) {
    const t = p.age / p.life;
    const rise = 40 * Math.min(1, t * 3);
    const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    const scale = t < 0.15 ? 1 + (0.15 - t) * 3 : 1;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `800 ${String(Math.round(p.size * scale))}px ${UI_FONT}`;
    haloText(ctx, p.text, p.x, p.y - rise, p.color);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
}

/** Live chain total beside the car while a chain is open. */
export function drawChain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  chain: number,
  multiplier: number,
): void {
  if (chain <= 0) return;
  const size = 22 + Math.min(18, Math.log10(chain + 1) * 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${String(Math.round(size))}px ${UI_FONT}`;
  haloText(
    ctx,
    `+${String(Math.round(chain))}`,
    x,
    y,
    multiplier > 1 ? config.palette.accent : config.palette.hudText,
  );
  ctx.textAlign = 'start';
}

/** Text with a dark halo so it reads over cream edge lines and grass alike. */
function haloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = config.palette.textHalo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Rear-wheel contact points in world space for a car pose. */
export function rearWheels(
  x: number,
  y: number,
  heading: number,
): [number, number, number, number] {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const back = -CAR_LENGTH * 0.38;
  const half = CAR_WIDTH * 0.55;
  return [
    x + c * back - s * -half,
    y + s * back + c * -half,
    x + c * back - s * half,
    y + s * back + c * half,
  ];
}

/** Smoke puffs in world space. Grow and fade; hotter drifts tint towards the accent. */
export function drawSmoke(ctx: CanvasRenderingContext2D, pool: SmokePool): void {
  for (const p of pool.items) {
    if (!p.alive) continue;
    const t = p.age / p.life;
    const size = p.size + t * 16;
    const alpha = 0.32 * (1 - t) * (1 - t);
    const r = 210 + (255 - 210) * p.heat * 0.6;
    const g = 205 - (205 - 90) * p.heat * 0.6;
    const b = 195 - (195 - 45) * p.heat * 0.6;
    ctx.fillStyle = `rgba(${String(Math.round(r))}, ${String(Math.round(g))}, ${String(Math.round(b))}, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}
