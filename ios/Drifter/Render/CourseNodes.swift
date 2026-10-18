import SpriteKit

private let edgeWidth = 0.6
private let rumbleWidth = 1.0

private func stroke(_ path: CGPath, color: UIColor, width: Double, z: CGFloat) -> SKShapeNode {
    let n = SKShapeNode(path: path)
    n.strokeColor = color
    n.lineWidth = CGFloat(width)
    n.lineCap = .round
    n.lineJoin = .round
    n.fillColor = .clear
    n.zPosition = z
    n.isAntialiased = true
    return n
}

/// The circuit: soft shadow, cream edge line and asphalt stroked along the
/// centreline, rumble strips on the hardest corners, and a chequered start line.
final class TrackNode: SKNode {
    init(track: Track) {
        super.init()
        let path = CGMutablePath()
        for (i, p) in track.points.enumerated() {
            let pt = CGPoint(x: p.x, y: p.y)
            if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
        }
        path.closeSubpath()

        addChild(stroke(path, color: Palette.trackShadow, width: track.width + edgeWidth + 1.0, z: 0))
        addChild(stroke(path, color: Palette.edgeLine, width: track.width + edgeWidth, z: 1))
        addChild(stroke(path, color: Palette.asphalt, width: track.width, z: 2))

        let offset = track.width / 2 - rumbleWidth / 2
        for r in track.rumbles {
            let rp = CGMutablePath()
            var started = false
            for p in track.points where p.s >= r.startS && p.s <= r.endS {
                // Left normal is (-ty, tx); side +1 puts the strip on it
                let x = p.x + -p.ty * offset * r.side
                let y = p.y + p.tx * offset * r.side
                let pt = CGPoint(x: x, y: y)
                if !started { rp.move(to: pt); started = true } else { rp.addLine(to: pt) }
            }
            let base = stroke(rp, color: Palette.edgeLine, width: rumbleWidth, z: 3)
            base.lineCap = .butt
            addChild(base)
            let dashed = rp.copy(dashingWithPhase: 0, lengths: [1.2, 1.2])
            let stripes = stroke(dashed, color: Palette.accent, width: rumbleWidth, z: 4)
            stripes.lineCap = .butt
            addChild(stripes)
        }

        // Start line: two rows of chequers across the road
        let p0 = track.points[0]
        let cells = 8
        let cell = track.width / Double(cells)
        let cream = CGMutablePath()
        let dark = CGMutablePath()
        for row in 0..<2 {
            for i in 0..<cells {
                let rect = CGRect(x: -track.width / 2 + Double(i) * cell, y: -cell + Double(row) * cell, width: cell, height: cell)
                if (i + row) % 2 == 0 { cream.addRect(rect) } else { dark.addRect(rect) }
            }
        }
        let line = SKNode()
        line.position = CGPoint(x: p0.x, y: p0.y)
        // Cells run across the road: rotate the row onto the left normal
        line.zRotation = CGFloat(atan2(p0.tx, -p0.ty))
        line.zPosition = 3
        let creamNode = SKShapeNode(path: cream)
        creamNode.fillColor = Palette.edgeLine
        creamNode.strokeColor = .clear
        let darkNode = SKShapeNode(path: dark)
        darkNode.fillColor = Palette.asphalt
        darkNode.strokeColor = .clear
        line.addChild(creamNode)
        line.addChild(darkNode)
        addChild(line)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
}

/// The open lot: a rounded slab of asphalt with the same cream edge and soft
/// shadow as the road, a faint painted ring in the middle, and parking bays
/// along the long edges for scale.
final class LotNode: SKNode {
    init(lot: Lot) {
        super.init()
        let rect = CGRect(x: -lot.width / 2, y: -lot.height / 2, width: lot.width, height: lot.height)
        let slab = CGPath(roundedRect: rect, cornerWidth: lot.corner, cornerHeight: lot.corner, transform: nil)
        addChild(stroke(slab, color: Palette.trackShadow, width: edgeWidth + 1.0, z: 0))
        addChild(stroke(slab, color: Palette.edgeLine, width: edgeWidth, z: 1))
        let fill = SKShapeNode(path: slab)
        fill.fillColor = Palette.asphalt
        fill.strokeColor = .clear
        fill.zPosition = 2
        addChild(fill)

        let ring = CGPath(ellipseIn: CGRect(x: -lot.ring, y: -lot.ring, width: lot.ring * 2, height: lot.ring * 2), transform: nil)
        let ringNode = stroke(ring.copy(dashingWithPhase: 0, lengths: [1.4, 1.4]), color: Palette.edgeLine, width: 0.4, z: 3)
        ringNode.lineCap = .butt
        ringNode.alpha = 0.35
        addChild(ringNode)

        let hx = lot.width / 2
        let hy = lot.height / 2 - lot.corner
        let bays = CGMutablePath()
        var y = -hy
        while y <= hy {
            bays.move(to: CGPoint(x: -hx + 1.4, y: y))
            bays.addLine(to: CGPoint(x: -hx + 1.4 + lot.bayDepth, y: y))
            bays.move(to: CGPoint(x: hx - 1.4, y: y))
            bays.addLine(to: CGPoint(x: hx - 1.4 - lot.bayDepth, y: y))
            y += lot.bayPitch
        }
        bays.move(to: CGPoint(x: -hx + 1.4 + lot.bayDepth, y: -hy))
        bays.addLine(to: CGPoint(x: -hx + 1.4 + lot.bayDepth, y: hy))
        bays.move(to: CGPoint(x: hx - 1.4 - lot.bayDepth, y: -hy))
        bays.addLine(to: CGPoint(x: hx - 1.4 - lot.bayDepth, y: hy))
        let bayNode = stroke(bays, color: Palette.edgeLine, width: 0.3, z: 3)
        bayNode.lineCap = .butt
        bayNode.alpha = 0.22
        addChild(bayNode)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
}

/// Grass: a pool of sprites sharing one tile texture (mown stripes and sparse
/// specks a few percent off the base olive), laid over whatever the camera
/// can see. One texture, so the whole lawn is a single draw.
final class GrassNode: SKNode {
    private let texture: SKTexture
    private var sprites: [SKSpriteNode] = []
    private let baseTile = 9.6

