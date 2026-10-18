import SpriteKit

/// Fixed-size tyre smoke pool: sprites sharing one soft-disc texture, so the
/// whole cloud is one draw. No per-frame allocation; dead slots are reused.
final class SmokePool: SKNode {
    private struct Particle {
        var x = 0.0, y = 0.0, vx = 0.0, vy = 0.0
        var age = 0.0, life = 1.0, size = 0.8, heat = 0.0
        var alive = false
    }

    private var items: [Particle]
    private var sprites: [SKSpriteNode] = []
    private var cursor = 0
    private var carry = 0.0
    let capacity: Int
    /// Tints from plain smoke to the accent, so a hot drift's cloud never allocates a colour per particle.
    private static let heatColors: [UIColor] = (0..<8).map { Palette.smoke.blended(with: Palette.smokeHot, fraction: Double($0) / 7 * 0.6) }

    init(capacity: Int) {
        self.capacity = capacity
        items = Array(repeating: Particle(), count: capacity)
        super.init()
        zPosition = 20
        let texture = SmokePool.makeTexture()
        for _ in 0..<capacity {
            let s = SKSpriteNode(texture: texture)
            s.isHidden = true
            s.colorBlendFactor = 1
            s.color = Palette.smoke
            s.blendMode = .alpha
            addChild(s)
            sprites.append(s)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    private static func makeTexture() -> SKTexture {
        let size = 64
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size), format: format)
        let image = renderer.image { ctx in
            let colors = [UIColor(white: 1, alpha: 1).cgColor, UIColor(white: 1, alpha: 0).cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0.15, 1])!
            let centre = CGPoint(x: size / 2, y: size / 2)
            ctx.cgContext.drawRadialGradient(gradient, startCenter: centre, startRadius: 0, endCenter: centre, endRadius: CGFloat(size) / 2, options: [])
        }
        return SKTexture(image: image)
    }

    /// Emit roughly `rate * dt` particles at (x, y) carried by the car's velocity.
    func emit(x: Double, y: Double, vx: Double, vy: Double, rate: Double, dt: Double, heat: Double) {
        carry += rate * dt
        while carry >= 1 {
            carry -= 1
            var p = items[cursor]
            let a = Double.random(in: 0..<(2 * .pi))
            let spread = 3.0 + Double.random(in: 0..<4)
            p.x = x + Double.random(in: -0.3..<0.3)
            p.y = y + Double.random(in: -0.3..<0.3)
            p.vx = vx * 0.25 + cos(a) * spread
            p.vy = vy * 0.25 + sin(a) * spread
            p.age = 0
            p.life = 0.55 + Double.random(in: 0..<0.45)
            p.size = 0.5 + Double.random(in: 0..<0.4)
            p.heat = heat
            p.alive = true
            items[cursor] = p
            cursor = (cursor + 1) % capacity
        }
    }

    func update(dt: Double) {
        let damping = pow(0.92, dt * 60)
        for i in 0..<capacity {
            guard items[i].alive else { continue }
            items[i].age += dt
            if items[i].age >= items[i].life {
                items[i].alive = false
                sprites[i].isHidden = true
                continue
            }
            items[i].x += items[i].vx * dt
            items[i].y += items[i].vy * dt
            items[i].vx *= damping
            items[i].vy *= damping
        }
    }

    /// Push particle state to the sprites. Grow and fade; hotter drifts tint towards the accent.
    func render() {
        for i in 0..<capacity {
            let p = items[i]
            let s = sprites[i]
            guard p.alive else { continue }
            let t = p.age / p.life
            let size = (p.size + t * 1.6) * 2
            s.isHidden = false
            s.position = CGPoint(x: p.x, y: p.y)
            s.size = CGSize(width: size, height: size)
            s.alpha = CGFloat(0.32 * (1 - t) * (1 - t))
            s.color = SmokePool.heatColors[min(7, Int(p.heat * 7.99))]
        }
    }

    func clear() {
        for i in 0..<capacity {
            items[i].alive = false
            sprites[i].isHidden = true
        }
        carry = 0
    }
}

extension UIColor {
    func blended(with other: UIColor, fraction: Double) -> UIColor {
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        other.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        let f = CGFloat(min(1, max(0, fraction)))
        return UIColor(red: r1 + (r2 - r1) * f, green: g1 + (g2 - g1) * f, blue: b1 + (b2 - b1) * f, alpha: a1 + (a2 - a1) * f)
    }
}
