#!/usr/bin/env python3
"""Generate QuickBinds/Media/icon.tga — a round disc reading "QB", for the
addon's minimap button and addon-list icon.

Pure stdlib (zlib only for the optional --preview PNG), integer math on a 4x
supersampled grid, so output is byte-identical on every run. 64x64,
uncompressed 32-bit BGRA TGA, alpha included. Regenerate with:

    python3 tools/make-icon.py [--out PATH] [--preview]

tools/check-icon.mjs re-runs this file, compares the bytes with the committed
icon.tga, checks the alpha silhouette against DISC_R_PX and the button's label text
against LEGEND_TEXT -- keep those constants describing the art, not fighting it.
"""
import os
import struct
import sys
import zlib

SIZE = 64
SS = 4  # supersample factor: render at 256x256, box-down to 64x64
HIGH = SIZE * SS

LEGEND_TEXT = "QB"  # the disc's legend, and MinimapButton.lua's label text

# Geometry, in high-res units (check-icon.mjs reads SIZE, SS and DISC_R_PX).
DISC_R_PX = 30  # disc silhouette radius: a 2px transparent margin at 64x64
DISC_R = DISC_R_PX * SS
FACE_R = 27 * SS  # lit face; the band out to DISC_R is the rim
CENTER = HIGH // 2

# Palette (R, G, B)
RIM = (52, 52, 62)  # disc edge
FACE_TOP = (232, 232, 240)  # disc face, lit top
FACE_BOT = (176, 176, 190)  # disc face, shaded bottom
LEGEND = (34, 34, 44)  # "QB" legend, dark engraving

FONT = {
    "Q": [
        "0 1 1 1 0",
        "1 0 0 0 1",
        "1 0 0 0 1",
        "1 0 0 0 1",
        "1 0 1 0 1",
        "1 0 0 1 1",
        "0 1 1 1 1",
    ],
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


def in_circle(x, y, cx, cy, r):
    """Inside the circle of radius r centred on (cx, cy)."""
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render_legend():
    """Legend glyph blocks as (x0, y0, side) squares in high-res coords."""
    scale = 10
    glyph_w, glyph_h, gap = 5, 7, 2
    total_w = (glyph_w + gap) * len(LEGEND_TEXT) - gap
    ox = (HIGH - total_w * scale) // 2
    oy = CENTER - (glyph_h * scale) // 2
    blocks = []
    for gi, ch in enumerate(LEGEND_TEXT):
        gx = ox + gi * (glyph_w + gap) * scale
        for row, line in enumerate(FONT[ch]):
            for col, bit in enumerate(line.split()):
                if bit == "1":
                    blocks.append((gx + col * scale, oy + row * scale, scale))
    return blocks


def render():
    legend = render_legend()
    face_top, face_bot = CENTER - FACE_R, CENTER + FACE_R
    face_h = face_bot - face_top
    rows = []
    for y in range(HIGH):
        row = []
        for x in range(HIGH):
            if any(x >= x0 and x < x0 + s and y >= y0 and y < y0 + s for x0, y0, s in legend):
                color = (*LEGEND, 255)  # engraved legend
            elif in_circle(x, y, CENTER, CENTER, FACE_R):
                color = (*lerp(FACE_TOP, FACE_BOT, (y - face_top) / face_h), 255)
            elif in_circle(x, y, CENTER, CENTER, DISC_R):
                color = (*RIM, 255)
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


def parse_args(argv):
    """`--out PATH` (default: the shipped addon art) plus the `--preview` flag."""
    target = "QuickBinds/Media/icon.tga"
    for i, arg in enumerate(argv):
        if arg == "--out" and i + 1 < len(argv):
            target = argv[i + 1]
        elif arg.startswith("--out="):
            target = arg.split("=", 1)[1]
    return target, "--preview" in argv


if __name__ == "__main__":
    target, preview = parse_args(sys.argv[1:])
    pixels = downsample(render())
    directory = os.path.dirname(target)
    if directory:
        os.makedirs(directory, exist_ok=True)
    write_tga(pixels, target)
    print(f"wrote {target} ({SIZE}x{SIZE} 32-bit uncompressed TGA)")
    if preview:
        write_preview_png(pixels, "/tmp/quickbinds-icon-preview.png", scale=6)
        avg = lambda y, x, i: sum(pixels[2 * y + dy][2 * x + dx][i] for dy in range(2) for dx in range(2)) // 4
        small = [[tuple(avg(y, x, i) for i in range(4)) for x in range(32)] for y in range(32)]
        write_preview_png(small, "/tmp/quickbinds-icon-32.png", scale=8)
        print("previews: /tmp/quickbinds-icon-preview.png (6x), /tmp/quickbinds-icon-32.png (32px art at 8x)")
