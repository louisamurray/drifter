import Foundation

/// Top-left screen coordinates shared by the SwiftUI button and SpriteKit HUD.
struct PlayingHUDLayout {
    let width: Double
    let safeTop: Double
    let safeLeft: Double
    let safeRight: Double

    var pauseFrame: CGRect {
        CGRect(x: safeLeft + 16, y: safeTop + 64, width: 44, height: 44)
    }

    var multiplierFrame: CGRect {
        CGRect(x: width - safeRight - 60, y: safeTop + 60, width: 44, height: 44)
    }
}
