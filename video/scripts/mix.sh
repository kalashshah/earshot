#!/usr/bin/env bash
# The final soundtrack: the effects (public/audio/soundtrack.wav, npm run audio), the call from frame 0,
# each narration clip on its VO_AT frame, and the music bed (public/audio/bed.mp3, scripts/music.mjs)
# placed so its own ending lands on the last frame, ducked under the voices. Two-pass loudnorm to
# -14 LUFS, then a limiter at -1.5 dBTP.
#   bash scripts/mix.sh            → public/audio/mix.wav (render with --audio public/audio/mix.wav)
set -euo pipefail
cd "$(dirname "$0")/.."
read -r FPS TOTAL AT <<<"$(npx tsx -e "import {VO_AT,TOTAL,FPS} from './src/timeline'; console.log(FPS, TOTAL, VO_AT.join(','))")"
IFS=, read -r -a ats <<<"$AT"
dur=$(python3 -c "print($TOTAL/$FPS)")
bedlen=$(ffprobe -v error -show_entries format=duration -of csv=p=0 public/audio/bed.mp3)
bedat=$(python3 -c "print(max(0, int(($dur-$bedlen)*1000)))")
in=(-i public/audio/soundtrack.wav -i public/audio/call.mp3 -i public/audio/bed.mp3)
fx="[1:a]aresample=48000[call];"
voices="[call]"
for i in "${!ats[@]}"; do
  n=$(printf %02d $((i + 1)))
  in+=(-i "public/vo/vo$n.mp3")
  ms=$(( ats[i] * 1000 / FPS ))
  fx+="[$((i + 3)):a]aresample=48000,adelay=${ms}|${ms}[v$i];"
  voices+="[v$i]"
done
# score: low under the call (which carries its own street sound), up to a felt level from the end of
# the call on, and pulled down a few dB while anyone speaks
fx+="${voices}amix=inputs=$(( ${#ats[@]} + 1 )):duration=longest:normalize=0,asplit[voice][key];"
fx+="[2:a]aresample=48000,volume='0.11+0.17*min(1,max(0,(t-19)/4))':eval=frame,afade=t=in:d=2,adelay=${bedat}|${bedat}[bed0];"
fx+="[bed0][key]sidechaincompress=threshold=0.03:ratio=3:attack=40:release=600[bed];"
fx+="[0:a][voice][bed]amix=inputs=3:duration=first:normalize=0,aresample=48000,atrim=0:${dur}"
ffmpeg -v error -y "${in[@]}" -filter_complex "${fx}[out]" -map '[out]' -ar 48000 -c:a pcm_s24le public/audio/premix.wav
m=$(ffmpeg -nostats -i public/audio/premix.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$m" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i public/audio/premix.wav -af "loudnorm=I=-14:TP=-1.5:LRA=11:linear=true:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset),alimiter=limit=0.84:level=disabled:attack=5:release=50,aresample=48000" \
  -ar 48000 -c:a pcm_s24le public/audio/mix.wav
ffmpeg -nostats -i public/audio/mix.wav -af ebur128=peak=true -f null - 2>&1 | grep -E '^\s+(I|Peak):' | tr -s ' '
