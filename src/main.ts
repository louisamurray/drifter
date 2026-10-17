import { config } from './config';
import { CanvasSurface } from './core/canvas';
import { GameLoop } from './core/loop';

const canvasEl = document.getElementById('game');
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error('#game canvas not found');
}

const surface = new CanvasSurface(canvasEl);
const { ctx, viewport } = surface;

// Milestone 0 scene: a square orbiting the centre, so frame pacing is visible.
let angle = 0;
let frames = 0;
let fpsWindowStart = performance.now();
let fps = 0;

function update(dt: number): void {
  angle += dt * 1.5;
}

function render(): void {
  const { width, height } = viewport;
  ctx.fillStyle = config.palette.asphalt;
  ctx.fillRect(0, 0, width, height);

  const radius = Math.min(width, height) * 0.3;
  const cx = width / 2 + Math.cos(angle) * radius;
  const cy = height * 0.6 + Math.sin(angle) * radius;

  ctx.strokeStyle = config.palette.edgeLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(width / 2, height * 0.6, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = config.palette.accent;
  ctx.fillRect(cx - 12, cy - 12, 24, 24);

  frames += 1;
  const now = performance.now();
  if (now - fpsWindowStart >= 1000) {
    fps = frames;
    frames = 0;
    fpsWindowStart = now;
  }
  ctx.fillStyle = config.palette.hudText;
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `${String(fps)} fps  ${String(width)}x${String(height)} @${String(viewport.dpr)}x`,
    16,
    16 + safeAreaTop(),
  );
}

function safeAreaTop(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--sat');
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const loop = new GameLoop({ update, render }, config.loop);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    loop.stop();
  } else {
    loop.start();
  }
});

loop.start();
