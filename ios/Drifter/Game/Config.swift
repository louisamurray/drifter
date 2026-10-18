import Foundation

/// Every tunable in one place. World units are metres and seconds, y up,
/// angles in radians counter-clockwise. The web game's pixels map at 10 px/m.
enum Config {
    enum loop {
        /// Physics step. 120 Hz: two steps per frame on a 60 Hz screen, one on ProMotion.
        static let fixedDt = 1.0 / 120.0
        /// Clamp for a single frame's elapsed time so a backgrounded app cannot spiral.
        static let maxFrameDt = 0.25
    }

    enum render {
        /// Vertical anchor of the car on screen, measured from the top (0 top, 1 bottom). Keeps it above the thumbs.
        static let carScreenY = 0.6
    }

    enum input {
        /// Seconds for a pressed gas pedal to reach full throttle.
        static let throttleSeconds = 0.15
        static let pad = PadLayout(inset: 24, pedalSize: 80, pedalGap: 12, stickRadius: 70, stickFullAngle: 0.6, bandTop: 0.55)
    }

    enum track {
        /// Road width in metres.
        static let width = 13.0
        /// Control points were drawn at 10 px/m for a 0.8 scale, so 0.08 turns them into metres.
        static let scale = 0.08
    }

    static let lot = Lot(width: 180, height: 260, corner: 30, ring: 26, bayDepth: 9, bayPitch: 5)

    enum scoring {
        static let runSeconds = 60.0
        /// Points per second at x1 = pointsScale * |slip angle in rad| * speed in m/s.
        static let pointsScale = 10.0
        static let multiplierStep = 0.5
        static let multiplierEvery = 2.0
        static let multiplierMax = 5.0
        static let graceSeconds = 1.0
        static let lapBonus = 500.0
        static let handbrakeScoreScale = 0.35
        static let offTrackKeep = 0.5
        static let countdownSeconds = 3.0
    }

    enum juice {
        /// Alpha laid down per pass at full drift intensity. Builds up on repeated passes.
        static let skidAlpha = 0.28
        /// Rubber width in metres.
        static let skidWidth = 0.6
        /// Body slip angle (rad) at which skid, smoke and squeal saturate.
        static let fullIntensitySlip = 0.6
        static let smokeRate = 26.0
        static let smokeMax = 240
        static let shakeBase = 3.0
        static let shakePerDecade = 2.5
        static let shakeMax = 14.0
        static let shakeDuration = 0.32
    }

    enum camera {
        static let leadTime = 0.35
        static let followRate = 6.0
        /// Screen points per metre at rest and at top speed.
        static let zoomRest = 11.0
        static let zoomFast = 8.5
        static let zoomRate = 2.5
        static let overviewFill = 0.86
    }
}
