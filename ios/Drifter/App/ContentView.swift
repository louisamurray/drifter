import SpriteKit
import SwiftUI

extension Color {
    static let accentOrange = Color(uiColor: Palette.accent)
    static let hudText = Color(uiColor: Palette.hudText)
    static let hudTextDim = Color(uiColor: Palette.hudTextDim)
    static let asphalt = Color(uiColor: Palette.asphalt)
    static let edgeLine = Color(uiColor: Palette.edgeLine)
}

extension Font {
    static func game(_ size: CGFloat) -> Font {
        .custom(GameFont.name, size: size)
    }
}

struct ContentView: View {
    @EnvironmentObject private var game: GameViewModel

    var body: some View {
        GeometryReader { geo in
            ZStack {
                SpriteView(scene: game.scene, preferredFramesPerSecond: 120, options: [.ignoresSiblingOrder])
                    .ignoresSafeArea()
                switch game.state {
                case .title:
                    TitleView()
                case .countdown:
                    CountdownView(value: game.countdown)
                case .playing:
                    PlayingOverlay(safe: game.scene.view?.safeAreaInsets ?? .zero)
                case .paused:
                    PausedView()
                case .gameover:
                    GameOverView()
                }
            }
            .onAppear { updateBand(geo) }
            .onChange(of: geo.size) { _, _ in updateBand(geo) }
        }
        .ignoresSafeArea()
        .defersSystemGestures(on: .bottom)
    }

    private func updateBand(_ geo: GeometryProxy) {
        let top = Double(geo.safeAreaInsets.top) + 150
        let bottom = Double(geo.size.height) - Double(geo.safeAreaInsets.bottom) - 150
        game.setOverviewBand(top: top, bottom: bottom)
    }
}

// MARK: - Pieces

