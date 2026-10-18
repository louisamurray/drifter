import Foundation

struct Vec2 {
    var x: Double
    var y: Double
}

struct Bounds {
    var minX: Double
    var minY: Double
    var maxX: Double
    var maxY: Double

    var width: Double { maxX - minX }
    var height: Double { maxY - minY }
    var centre: Vec2 { Vec2(x: (minX + maxX) / 2, y: (minY + maxY) / 2) }
}

struct TrackDef {
    /// Closed loop of control points in order of travel. Index 0 is the start line.
    var controls: [Vec2]
    /// Control points that get rumble strips (the hardest corners).
    var rumbleAt: [Int]
    var width: Double
    var scale: Double
    var samplesPerSegment: Int
}

struct TrackPoint {
    var x: Double
    var y: Double
    /// Arc length from the start line.
    var s: Double
    /// Unit tangent.
    var tx: Double
    var ty: Double
    /// Signed turn between the segments either side; positive is counter-clockwise.
    var turn: Double
    /// Local radius of the centreline. Infinity on a straight.
    var radius: Double
}

struct RumbleRange {
    var startS: Double
    var endS: Double
    /// +1 outer edge is on the left-hand normal, -1 on the right.
    var side: Double
}

struct Track {
    var points: [TrackPoint]
    var length: Double
    var width: Double
    var rumbles: [RumbleRange]
}

struct TrackQuery {
    var distance: Double
    var s: Double
    var index: Int
}

struct Pose {
    var x: Double
    var y: Double
    var heading: Double
}

/// The circuit: a long straight up the right side, a fast sweeper across the
/// top, a hairpin at top-left, a looping S through the middle, and a wide
/// sweeper home. Drawn at 10 px/m with y down, so y is negated for the y-up world.
let circuitDef = TrackDef(
    controls: [
        (400, 300), (400, -150), (400, -500), (300, -720), (0, -800), (-260, -720), (-470, -540), (-510, -310),
        (-370, -150), (-160, -100), (50, -20), (140, 140), (40, 290), (-200, 340), (-450, 440), (-450, 660),
        (-240, 810), (40, 850), (250, 820), (390, 700),
    ].map { (p: (Int, Int)) in Vec2(x: Double(p.0), y: -Double(p.1)) },
    rumbleAt: [7, 11],
    width: Config.track.width,
    scale: Config.track.scale,
    samplesPerSegment: 12
)

private func wrap<T>(_ arr: [T], _ i: Int) -> T {
    let n = arr.count
    return arr[((i % n) + n) % n]
}

private func catmullRom(_ p0: Vec2, _ p1: Vec2, _ p2: Vec2, _ p3: Vec2, _ t: Double) -> Vec2 {
    let t2 = t * t
    let t3 = t2 * t
    let x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
    let y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    return Vec2(x: x, y: y)
}

func buildTrack(_ def: TrackDef) -> Track {
    let c = def.controls.map { Vec2(x: $0.x * def.scale, y: $0.y * def.scale) }
    var raw: [Vec2] = []
    var controlSampleIndex: [Int] = []
    for i in 0..<c.count {
        controlSampleIndex.append(raw.count)
        let p0 = wrap(c, i - 1), p1 = wrap(c, i), p2 = wrap(c, i + 1), p3 = wrap(c, i + 2)
        for k in 0..<def.samplesPerSegment {
            raw.append(catmullRom(p0, p1, p2, p3, Double(k) / Double(def.samplesPerSegment)))
        }
    }

    var points: [TrackPoint] = []
    points.reserveCapacity(raw.count)
    var s = 0.0
    for i in 0..<raw.count {
        let p = wrap(raw, i), prev = wrap(raw, i - 1), next = wrap(raw, i + 1)
        if i > 0 { s += hypot(p.x - prev.x, p.y - prev.y) }
        var tx = next.x - prev.x
        var ty = next.y - prev.y
        let len = max(hypot(tx, ty), 1e-9)
        tx /= len
        ty /= len
        let inX = p.x - prev.x, inY = p.y - prev.y
        let outX = next.x - p.x, outY = next.y - p.y
        let turn = atan2(inX * outY - inY * outX, inX * outX + inY * outY)
        let step = (hypot(inX, inY) + hypot(outX, outY)) / 2
        let radius = abs(turn) > 1e-6 ? step / abs(turn) : Double.infinity
        points.append(TrackPoint(x: p.x, y: p.y, s: s, tx: tx, ty: ty, turn: turn, radius: radius))
    }
    let last = points[points.count - 1]
    let first = points[0]
    let length = s + hypot(first.x - last.x, first.y - last.y)

    let rumbles: [RumbleRange] = def.rumbleAt.map { ci in
        let centre = controlSampleIndex[ci]
        let half = Int(Double(def.samplesPerSegment) * 0.6)
        let from = wrap(points, centre - half)
        let to = wrap(points, centre + half)
        let side: Double = wrap(points, centre).turn >= 0 ? -1 : 1
        return RumbleRange(startS: from.s, endS: to.s, side: side)
    }

    return Track(points: points, length: length, width: def.width, rumbles: rumbles)
}

/// Nearest point on the closed centreline polyline. Linear scan; ~240 segments is cheap.
func nearestOnTrack(_ track: Track, x: Double, y: Double) -> TrackQuery {
    let pts = track.points
    let n = pts.count
    var bestD2 = Double.infinity
    var bestS = 0.0
    var bestIndex = 0
    for i in 0..<n {
        let a = pts[i]
        let b = pts[(i + 1) % n]
        let abx = b.x - a.x, aby = b.y - a.y
        var segLen2 = abx * abx + aby * aby
        if segLen2 == 0 { segLen2 = 1 }
        var t = ((x - a.x) * abx + (y - a.y) * aby) / segLen2
        t = clamp(t, 0, 1)
        let px = a.x + abx * t, py = a.y + aby * t
        let d2 = (x - px) * (x - px) + (y - py) * (y - py)
        if d2 < bestD2 {
            bestD2 = d2
            bestIndex = i
            let segLen = i == n - 1 ? track.length - a.s : b.s - a.s
            bestS = a.s + segLen * t
        }
    }
    return TrackQuery(distance: bestD2.squareRoot(), s: bestS.truncatingRemainder(dividingBy: track.length), index: bestIndex)
}

/// Tightest centreline radius within `distance` metres ahead of the point at `index`, including that point.
func minRadiusAhead(_ track: Track, index: Int, distance: Double) -> Double {
    let pts = track.points
    let n = pts.count
    let from = pts[index]
    var minimum = from.radius
    for k in 1..<n {
        let p = pts[(index + k) % n]
        let along = (p.s - from.s + track.length).truncatingRemainder(dividingBy: track.length)
        if along > distance { break }
        if p.radius < minimum { minimum = p.radius }
    }
    return minimum
}

func isOffTrack(_ track: Track, distance: Double) -> Bool {
    distance > track.width / 2
}

/// Position and heading on the start line, facing the direction of travel.
func startPose(_ track: Track) -> Pose {
    let p = track.points[0]
    return Pose(x: p.x, y: p.y, heading: atan2(p.ty, p.tx))
}

/// Extent of the centreline. Add the road width for the asphalt itself.
func trackBounds(_ track: Track) -> Bounds {
    var b = Bounds(minX: .infinity, minY: .infinity, maxX: -.infinity, maxY: -.infinity)
    for p in track.points {
        b.minX = min(b.minX, p.x)
        b.minY = min(b.minY, p.y)
        b.maxX = max(b.maxX, p.x)
        b.maxY = max(b.maxY, p.y)
    }
    return b
}
