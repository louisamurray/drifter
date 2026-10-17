import { config } from '../config';
import type { CarState } from '../game/car';

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

export function updateCamera(cam: Camera, car: CarState, speed: number, dt: number): void {
  const c = config.camera;
  const targetX = car.x + car.vx * c.leadTime;
  const targetY = car.y + car.vy * c.leadTime;
  const k = smooth(c.followRate, dt);
  cam.x += (targetX - cam.x) * k;
  cam.y += (targetY - cam.y) * k;

  const ratio = Math.min(speed / config.physics.maxSpeed, 1);
  const targetZoom = c.zoomRest + (c.zoomFast - c.zoomRest) * ratio;
  cam.zoom += (targetZoom - cam.zoom) * smooth(c.zoomRate, dt);
}
