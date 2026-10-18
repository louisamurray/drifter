import SpriteKit
import SwiftUI
import XCTest
@testable import Drifter

final class HUDTests: XCTestCase {
    func testPauseStaysBelowScoreAndClearOfMultiplierAndControls() {
        for (width, height, top, bottom) in [
            (375.0, 667.0, 20.0, 0.0),
            (393.0, 852.0, 59.0, 34.0),
            (834.0, 1194.0, 24.0, 20.0)
        ] {
            let layout = PlayingHUDLayout(width: width, safeTop: top, safeLeft: 0, safeRight: 0)
            XCTAssertFalse(layout.pauseFrame.intersects(layout.multiplierFrame))
            XCTAssertGreaterThan(layout.pauseFrame.minY, top + 52)
            XCTAssertLessThan(layout.pauseFrame.maxY, height * Config.input.pad.bandTop)
            XCTAssertLessThan(layout.pauseFrame.maxY, height - bottom)
            XCTAssertEqual(layout.pauseFrame.width, 44)
            XCTAssertEqual(layout.pauseFrame.height, 44)
        }
    }

    @MainActor
    func testPlayingOverlaySnapshot() throws {
        let game = GameViewModel()
        game.run.setState(.playing)
        game.scene(game.scene, didRaise: .stateChanged(from: .countdown, to: .playing))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        let host = UIHostingController(rootView: ContentView().environmentObject(game))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        XCTAssertNotNil(game.scene.view)
        XCTAssertEqual(game.run.viewportWidth, Double(host.view.bounds.width), accuracy: 1)
        XCTAssertEqual(game.run.viewportHeight, Double(host.view.bounds.height), accuracy: 1)
        let image = UIGraphicsImageRenderer(bounds: host.view.bounds).image { _ in
            host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = "Playing HUD"
        attachment.lifetime = .keepAlways
        add(attachment)
        window.isHidden = true
    }
}
