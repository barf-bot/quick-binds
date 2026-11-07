#!/usr/bin/env python3
"""Generate QuickBinds/Media/icon.tga — a rounded keycap with "KB", on a dark
background, for the addon's minimap button and addon-list icon.

Pure stdlib (zlib only for the optional --preview PNG), integer math on a 4x
supersampled grid, so output is byte-identical on every run. 64x64,
uncompressed 32-bit BGRA TGA, alpha included. Regenerate with:

    python3 tools/make-icon.py [--preview]
"""
import os
import struct
import sys
import zlib

SIZE = 64
SS = 4  # supersample factor: render at 256x256, box-down to 64x64
HIGH = SIZE * SS

# Palette (R, G, B)
BG = (20, 20, 28)           # dark background plate
CAP_TOP = (232, 232, 240)   # keycap face, lit top
CAP_BOT = (176, 176, 190)   # keycap face, shaded bottom
CAP_EDGE = (52, 52, 62)     # keycap outline
CAP_SHADOW = (96, 96, 110)  # underside shadow band
LEGEND = (34, 34, 44)       # "KB" legend, dark engraving

FONT = {
    "K": [
        "1 0 0 0 1",
        "1 0 0 1 0",
        "1 0 1 0 0",
        "1 1 0 0 0",
        "1 0 1 0 0",
        "1 0 0 1 0",
        "1 0 0 0 1",
    ],
    "B": [
        "1 1 1 1 0",
        "1 0 0 0 1",
        "1 0 0 0 1",
        "1 1 1 1 0",
        "1 0 0 0 1",
        "1 0 0 0 1",
        "1 1 1 1 0",
    ],
}


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def in_rounded_rect(x, y, x0, y0, x1, y1, r):
    """Inside the rect, with the four corners cut to radius r."""
    if x < x0 or x >= x1 or y < y0 or y >= y1:
        return False
    if x0 + r <= x < x1 - r or y0 + r <= y < y1 - r:
        return True
    cx = x0 + r if x < x0 + r else x1 - r
    cy = y0 + r if y < y0 + r else y1 - r
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render_legend():
    """Legend glyph blocks as (x0, y0, side) squares in high-res coords."""
    scale = 10
    glyph_w, glyph_h, gap = 5, 7, 2
    total_w = glyph_w * 2 + gap
    ox = (HIGH - total_w * scale) // 2
    oy = 30 * SS - (glyph_h * scale) // 2  # centered on the keycap face
    blocks = []
    for gi, ch in enumerate("KB"):
        gx = ox + gi * (glyph_w + gap) * scale
        for row, line in enumerate(FONT[ch]):
            for col, bit in enumerate(line.split()):
                if bit == "1":
                    blocks.append((gx + col * scale, oy + row * scale, scale))
    return blocks


def render():
    plate = (6, 6, HIGH - 6, HIGH - 6, 10 * SS)           # background plate
    edge = (10 * SS, 8 * SS, 54 * SS, 52 * SS, 12 * SS)   # keycap outline
    cap = (12 * SS, 10 * SS, 52 * SS, 50 * SS, 10 * SS)   # keycap face
    shadow = (13 * SS, 50 * SS, 51 * SS, 52 * SS, 6 * SS)  # underside band
    legend = render_legend()
    cap_h = cap[3] - cap[1]
    rows = []
    for y in range(HIGH):
        row = []
        for x in range(HIGH):
            if any(x >= x0 and x < x0 + s and y >= y0 and y < y0 + s for x0, y0, s in legend):
                color = (*LEGEND, 255)
            elif in_rounded_rect(x, y, *cap):
                color = (*lerp(CAP_TOP, CAP_BOT, (y - cap[1]) / cap_h), 255)
            elif in_rounded_rect(x, y, *shadow):
                color = (*CAP_SHADOW, 255)
            elif in_rounded_rect(x, y, *edge):
                color = (*CAP_EDGE, 255)
            elif in_rounded_rect(x, y, *plate):
                color = (*BG, 255)
            else:
                color = (0, 0, 0, 0)
            row.append(color)
        rows.append(row)
    return rows


def downsample(rows):
    final = []
    for by in range(SIZE):
        line = []
        for bx in range(SIZE):
            acc = [0, 0, 0, 0]
            for dy in range(SS):
                for dx in range(SS):
                    px = rows[by * SS + dy][bx * SS + dx]
                    for i in range(4):
                        acc[i] += px[i]
            line.append(tuple(round(a / (SS * SS)) for a in acc))
        final.append(line)
    return final


def write_tga(pixels, path):
    header = bytearray(18)
    header[2] = 2      # uncompressed true-color
    header[12:14] = bytes((SIZE & 0xFF, SIZE >> 8))
    header[14:16] = bytes((SIZE & 0xFF, SIZE >> 8))
    header[16] = 32    # bpp
    header[17] = 0x28  # 8-bit alpha, top-left origin
    with open(path, "wb") as f:
        f.write(header)
        for row in pixels:
            for r, g, b, a in row:
                f.write(struct.pack("4B", b, g, r, a))


def write_preview_png(pixels, path, scale=1):
    """Minimal 8-bit RGBA PNG writer for review only."""
    w = h = len(pixels) * scale
    body = bytearray()
    for y in range(len(pixels)):
        px = bytearray()
        for x in range(len(pixels[y])):
            for _ in range(scale):
                px += bytes(pixels[y][x])
        row = bytearray(1 + w * 4)
        row[0] = 0  # filter: none
        row[1:] = px
        for _ in range(scale):
            body += row

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(bytes(body), 9)))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    pixels = downsample(render())
    target = "QuickBinds/Media/icon.tga"
    os.makedirs(os.path.dirname(target), exist_ok=True)
    write_tga(pixels, target)
    print(f"wrote {target} ({SIZE}x{SIZE} 32-bit uncompressed TGA)")
    if "--preview" in sys.argv:
        write_preview_png(pixels, "/tmp/quickbinds-icon-preview.png", scale=6)
        avg = lambda y, x, i: sum(pixels[2 * y + dy][2 * x + dx][i] for dy in range(2) for dx in range(2)) // 4
        small = [[tuple(avg(y, x, i) for i in range(4)) for x in range(32)] for y in range(32)]
        write_preview_png(small, "/tmp/quickbinds-icon-32.png", scale=8)
        print("previews: /tmp/quickbinds-icon-preview.png (6x), /tmp/quickbinds-icon-32.png (32px art at 8x)")
