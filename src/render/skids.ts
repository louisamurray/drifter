import { config } from '../config';
import type { Bounds } from '../game/track';

/**
 * Persistent rubber. An offscreen canvas covering the course in world space;
 * marks are laid down once and composited under the car every frame. By the
 * end of a run the asphalt is a drawing of where the player drifted.
 */
export class SkidLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  readonly originX: number;
  readonly originY: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  private readonly scale: number;

  /** Covers `bounds` plus `pad` world px on every side. */
  constructor(bounds: Bounds, pad: number) {
    this.originX = bounds.minX - pad;
    this.originY = bounds.minY - pad;
    this.worldWidth = bounds.maxX - bounds.minX + pad * 2;
    this.worldHeight = bounds.maxY - bounds.minY + pad * 2;
    this.scale = config.juice.skidScale;

    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.ceil(this.worldWidth * this.scale);
    this.canvas.height = Math.ceil(this.worldHeight * this.scale);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Skid canvas unavailable');
    this.ctx = ctx;
    ctx.setTransform(
      this.scale,
      0,
      0,
      this.scale,
      -this.originX * this.scale,
      -this.originY * this.scale,
    );
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  /** Lay a rubber segment from (x0,y0) to (x1,y1) at 0..1 intensity. */
  mark(x0: number, y0: number, x1: number, y1: number, intensity: number): void {
    if (intensity <= 0) return;
    const ctx = this.ctx;
    ctx.globalAlpha = config.juice.skidAlpha * intensity;
    ctx.strokeStyle = config.palette.skid;
    ctx.lineWidth = config.juice.skidWidth;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  /** Composite into a world-space context. */
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.canvas, this.originX, this.originY, this.worldWidth, this.worldHeight);
  }
}
