import { describe, expect, it } from 'vitest';
import { createLesson, LESSONS, lessonEight, updateLesson, type Observation } from './lessons';
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
});

/** Drive along the marked eight from parameter `u` for `seconds`, with a fixed slip. */
function eight(s: ReturnType<typeof createLesson>, u: number, seconds: number, slip: number) {
  const speed = 150;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const a = lessonEight(u);
    const b = lessonEight(u + 0.001);
    u += ((speed / 60) * 0.001) / Math.hypot(b.x - a.x, b.y - a.y);
    const p = lessonEight(u);
    updateLesson(s, 'transition', { ...observation(p.x, p.y, slip), speed }, 1 / 60);
  }
  return u;
}
describe('transition lesson on the marked eight', () => {
  it('marks an eight a car can drive at slide speed', () => {
    let tightest = Infinity;
    for (let u = 0; u < Math.PI * 2; u += 0.01) {
      const [a, b, c] = [lessonEight(u - 0.01), lessonEight(u), lessonEight(u + 0.01)];
      const ab = Math.hypot(b.x - a.x, b.y - a.y);
      const bc = Math.hypot(c.x - b.x, c.y - b.y);
      const ca = Math.hypot(a.x - c.x, a.y - c.y);
      const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      if (area2 > 1e-9) tightest = Math.min(tightest, (ab * bc * ca) / (2 * area2));
    }
    expect(tightest).toBeGreaterThanOrEqual(250);
  });
  it('requires an ordered left loop, switch and right slide with movement', () => {
    const s = createLesson('transition');
    let u = eight(s, Math.PI - 0.9, 0.6, 0.5);
    expect(s.stage).toBe(1);
    // Grip the rest of the way to the crossing, then slide right.
    u = eight(s, u, (Math.PI - u) * 4, 0.05);
    eight(s, u, 0.8, -0.5);
    expect(s.complete).toBe(true);
  });
  it('keeps the switch armed until the left slide ends', () => {
    const s = createLesson('transition');
    // Slide left for over six seconds, right up to the crossing, then slide right at once.
    const u = eight(s, Math.PI - (6.3 * 150) / (2 * 300), 6.3, 0.5);
    eight(s, u, 0.7, -0.5);
    expect(s.complete).toBe(true);
  });
  it('drops a left slide that is not linked to a right one within the switch window', () => {
    const s = createLesson('transition');
    const u = eight(s, 0.4, 0.6, 0.5);
    expect(s.stage).toBe(1);
    eight(s, u, LESSONS.transition.switchSeconds + 0.2, 0.05);
    expect(s.stage).toBe(0);
    expect(s.cue).toBe('Link the slides sooner. Slide left, then switch at the crossing.');
  });
  it('counts slides only on the marked eight, and only left before right', () => {
    const away = createLesson('transition');
    for (let i = 0; i < 60; i++)
      updateLesson(away, 'transition', observation(-1100 + i * 2, 1600, 0.5), 1 / 60);
    expect(away.stage).toBe(0);
    const reversed = createLesson('transition');
    eight(reversed, Math.PI + 0.4, 0.6, -0.5);
    expect(reversed.stage).toBe(0);
  });
});
