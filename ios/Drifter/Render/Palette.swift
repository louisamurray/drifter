import CoreText
import SpriteKit
import UIKit

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
    }
}

/// The web game's palette, shared by the scene and the SwiftUI screens.
enum Palette {
    static let asphalt = UIColor(hex: 0x1c2230)
    static let edgeLine = UIColor(hex: 0xe8dcc4)
    static let offTrack = UIColor(hex: 0x4a5238)
    static let offTrackStripe = UIColor(hex: 0x4d5539)
    static let offTrackSpeckLight = UIColor(hex: 0x565f42)
    static let offTrackSpeckDark = UIColor(hex: 0x3f4630)
    static let trackShadow = UIColor(white: 0, alpha: 0.18)
    static let carShadow = UIColor(white: 0, alpha: 0.3)
    static let textHalo = UIColor(red: 18 / 255, green: 23 / 255, blue: 31 / 255, alpha: 0.75)
    static let skid = UIColor(red: 12 / 255, green: 10 / 255, blue: 8 / 255, alpha: 1)
    static let accent = UIColor(hex: 0xff5a2d)
    static let hudText = UIColor(hex: 0xf2eee6)
    static let hudTextDim = UIColor(hex: 0xf2eee6, alpha: 0.55)
    static let carBody = UIColor(hex: 0xe8dcc4)
    static let carRoof = UIColor(hex: 0xfffaf0)
    static let carGlass = UIColor(hex: 0x262e3d)
    static let carWheel = UIColor(hex: 0x0d1016)
    static let carOutline = UIColor(red: 13 / 255, green: 16 / 255, blue: 22 / 255, alpha: 0.55)
    static let smoke = UIColor(red: 210 / 255, green: 205 / 255, blue: 195 / 255, alpha: 1)
    static let smokeHot = UIColor(red: 1, green: 90 / 255, blue: 45 / 255, alpha: 1)
    static let padFill = UIColor(white: 1, alpha: 0.08)
    static let padStroke = UIColor(hex: 0xf2eee6, alpha: 0.35)
    static let padHeld = UIColor(hex: 0xff5a2d, alpha: 0.55)
}

/// The UI font, bundled as a TTF and registered at launch.
enum GameFont {
    static let name = "ArchivoSemiBoldExpanded-ExtraBold"
    private static var registered = false

    static func register() {
        guard !registered else { return }
        registered = true
        guard let url = Bundle.main.url(forResource: "ArchivoExpanded-ExtraBold", withExtension: "ttf") else { return }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
}
