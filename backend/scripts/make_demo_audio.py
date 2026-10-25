"""Synthesize short, real, playable MP3 demo episodes (simple melodies) with LAME.

Usage: python scripts/make_demo_audio.py seed_media
"""
import math
import struct
import sys
from pathlib import Path

import lameenc

out = Path(sys.argv[1] if len(sys.argv) > 1 else "seed_media")
out.mkdir(parents=True, exist_ok=True)
RATE = 22050

EPISODES = {
    "stillness-ep1.mp3": [261.6, 329.6, 392.0, 329.6, 440.0, 392.0, 329.6, 261.6],
    "stillness-ep2.mp3": [293.7, 349.2, 440.0, 349.2, 392.0, 349.2, 293.7, 261.6],
    "dialogue-ep1.mp3": [196.0, 246.9, 293.7, 392.0, 293.7, 246.9, 220.0, 196.0],
}


def render(notes, note_secs=2.5):
    frames = bytearray()
    for f in notes:
        n = int(RATE * note_secs)
        for i in range(n):
            env = min(1.0, i / 2000, (n - i) / 4000)  # soft attack/release
            s = 0.6 * math.sin(2 * math.pi * f * i / RATE) + 0.25 * math.sin(2 * math.pi * 2 * f * i / RATE)
            frames += struct.pack("<h", int(9000 * env * s))
    return bytes(frames)


for name, notes in EPISODES.items():
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(RATE)
    enc.set_channels(1)
    enc.set_quality(7)
    (out / name).write_bytes(bytes(enc.encode(render(notes)) + enc.flush()))
    print("wrote", name)
