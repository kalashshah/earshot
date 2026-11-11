import AVFoundation

/// Second-order Butterworth high-pass, run over the stream in place. Wrist bumps, cloth and wind sit below the
/// voice and carry a lot of energy: left in, they read as loudness, so they open the gate, pull the gain down
/// and skew the per-speaker levels.
struct HighPass {
    private let b0: Float, b1: Float, b2: Float, a1: Float, a2: Float
    private var x1: Float = 0, x2: Float = 0, y1: Float = 0, y2: Float = 0

    init(cutoff: Double, sampleRate: Double) {
        let w = 2 * Double.pi * cutoff / sampleRate
        let alpha = sin(w) / (2 * 0.7071), c = cos(w), a0 = 1 + alpha
        b0 = Float((1 + c) / 2 / a0); b1 = Float(-(1 + c) / a0); b2 = b0
        a1 = Float(-2 * c / a0); a2 = Float((1 - alpha) / a0)
    }

    mutating func apply(_ pcm: AVAudioPCMBuffer) {
        guard let data = pcm.floatChannelData?[0] else { return }
        for i in 0..<Int(pcm.frameLength) {
            let x = data[i]
            let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2 = x1; x1 = x; y2 = y1; y1 = y
            data[i] = y
        }
    }
}
