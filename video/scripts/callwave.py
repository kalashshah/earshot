"""Per-frame loudness of the call (public/audio/call.mp3) for act 1's waveform: one RMS level per
60 fps video frame, normalised to 0..1 against the loudest frame, written to src/callwave.json.
    python3 scripts/callwave.py"""
import json, math, struct, subprocess

SR, FPS = 48000, 60
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'public/audio/call.mp3', '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
x = struct.unpack(f'<{len(pcm) // 2}h', pcm)
n = SR // FPS
rms = [math.sqrt(sum(v * v for v in x[i:i + n]) / n) / 32768 for i in range(0, len(x) - n + 1, n)]
top = max(rms) or 1
levels = [round(min(1, (r / top) ** 0.6), 3) for r in rms]  # gamma lifts quiet speech so the bars read
assert len(levels) > FPS * 15 and max(levels) == 1
json.dump(levels, open('src/callwave.json', 'w'))
print(len(levels), 'frames')
