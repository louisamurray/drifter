import { config } from '../config';
import type { CarState, CarTelemetry } from '../game/car';
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

  // Edge line, then asphalt over it, leaves a cream border each side
  tracePath(ctx, track);
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

const CAR_LENGTH = 40;
const CAR_WIDTH = 20;

export function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);

  // Rear wheels slightly wider than the body, drawn first so the body sits on them
  ctx.fillStyle = config.palette.carWheel;
  ctx.fillRect(-CAR_LENGTH * 0.42, -CAR_WIDTH * 0.62, 9, CAR_WIDTH * 1.24);
  ctx.fillRect(CAR_LENGTH * 0.18, -CAR_WIDTH * 0.52, 8, CAR_WIDTH * 1.04);

  // Body with a dark outline so it reads against the cream edge lines
  ctx.fillStyle = config.palette.carBody;
  ctx.fillRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH);
  ctx.strokeStyle = config.palette.carOutline;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH);

  // Roof, lighter and forward of centre so heading is unambiguous
  ctx.fillStyle = config.palette.carRoof;
  ctx.fillRect(-CAR_LENGTH * 0.1, -CAR_WIDTH * 0.32, CAR_LENGTH * 0.38, CAR_WIDTH * 0.64);

  ctx.restore();
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
    ctx.fillStyle = p.color;
    ctx.font = `800 ${String(Math.round(p.size * scale))}px ${UI_FONT}`;
    ctx.fillText(p.text, p.x, p.y - rise);
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
  ctx.fillStyle = multiplier > 1 ? config.palette.accent : config.palette.hudText;
  ctx.font = `800 ${String(Math.round(size))}px ${UI_FONT}`;
  ctx.fillText(`+${String(Math.round(chain))}`, x, y);
  ctx.textAlign = 'start';
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
