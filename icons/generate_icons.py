#!/usr/bin/env python3
"""Generate Spellbook app icons (no third-party deps).

Draws a magical gradient tile with a golden four-point sparkle and writes
PNGs at the sizes iOS / PWA need. Run: python3 icons/generate_icons.py
"""
import struct, zlib, math, os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def make_png(size):
    # Palette
    c_tl = (0x2a, 0x1b, 0x54)   # deep indigo
    c_br = (0x3a, 0x18, 0x40)   # plum
    gold = (0xff, 0xd3, 0x6e)
    pink = (0xff, 0x7a, 0xdb)

    buf = bytearray()
    cx = cy = size / 2.0
    for y in range(size):
        buf.append(0)  # PNG filter byte (none) per scanline
        for x in range(size):
            # Diagonal background gradient
            t = (x + y) / (2.0 * size)
            r, g, b = lerp(c_tl, c_br, t)

            # Soft radial glow toward centre
            d = math.hypot(x - cx, y - cy) / (size / 2.0)
            glow = max(0.0, 1.0 - d)
            r += int(40 * glow); g += int(20 * glow); b += int(55 * glow)

            # Four-point sparkle (golden), with pink fringe
            u = (x - cx) / (size * 0.46)
            v = (y - cy) / (size * 0.46)
            au, av = abs(u), abs(v)
            star = 0.0
            if au < 1 and av < 0.16 * (1 - au):
                star = 1 - (av / (0.16 * (1 - au) + 1e-6))
            if av < 1 and au < 0.16 * (1 - av):
                star = max(star, 1 - (au / (0.16 * (1 - av) + 1e-6)))
            core = max(0.0, 1.0 - math.hypot(u, v) / 0.18)
            star = max(star, core)

            if star > 0:
                sc = lerp(pink, gold, min(1.0, star * 1.3))
                r = int(r * (1 - star) + sc[0] * star)
                g = int(g * (1 - star) + sc[1] * star)
                b = int(b * (1 - star) + sc[2] * star)

            buf += bytes((min(255, r), min(255, g), min(255, b), 255))

    raw = bytes(buf)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(raw, 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


for sz, name in [(180, "icon-180.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
    with open(os.path.join(OUT_DIR, name), "wb") as f:
        f.write(make_png(sz))
    print("wrote", name)
