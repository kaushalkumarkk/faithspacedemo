"""Generate a small real MP3 (a 3-second tone) for the e2e podcast test.

Usage: python scripts/make_fixtures.py ../frontend/e2e/fixtures
"""
import math
import struct
import sys
from pathlib import Path

import lameenc

out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
out.mkdir(parents=True, exist_ok=True)

rate, seconds = 22050, 6
pcm = b"".join(struct.pack("<h", int(9000 * math.sin(2 * math.pi * 440 * i / rate))) for i in range(rate * seconds))
enc = lameenc.Encoder()
enc.set_bit_rate(64)
enc.set_in_sample_rate(rate)
enc.set_channels(1)
enc.set_quality(7)
(out / "tone.mp3").write_bytes(bytes(enc.encode(pcm) + enc.flush()))
(out / "not-media.txt").write_text("this is not a video")
print("wrote fixtures to", out.resolve())
