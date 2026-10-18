import { config } from '../config';
import type { CarState } from '../game/car';
import type { Track } from '../game/track';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function createCamera(car: CarState): Camera {
  return { x: car.x, y: car.y, zoom: config.camera.zoomRest };
}

/** Exponential smoothing factor for rate r over dt. */
function smooth(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function moveCameraTo(cam: Camera, x: number, y: number, zoom: number, dt: number): void {
  const c = config.camera;
  const k = smooth(c.followRate, dt);
  cam.x += (x - cam.x) * k;
  cam.y += (y - cam.y) * k;
  cam.zoom += (zoom - cam.zoom) * smooth(c.zoomRate, dt);
}

/** Follow the car with velocity lead, zooming out with speed. */
export function updateCamera(cam: Camera, car: CarState, speed: number, dt: number): void {
  const c = config.camera;
  const ratio = Math.min(speed / config.physics.maxSpeed, 1);
  const zoom = c.zoomRest + (c.zoomFast - c.zoomRest) * ratio;
  moveCameraTo(cam, car.x + car.vx * c.leadTime, car.y + car.vy * c.leadTime, zoom, dt);
}

export interface Overview {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Camera target that fits the whole track inside a horizontal band of the
 * screen, for the game-over frame. `bandTop` and `bandBottom` are screen
 * pixels; the overlay's score sits above the band and its buttons below it.
 */
export function trackOverview(
  track: Track,
  viewWidth: number,
  viewHeight: number,
  bandTop = 0,
  bandBottom = viewHeight,
): Overview {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of track.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = track.width;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  const fill = config.camera.overviewFill;
  const bandHeight = Math.max(1, bandBottom - bandTop);
  const zoom = Math.min((viewWidth * fill) / w, (bandHeight * fill) / h);
  // The world origin lands at carScreenY on screen; shift so the track centre
  // sits in the middle of the band instead
  const bandCentre = (bandTop + bandBottom) / 2;
  const screenOffset = bandCentre - config.render.carScreenY * viewHeight;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 - screenOffset / zoom, zoom };
}
