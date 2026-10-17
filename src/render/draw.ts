import { config } from '../config';
import type { CarState, CarTelemetry } from '../game/car';
import type { Camera } from './camera';
import type { Viewport } from '../core/canvas';

const GRID = 120;

export function beginWorld(ctx: CanvasRenderingContext2D, vp: Viewport, cam: Camera): void {
  ctx.save();
  ctx.translate(vp.width / 2, vp.height * config.render.carScreenY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

export function endWorld(ctx: CanvasRenderingContext2D): void {
  ctx.restore();
}

/** Open field: a faint grid so motion and drift angle are readable. */
export function drawField(ctx: CanvasRenderingContext2D, vp: Viewport, cam: Camera): void {
  const halfW = vp.width / 2 / cam.zoom + GRID;
  const halfH = vp.height / cam.zoom + GRID;
  const left = Math.floor((cam.x - halfW) / GRID) * GRID;
  const right = cam.x + halfW;
  const top = Math.floor((cam.y - halfH) / GRID) * GRID;
  const bottom = cam.y + halfH;

  ctx.strokeStyle = 'rgba(232, 220, 196, 0.08)';
  ctx.lineWidth = 1 / cam.zoom;
  ctx.beginPath();
  for (let x = left; x <= right; x += GRID) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = top; y <= bottom; y += GRID) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();

  // Origin marker so the player can find their way back
  ctx.strokeStyle = config.palette.edgeLine;
  ctx.lineWidth = 2 / cam.zoom;
  ctx.beginPath();
  ctx.arc(0, 0, 60, 0, Math.PI * 2);
  ctx.stroke();
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
  ctx.fillStyle = '#0d1016';
  ctx.fillRect(-CAR_LENGTH * 0.42, -CAR_WIDTH * 0.62, 9, CAR_WIDTH * 1.24);
  ctx.fillRect(CAR_LENGTH * 0.18, -CAR_WIDTH * 0.52, 8, CAR_WIDTH * 1.04);

  // Body
  ctx.fillStyle = config.palette.edgeLine;
  ctx.fillRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH);

  // Roof, lighter and forward of centre so heading is unambiguous
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(-CAR_LENGTH * 0.1, -CAR_WIDTH * 0.32, CAR_LENGTH * 0.38, CAR_WIDTH * 0.64);

  ctx.restore();
}

export function drawDebug(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  car: CarState,
  t: CarTelemetry,
  fps: number,
  steer: number,
  throttle: number,
  safeTop: number,
): void {
  const lines = [
    `${String(fps)} fps  ${String(vp.width)}x${String(vp.height)} @${String(vp.dpr)}x`,
    `speed ${t.speed.toFixed(0)}  fwd ${t.forwardSpeed.toFixed(0)}  lat ${t.lateralSpeed.toFixed(0)}`,
    `slip ${((t.slipAngle * 180) / Math.PI).toFixed(0)}°  ${car.drifting ? 'DRIFT' : ''}`,
    `steer ${steer.toFixed(2)}  throttle ${String(throttle)}`,
  ];
  ctx.fillStyle = car.drifting ? config.palette.accent : config.palette.hudText;
  ctx.font = '600 14px ui-monospace, Menlo, monospace';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, 16, 16 + safeTop + i * 18);
  });
}
