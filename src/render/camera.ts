import { config } from '../config';
import type { CarState } from '../game/car';
import type { Bounds } from '../game/track';

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
export function updateCamera(
  cam: Camera,
  car: CarState,
  speed: number,
  dt: number,
  referenceSpeed = config.physics.maxSpeed,
): void {
  const c = config.camera;
  const ratio = Math.min(speed / referenceSpeed, 1);
  const zoom = c.zoomRest + (c.zoomFast - c.zoomRest) * ratio;
  moveCameraTo(cam, car.x + car.vx * c.leadTime, car.y + car.vy * c.leadTime, zoom, dt);
}

export interface Overview {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Camera target that fits `bounds`, plus `pad` world px on every side, inside
 * a horizontal band of the screen, for the game-over frame. `bandTop` and
 * `bandBottom` are screen pixels; the overlay's score sits above the band and
 * its buttons below it.
 */
export function fitOverview(
  bounds: Bounds,
  pad: number,
  viewWidth: number,
  viewHeight: number,
  bandTop = 0,
  bandBottom = viewHeight,
): Overview {
  const w = bounds.maxX - bounds.minX + pad * 2;
  const h = bounds.maxY - bounds.minY + pad * 2;
  const fill = config.camera.overviewFill;
  const bandHeight = Math.max(1, bandBottom - bandTop);
  const zoom = Math.min((viewWidth * fill) / w, (bandHeight * fill) / h);
  // The world origin lands at carScreenY on screen; shift so the course centre
  // sits in the middle of the band instead
  const bandCentre = (bandTop + bandBottom) / 2;
  const screenOffset = bandCentre - config.render.carScreenY * viewHeight;
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2 - screenOffset / zoom,
    zoom,
  };
}
