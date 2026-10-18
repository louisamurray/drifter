import Foundation

/// World position the screen is centred on (with the car anchored below
/// centre) and the zoom in screen points per metre.
struct Camera {
    var x: Double
    var y: Double
    var zoom: Double

    init(car: CarState) {
        x = car.x
        y = car.y
        zoom = Config.camera.zoomRest
    }

    /// Exponential smoothing factor for rate r over dt.
    private static func smooth(_ rate: Double, _ dt: Double) -> Double {
        1 - exp(-rate * dt)
    }

    mutating func move(toX tx: Double, y ty: Double, zoom tz: Double, dt: Double) {
        typealias c = Config.camera
        let k = Camera.smooth(c.followRate, dt)
        x += (tx - x) * k
        y += (ty - y) * k
        zoom += (tz - zoom) * Camera.smooth(c.zoomRate, dt)
    }

    /// Follow the car with velocity lead, zooming out with speed.
    mutating func follow(_ car: CarState, speed: Double, dt: Double) {
        typealias c = Config.camera
        let ratio = min(speed / Vehicle.standard.topSpeed, 1)
        let zoom = c.zoomRest + (c.zoomFast - c.zoomRest) * ratio
        let v = car.worldVelocity
        move(toX: car.x + v.x * c.leadTime, y: car.y + v.y * c.leadTime, zoom: zoom, dt: dt)
    }

    /// Camera target that fits `bounds`, plus `pad` metres on every side, inside
    /// a horizontal band of the screen, for the game-over frame. `bandTop` and
    /// `bandBottom` are points from the top of the screen.
    static func fitOverview(bounds: Bounds, pad: Double, viewWidth: Double, viewHeight: Double, bandTop: Double, bandBottom: Double) -> Camera {
        let w = bounds.width + pad * 2
        let h = bounds.height + pad * 2
        let fill = Config.camera.overviewFill
        let bandHeight = max(1, bandBottom - bandTop)
        let zoom = min((viewWidth * fill) / w, (bandHeight * fill) / h)
        // The world target lands at carScreenY on screen; shift so the course
        // centre sits in the middle of the band instead
        let bandCentre = (bandTop + bandBottom) / 2
        let screenOffset = bandCentre - Config.render.carScreenY * viewHeight
        var cam = Camera(car: CarState())
        cam.x = bounds.centre.x
        // Screen y grows downwards and world y upwards
        cam.y = bounds.centre.y + screenOffset / zoom
        cam.zoom = zoom
        return cam
    }
}
