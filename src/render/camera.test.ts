import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { lotBounds } from '../game/lot';
import { createCar } from '../game/car';
import { createCamera, updateCamera, fitOverview } from './camera';

describe('expanded lot overview', () => {
  it.each([
    { width: 1280, height: 800, top: 180, bottom: 640 },
    { width: 393, height: 852, top: 180, bottom: 600 },
  ])('keeps the whole asphalt between the HUD and actions at $width × $height', (view) => {
    const bounds = lotBounds(config.lot);
    const camera = fitOverview(bounds, 40, view.width, view.height, view.top, view.bottom);
    for (const x of [bounds.minX, bounds.maxX]) {
      for (const y of [bounds.minY, bounds.maxY]) {
        const screenX = view.width / 2 + (x - camera.x) * camera.zoom;
        const screenY = config.render.carScreenY * view.height + (y - camera.y) * camera.zoom;
        expect(screenX).toBeGreaterThan(0);
        expect(screenX).toBeLessThan(view.width);
        expect(screenY).toBeGreaterThan(view.top);
        expect(screenY).toBeLessThan(view.bottom);
      }
    }
  });
});

it('normalises camera zoom by the selected model reference speed', () => {
  const car = createCar();
  const legacy = createCamera(car);
  const force = createCamera(car);
  updateCamera(legacy, car, 360, 1 / 60);
  updateCamera(force, car, 380, 1 / 60, 380);
  expect(force.zoom).toBe(legacy.zoom);
  const slower = createCamera(car);
  updateCamera(slower, car, 360, 1 / 60, 380);
  expect(slower.zoom).toBeGreaterThan(force.zoom);
});
