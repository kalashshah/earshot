import SwiftUI

extension Color {
    /// Earshot's accent, same as the website's --accent (#ff4d00).
    static let ember = Color(red: 1, green: 0.302, blue: 0)
}

/// The Earshot orb, a SwiftUI twin of the website's particles (web/src/components/particles.tsx):
/// a sphere of dots that springs in from scattered, turns slowly, and ripples like sound.
/// `level` (0…1) raises the ripples and lights more dots in ember; `active == false` keeps it grey and calm.
struct ParticleOrb: View {
    var level: Double = 0
    var active = true
    var count = 500
    var dotSize: CGFloat = 2.2

    @State private var born = Date()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    #if os(watchOS)
    @Environment(\.isLuminanceReduced) private var dimmed
    #else
    private let dimmed = false
    #endif

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || dimmed)) { tl in
            Canvas { ctx, size in
                draw(&ctx, size: size, t: reduceMotion ? 10 : tl.date.timeIntervalSince(born))
            }
        }
        .onAppear { born = Date() }
        .accessibilityHidden(true)
    }

    private func draw(_ ctx: inout GraphicsContext, size: CGSize, t: Double) {
        let dark = scheme == .dark
        ctx.blendMode = dark ? .plusLighter : .normal
        let radius = min(size.width, size.height) * 0.4
        let mid = CGPoint(x: size.width / 2, y: size.height / 2)
        let lvl = active ? min(1, max(0, level)) : 0
        let morph = easeOutBack(t / 1.6)
        let amp = 0.03 + 0.06 * lvl
        let phase = t * (active ? 2 + 3 * lvl : 0.6)
        let yaw = t * 0.25, pitch = 0.3
        let (cy, sy, cp, sp) = (cos(yaw), sin(yaw), cos(pitch), sin(pitch))
        let ink: (Double, Double, Double) = dark ? (0.55, 0.54, 0.51) : (0.33, 0.33, 0.31)
        let hot: (Double, Double, Double) = dark ? (1, 0.353, 0.078) : (1, 0.302, 0)
        let golden = Double.pi * (3 - 5.0.squareRoot())
        let e = (0.55, 0.45, 0.7), en = (e.0 * e.0 + e.1 * e.1 + e.2 * e.2).squareRoot()

        for i in 0..<count {
            let y = 1 - 2 * (Double(i) + 0.5) / Double(count), r = (1 - y * y).squareRoot(), th = golden * Double(i)
            var p = (cos(th) * r, y, sin(th) * r)
            // ripples spread from one point on the sphere, like sound leaving a speaker
            let d = acos(max(-1, min(1, (p.0 * e.0 + p.1 * e.1 + p.2 * e.2) / en)))
            let wave = sin(d * 7 - phase)
            let k = 1 + amp * wave
            let s = (rand(i, 1) * 4 - 2, rand(i, 2) * 3 - 1.5, rand(i, 3) * 2 - 1)
            p = (s.0 + (p.0 * k - s.0) * morph, s.1 + (p.1 * k - s.1) * morph, s.2 + (p.2 * k - s.2) * morph)
            p = (cy * p.0 + sy * p.2, p.1, -sy * p.0 + cy * p.2)
            p = (p.0, cp * p.1 - sp * p.2, sp * p.1 + cp * p.2)
            let f = 3.2 / (3.2 - p.2)
            let crest = max(0, (wave - 0.55) / 0.45) * (active ? 0.35 + 0.65 * lvl : 0) * min(1, morph)
            let front = max(0, min(1, (p.2 + 1.2) / 2.2))
            let alpha = min(1, (0.2 + 0.7 * crest + 0.25 * front) * (0.4 + 0.6 * front) * (dark ? 1 : 1.6))
            // pick grey or ember outright: blending the two reads as muddy brown
            let c = crest > 0.12 ? hot : ink
            let color = Color(red: c.0, green: c.1, blue: c.2)
            let sz = dotSize * (1 + crest * 1.3) * f
            let x = mid.x + p.0 * radius * f, yy = mid.y - p.1 * radius * f
            ctx.fill(Path(ellipseIn: CGRect(x: x - sz / 2, y: yy - sz / 2, width: sz, height: sz)), with: .color(color.opacity(alpha)))
        }
    }

    /// Stable per-dot pseudo-random 0…1, so the scatter doesn't reshuffle every frame.
    private func rand(_ i: Int, _ salt: Double) -> Double {
        let v = sin(Double(i) * 12.9898 + salt * 78.233) * 43758.5453
        return v - v.rounded(.down)
    }

    /// Ease-out "back": overshoots a touch past 1, then settles (Lifthouse's intro curve).
    private func easeOutBack(_ t: Double, _ s: Double = 1.4) -> Double {
        let u = min(1, max(0, t)) - 1
        return 1 + (s + 1) * u * u * u + s * u * u
    }
}

/// Live "listening" bars, the website's hero waveform. Bars sway gently while listening
/// and grow with `level` while a conversation is being captured.
struct ListeningBars: View {
    var level: Double = 0
    var active = true
    var bars = 18
    var color: Color = .ember
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || !active)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            Canvas { ctx, size in
                let w = size.width / CGFloat(bars * 2 - 1)
                for i in 0..<bars {
                    let di = Double(i)
                    let a: Double = sin(t * 4.5 + di * 0.9)
                    let b: Double = cos(t * 2.1 + di * 0.37)
                    let sway: Double = 0.5 + 0.5 * a * b
                    let h: Double = active ? 0.18 + (0.12 + 0.7 * level) * sway : 0.12
                    let bh = max(w, size.height * CGFloat(h))
                    let rect = CGRect(x: CGFloat(i) * w * 2, y: (size.height - bh) / 2, width: w, height: bh)
                    ctx.fill(Path(roundedRect: rect, cornerRadius: w / 2), with: .color(color.opacity(active ? 0.85 : 0.3)))
                }
            }
        }
        .accessibilityHidden(true)
    }
}
