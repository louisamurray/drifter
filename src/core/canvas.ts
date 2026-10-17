import { config } from '../config';

export interface Viewport {
  /** CSS pixel width and height of the canvas. */
  width: number;
  height: number;
  dpr: number;
}

/**
 * Keeps a canvas sized to the window at a capped device pixel ratio.
 * The 2D context is scaled so all drawing happens in CSS pixels.
 */
export class CanvasSurface {
  readonly ctx: CanvasRenderingContext2D;
  readonly viewport: Viewport = { width: 0, height: 0, dpr: 1 };
  private readonly onResize = (): void => {
    this.fit();
  };

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.fit();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  fit(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, config.render.maxDpr);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.viewport.width = width;
    this.viewport.height = height;
    this.viewport.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
  }
}