struct Chip: View {
    let title: String
    var selected = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title.uppercased())
                .font(.game(11))
                .tracking(1)
                .foregroundStyle(selected ? Color.asphalt : Color.hudText)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(selected ? Color.edgeLine : Color.white.opacity(0.1), in: Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(selected ? 0 : 0.2), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct BigButton: View {
    let title: String
    var primary = false
    var quiet = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title.uppercased())
                .font(.game(primary ? 16 : 13))
                .tracking(1)
                .foregroundStyle(primary ? Color.white : Color.hudText)
                .frame(maxWidth: 280)
                .padding(.vertical, primary ? 18 : 14)
                .background(primary ? Color.accentOrange : Color.white.opacity(quiet ? 0.06 : 0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct SoundChip: View {
    @EnvironmentObject private var game: GameViewModel

    var body: some View {
        Chip(title: game.muted ? "Sound off" : "Sound on") { game.toggleMuted() }
    }
}

// MARK: - Screens

struct TitleView: View {
    @EnvironmentObject private var game: GameViewModel

    var body: some View {
        ZStack {
            // Darken the top and bottom so text reads over the ghost lap
            VStack {
                LinearGradient(colors: [.black.opacity(0.55), .clear], startPoint: .top, endPoint: .bottom).frame(height: 180)
                Spacer()
                LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom).frame(height: 320)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)

            VStack(spacing: 0) {
                HStack {
                    SoundChip()
                    Spacer()
                    HStack(spacing: 6) {
                        ForEach(GameMode.allCases, id: \.self) { m in
                            Chip(title: m.title, selected: game.mode == m) { game.setMode(m) }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                Spacer(minLength: 24)

                VStack(spacing: 10) {
                    Text("DRIFTER")
                        .font(.game(44))
                        .tracking(2)
                        .foregroundStyle(Color.hudText)
                        .shadow(color: .black.opacity(0.5), radius: 8, y: 4)
                    Text("Two thumbs. Sixty seconds.")
                        .font(.game(12))
                        .tracking(1)
                        .foregroundStyle(Color.hudTextDim)
                }

                Spacer()

                VStack(spacing: 14) {
                    Text("Left thumb: gas and handbrake. Right thumb: point the stick where the car should go.")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Color.hudTextDim)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                    Text("TAP TO DRIVE")
                        .font(.game(18))
                        .tracking(2)
                        .foregroundStyle(Color.accentOrange)
                        .padding(.top, 6)
                    Text(game.mode == .track ? "Chain drifts round the circuit. Laps pay a bonus." : "Open lot. Nothing to follow but the edge.")
                        .font(.system(size: 13))
                        .foregroundStyle(Color.hudTextDim)
                    HStack(spacing: 18) {
                        ForEach(GameMode.allCases, id: \.self) { m in
                            let best = game.bests[m] ?? 0
                            Text("\(m.title.uppercased()) BEST \(best > 0 ? formatScore(best) : "–")")
                                .font(.game(10))
                                .tracking(1)
                                .foregroundStyle(game.mode == m ? Color.hudText : Color.hudTextDim)
                        }
                    }
                }
                .padding(.bottom, 36)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { game.start() }
    }
}

struct CountdownView: View {
    let value: Int

    var body: some View {
        VStack {
            Spacer()
            Text(value <= 0 ? "GO" : "\(value)")
                .font(.game(value <= 0 ? 72 : 96))
                .foregroundStyle(value <= 0 ? Color.accentOrange : Color.hudText)
                .shadow(color: .black.opacity(0.5), radius: 10, y: 4)
                .id(value)
                .transition(.scale(scale: 1.4).combined(with: .opacity))
                .animation(.spring(duration: 0.3), value: value)
            Spacer()
            Spacer()
        }
        .allowsHitTesting(false)
    }
}

struct PlayingOverlay: View {
    let safe: UIEdgeInsets

    private var pauseFrame: CGRect {
        PlayingHUDLayout(width: Double(game.scene.size.width), safeTop: Double(safe.top),
                         safeLeft: Double(safe.left), safeRight: Double(safe.right)).pauseFrame
    }
    @EnvironmentObject private var game: GameViewModel

    var body: some View {
        VStack {
            HStack {
                Button(action: { game.pause() }) {
                    Image(systemName: "pause.fill")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Color.hudText)
                        .frame(width: pauseFrame.width, height: pauseFrame.height)
                        .background(Color.white.opacity(0.1), in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Pause")
                Spacer()
            }
            Spacer()
        }
        .padding(.leading, pauseFrame.minX)
        .padding(.top, pauseFrame.minY)
    }
}

struct PausedView: View {
    @EnvironmentObject private var game: GameViewModel

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
            VStack(spacing: 12) {
                Text("PAUSED")
                    .font(.game(22))
                    .tracking(2)
                    .foregroundStyle(Color.hudText)
                    .padding(.bottom, 10)
                BigButton(title: "Resume", primary: true) { game.resume() }
                BigButton(title: "Restart") { game.restart() }
                BigButton(title: game.muted ? "Sound off" : "Sound on", quiet: true) { game.toggleMuted() }
                BigButton(title: "Quit", quiet: true) { game.quitToTitle() }
            }
            .padding(28)
            .background(Color.asphalt.opacity(0.92), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .padding(32)
        }
    }
}

struct GameOverView: View {
    @EnvironmentObject private var game: GameViewModel

    var body: some View {
        VStack {
            VStack(spacing: 6) {
                if game.newBest {
                    Text("NEW BEST")
                        .font(.game(12))
                        .tracking(2)
                        .foregroundStyle(Color.accentOrange)
                }
                Text(formatScore(game.finalScore))
                    .font(.game(52))
                    .foregroundStyle(Color.hudText)
                    .shadow(color: .black.opacity(0.5), radius: 8, y: 4)
                Text("BEST \(formatScore(game.finalBest))")
                    .font(.game(12))
                    .tracking(1)
                    .foregroundStyle(Color.hudTextDim)
            }
            .padding(.top, 36)
            Spacer()
            VStack(spacing: 12) {
                BigButton(title: "Drive again", primary: true) { game.restart() }
                HStack(spacing: 12) {
                    BigButton(title: "Share") { game.share() }
                    BigButton(title: "Menu", quiet: true) { game.quitToTitle() }
                }
                .frame(maxWidth: 280)
            }
            .padding(.bottom, 36)
        }
        .padding(.horizontal, 24)
    }
}
