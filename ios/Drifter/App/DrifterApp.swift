import SwiftUI

@main
struct DrifterApp: App {
    @StateObject private var game = GameViewModel()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        GameFont.register()
        UIApplication.shared.isIdleTimerDisabled = true
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(game)
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                .preferredColorScheme(.dark)
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: game.becameActive()
            case .inactive, .background: game.leftForeground()
            @unknown default: break
            }
        }
    }
}