    override init() {
        texture = GrassNode.makeTexture()
        super.init()
        zPosition = -10
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    private static func makeTexture() -> SKTexture {
        let size = 96
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size), format: {
            let f = UIGraphicsImageRendererFormat()
            f.scale = 1
            f.opaque = true
            return f
        }())
        let image = renderer.image { ctx in
            let c = ctx.cgContext
            c.setFillColor(Palette.offTrack.cgColor)
            c.fill(CGRect(x: 0, y: 0, width: size, height: size))
            c.setFillColor(Palette.offTrackStripe.cgColor)
            c.fill(CGRect(x: 0, y: 0, width: size, height: size / 2))
            // Deterministic specks so every tile edge matches its neighbour
            var seed: UInt32 = 7
            func rand() -> Double {
                seed = (seed &* 1103515245 &+ 12345) & 0x7fffffff
                return Double(seed) / Double(0x7fffffff)
            }
            for i in 0..<46 {
                c.setFillColor((i % 2 == 0 ? Palette.offTrackSpeckLight : Palette.offTrackSpeckDark).cgColor)
                let w = 2 + Int((rand() * 2).rounded())
                c.fill(CGRect(x: Int(rand() * Double(size)), y: Int(rand() * Double(size)), width: w, height: 2))
            }
        }
        let t = SKTexture(image: image)
        t.filteringMode = .linear
        return t
    }

    /// Cover the world rectangle the camera shows. `tile` grows for a wide view
    /// so the sprite count stays bounded.
    func cover(minX: Double, minY: Double, maxX: Double, maxY: Double) {
        let w = maxX - minX
        let h = maxY - minY
        let tile = max(baseTile, w / 9, h / 15)
        let x0 = (minX / tile).rounded(.down) * tile
        let y0 = (minY / tile).rounded(.down) * tile
        let cols = Int(((maxX - x0) / tile).rounded(.up)) + 1
        let rows = Int(((maxY - y0) / tile).rounded(.up)) + 1
        let needed = cols * rows
        while sprites.count < needed {
            let s = SKSpriteNode(texture: texture)
            s.anchorPoint = CGPoint(x: 0, y: 0)
            addChild(s)
            sprites.append(s)
        }
        var i = 0
        for r in 0..<rows {
            for c in 0..<cols {
                let s = sprites[i]
                s.isHidden = false
                s.size = CGSize(width: tile + 0.02, height: tile + 0.02)
                s.position = CGPoint(x: x0 + Double(c) * tile, y: y0 + Double(r) * tile)
                i += 1
            }
        }
        while i < sprites.count {
            sprites[i].isHidden = true
            i += 1
        }
    }
}
