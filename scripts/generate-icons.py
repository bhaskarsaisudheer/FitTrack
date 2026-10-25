#!/usr/bin/env python3
"""Generates the FitTrack PWA icon set.

The icons are drawn from the same dumbbell mark used in the app's favicon and
rendered to PNG with a tiny dependency-free encoder, so the repository does not
need any image tooling installed to regenerate them.

Usage:
    python3 scripts/generate-icons.py
"""

from __future__ import annotations

import pathlib
import struct
import zlib

BASE_SIZE = 512
SUPERSAMPLE = 4

BACKGROUND = (0x0B, 0x11, 0x20)
ACCENT = (0xA3, 0xE6, 0x35)

# (x, y, width, height, corner_radius) in 512x512 coordinate space.
DUMBBELL_PLATES = [
    (60, 228, 28, 56, 12),
    (424, 228, 28, 56, 12),
    (96, 216, 34, 80, 14),
    (382, 216, 34, 80, 14),
]
DUMBBELL_BARS = [
    (142, 196, 228, 24, 12),
    (142, 292, 228, 24, 12),
]


def rounded_rect_coverage(
    x: float, y: float, rect: tuple[int, int, int, int, int]
) -> bool:
    """Returns True when the point falls inside a rounded rectangle."""
    rx, ry, rw, rh, radius = rect
    if not (rx <= x < rx + rw and ry <= y < ry + rh):
        return False

    # Distance to the nearest corner centre.
    cx = min(max(x, rx + radius), rx + rw - radius)
    cy = min(max(y, ry + radius), ry + rh - radius)
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= radius * radius


def render(size: int, scale: float) -> list[list[tuple[int, int, int]]]:
    """Renders the icon at `size` pixels, returning an RGB pixel buffer."""
    hi = size * SUPERSAMPLE
    step = BASE_SIZE / hi

    # Build the shape list once, scaled around the icon centre.
    shapes: list[tuple[tuple[int, int, int, int, int], tuple[int, int, int]]] = []
    for rect in DUMBBELL_PLATES + DUMBBELL_BARS:
        x, y, w, h, r = rect
        offset = BASE_SIZE * (1 - scale) / 2
        scaled = (
            round(x * scale + offset),
            round(y * scale + offset),
            round(w * scale),
            round(h * scale),
            max(1, round(r * scale)),
        )
        shapes.append((scaled, ACCENT))

    hi_pixels: list[list[tuple[int, int, int]]] = []
    for py in range(hi):
        row: list[tuple[int, int, int]] = []
        sy = (py + 0.5) * step
        for px in range(hi):
            sx = (px + 0.5) * step
            colour = BACKGROUND
            for rect, fill in shapes:
                if rounded_rect_coverage(sx, sy, rect):
                    colour = fill
                    break
            row.append(colour)
        hi_pixels.append(row)

    # Box-filter down to the target size for anti-aliasing.
    pixels: list[list[tuple[int, int, int]]] = []
    for y in range(size):
        row = []
        for x in range(size):
            r = g = b = 0
            for dy in range(SUPERSAMPLE):
                for dx in range(SUPERSAMPLE):
                    pr, pg, pb = hi_pixels[y * SUPERSAMPLE + dy][x * SUPERSAMPLE + dx]
                    r += pr
                    g += pg
                    b += pb
            count = SUPERSAMPLE * SUPERSAMPLE
            row.append((r // count, g // count, b // count))
        pixels.append(row)
    return pixels


def write_png(path: pathlib.Path, pixels: list[list[tuple[int, int, int]]]) -> None:
    """Writes an RGB pixel buffer to a PNG file."""
    height = len(pixels)
    width = len(pixels[0])

    raw = bytearray()
    for row in pixels:
        raw.append(0)  # Filter type 0 (None).
        for r, g, b in row:
            raw.extend((r, g, b))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def main() -> None:
    out_dir = pathlib.Path(__file__).resolve().parent.parent / "client" / "public" / "icons"

    # Standard icons: the mark fills the frame.
    for size in (192, 512):
        write_png(out_dir / f"icon-{size}.png", render(size, scale=1.0))

    # Maskable icon: the mark is inset so it survives an aggressive mask.
    write_png(out_dir / "maskable-512.png", render(512, scale=0.72))

    # Apple touch icon: iOS does not apply transparency.
    write_png(out_dir / "apple-touch-icon.png", render(180, scale=1.0))

    print(f"Wrote icons to {out_dir}")


if __name__ == "__main__":
    main()
