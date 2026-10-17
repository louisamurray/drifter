import { describe, expect, it } from 'vitest';
import { buildTrack, CIRCUIT, isOffTrack, nearestOnTrack, startPose } from './track';

const track = buildTrack(CIRCUIT);

describe('buildTrack', () => {
  it('produces a closed loop with monotonic arc length', () => {
    for (let i = 1; i < track.points.length; i++) {
      const a = track.points[i - 1];
      const b = track.points[i];
      if (!a || !b) throw new Error('missing point');
      expect(b.s).toBeGreaterThan(a.s);
    }
    const last = track.points[track.points.length - 1];
    if (!last) throw new Error('missing point');
    expect(track.length).toBeGreaterThan(last.s);
  });

  it('is between 3 and 6 screen heights long', () => {
    expect(track.length).toBeGreaterThan(844 * 3);
    expect(track.length).toBeLessThan(844 * 6);
  });

  it('never folds back on itself closer than the road width', () => {
    const pts = track.points;
    const minGap = track.width * 1.1;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        if (!a || !b) continue;
        const along = Math.min(Math.abs(a.s - b.s), track.length - Math.abs(a.s - b.s));
        if (along < minGap * 2) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(minGap);
      }
    }
  });

  it('has two rumble ranges with positive extent', () => {
    expect(track.rumbles).toHaveLength(2);
    for (const r of track.rumbles) expect(r.endS).toBeGreaterThan(r.startS);
  });
});

describe('nearestOnTrack', () => {
  it('is on the centreline at the start pose', () => {
    const p = startPose(track);
    const q = nearestOnTrack(track, p.x, p.y);
    expect(q.distance).toBeLessThan(1e-6);
    expect(q.s).toBeLessThan(1);
    expect(isOffTrack(track, q.distance)).toBe(false);
  });

  it('reports off-track just beyond the edge', () => {
    const p = track.points[40];
    if (!p) throw new Error('missing point');
    const d = track.width / 2 + 5;
    const q = nearestOnTrack(track, p.x - p.ty * d, p.y + p.tx * d);
    expect(q.distance).toBeGreaterThan(track.width / 2);
    expect(isOffTrack(track, q.distance)).toBe(true);
  });
});
