/**
 * Track geometry. A closed loop defined by control points, smoothed with a
 * Catmull-Rom spline into a dense centreline polyline with arc length, plus a
 * width. Everything else (rendering, off-track, laps) queries this.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface TrackDef {
  /** Closed loop of control points, in order of travel. Index 0 is the start line. */
  controls: Vec2[];
  /** Indices of control points that get rumble strips (the hardest corners). */
  rumbleAt: number[];
  width: number;
  scale: number;
  /** Spline samples per control segment. */
  samplesPerSegment: number;
}

export interface TrackPoint extends Vec2 {
  /** Arc length from the start line. */
  s: number;
  /** Unit tangent. */
  tx: number;
  ty: number;
  /** Signed curvature proxy: positive turns clockwise in screen space. */
  turn: number;
}

export interface RumbleRange {
  startS: number;
  endS: number;
  /** +1 outer edge is on the right-hand normal, -1 on the left. */
  side: 1 | -1;
}

export interface Track {
  points: TrackPoint[];
  length: number;
  width: number;
  rumbles: RumbleRange[];
}

export interface TrackQuery {
  /** Unsigned distance from the centreline. */
  distance: number;
  /** Arc length of the nearest centreline point. */
  s: number;
  /** Index of the nearest segment start. */
  index: number;
}

/**
 * The v1 circuit: a long straight up the right side, a fast sweeper across the
 * top, a hairpin at top-left, an S through the middle, and a wide sweeper home.
 */
export const CIRCUIT: TrackDef = {
  controls: [
    { x: 400, y: 250 }, // start line, mid-straight so the opening heading is dead straight
    { x: 400, y: -150 },
    { x: 400, y: -500 },
    { x: 300, y: -720 },
    { x: 0, y: -800 },
    { x: -260, y: -720 },
    { x: -420, y: -560 }, // hairpin
    { x: -430, y: -400 },
    { x: -300, y: -320 },
    { x: -100, y: -250 },
    { x: 60, y: -100 }, // S, tightest corner
    { x: -100, y: 60 },
    { x: -300, y: 160 },
    { x: -430, y: 360 },
    { x: -380, y: 580 },
    { x: -180, y: 720 },
    { x: 80, y: 770 },
    { x: 300, y: 720 },
    { x: 400, y: 600 },
  ],
  rumbleAt: [6, 10],
  width: 120,
  scale: 0.8,
  samplesPerSegment: 12,
};

function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

export function buildTrack(def: TrackDef): Track {
  const c = def.controls.map((p) => ({ x: p.x * def.scale, y: p.y * def.scale }));
  const n = c.length;
  const raw: Vec2[] = [];
  const controlSampleIndex: number[] = [];
  for (let i = 0; i < n; i++) {
    controlSampleIndex.push(raw.length);
    const p0 = at(c, i - 1);
    const p1 = at(c, i);
    const p2 = at(c, i + 1);
    const p3 = at(c, i + 2);
    for (let k = 0; k < def.samplesPerSegment; k++) {
      raw.push(catmullRom(p0, p1, p2, p3, k / def.samplesPerSegment));
    }
  }

  const points: TrackPoint[] = [];
  let s = 0;
  for (let i = 0; i < raw.length; i++) {
    const p = at(raw, i);
    const prev = at(raw, i - 1);
    const next = at(raw, i + 1);
    if (i > 0) s += Math.hypot(p.x - prev.x, p.y - prev.y);
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const inX = p.x - prev.x;
    const inY = p.y - prev.y;
    const outX = next.x - p.x;
    const outY = next.y - p.y;
    const turn = Math.atan2(inX * outY - inY * outX, inX * outX + inY * outY);
    points.push({ x: p.x, y: p.y, s, tx, ty, turn });
  }
  const last = at(points, -1);
  const first = at(points, 0);
  const length = s + Math.hypot(first.x - last.x, first.y - last.y);

  const rumbles: RumbleRange[] = def.rumbleAt.map((ci) => {
    const centre = controlSampleIndex[ci] ?? 0;
    const half = Math.floor(def.samplesPerSegment * 0.6);
    const from = at(points, centre - half);
    const to = at(points, centre + half);
    const side: 1 | -1 = at(points, centre).turn >= 0 ? -1 : 1;
    return { startS: from.s, endS: to.s, side };
  });

  return { points, length, width: def.width, rumbles };
}

function at<T>(arr: T[], i: number): T {
  const n = arr.length;
  const v = arr[((i % n) + n) % n];
  if (v === undefined) throw new Error('empty array');
  return v;
}

/** Nearest point on the closed centreline polyline. Linear scan; ~200 segments is cheap. */
export function nearestOnTrack(track: Track, x: number, y: number): TrackQuery {
  const pts = track.points;
  const n = pts.length;
  let bestD2 = Infinity;
  let bestS = 0;
  let bestIndex = 0;
  for (let i = 0; i < n; i++) {
    const a = at(pts, i);
    const b = at(pts, i + 1);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const segLen2 = abx * abx + aby * aby || 1;
    let t = ((x - a.x) * abx + (y - a.y) * aby) / segLen2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + abx * t;
    const py = a.y + aby * t;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestIndex = i;
      const segLen = i === n - 1 ? track.length - a.s : b.s - a.s;
      bestS = a.s + segLen * t;
    }
  }
  return { distance: Math.sqrt(bestD2), s: bestS % track.length, index: bestIndex };
}

export function isOffTrack(track: Track, distance: number): boolean {
  return distance > track.width / 2;
}

/** Position and heading on the start line, facing the direction of travel. */
export function startPose(track: Track): { x: number; y: number; heading: number } {
  const p = at(track.points, 0);
  return { x: p.x, y: p.y, heading: Math.atan2(p.ty, p.tx) };
}
