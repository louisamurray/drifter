import { describe, expect, it } from 'vitest';
import { createLesson, updateLesson, type Observation } from './lessons';
const observation = (x: number, y = 400, slipAngle = 0.5): Observation => ({
  x,
  y,
  speed: 120,
  forwardSpeed: 100,
  slipAngle,
  yawRate: 0.8,
  offTrack: false,
});
describe('continuous lesson evaluation', () => {
  it('requires actual movement and rejects stationary spins', () => {
    const s = createLesson('initiate');
    for (let i = 0; i < 200; i++) updateLesson(s, 'initiate', observation(0), 1 / 60);
    expect(s.complete).toBe(false);
    for (let i = 0; i < 40; i++) updateLesson(s, 'initiate', observation(i * 2), 1 / 60);
    expect(s.complete).toBe(true);
  });
  it('restarts sustain on angle flicker, reversal, offroad or a spin', () => {
    const s = createLesson('sustain');
    for (let i = 0; i < 200; i++) updateLesson(s, 'sustain', observation(i * 2), 1 / 60);
    expect(s.complete).toBe(false);
    updateLesson(s, 'sustain', observation(400, 400, -0.5), 1 / 60);
    expect(s.held).toBe(0);
    for (let i = 201; i < 450; i++)
      updateLesson(s, 'sustain', observation(i * 2, 400, -0.5), 1 / 60);
    expect(s.complete).toBe(true);
    const off = createLesson('initiate');
    for (let i = 0; i < 100; i++)
      updateLesson(off, 'initiate', { ...observation(i * 2), offTrack: true }, 1 / 60);
    expect(off.complete).toBe(false);
  });
  it('requires an ordered left loop, switch and right slide with movement', () => {
    const s = createLesson('transition');
    for (let i = 0; i < 40; i++)
      updateLesson(s, 'transition', observation(-300 + i * 2, 400, 0.5), 1 / 60);
    expect(s.stage).toBe(1);
    // Move continuously through the switch; a teleport cannot count.
    for (let i = 0; i < 180; i++)
      updateLesson(s, 'transition', observation(-220 + i * 2, 400 - i * 2, 0.05), 1 / 60);
    for (let i = 0; i < 40; i++)
      updateLesson(s, 'transition', observation(140 + i * 2, 40 - i * 2, -0.5), 1 / 60);
    expect(s.complete).toBe(true);
  });
});
