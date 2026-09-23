#!/usr/bin/env python3
"""
Generate Chrome extension icons for Netflix Speed Booster.
Produces icons/icon-16.png, icon-32.png, icon-48.png, icon-128.png, and icon.svg.
Ensures the white forward chevron glyph is optically centered and perfectly matches
the in-app popup logo and on-screen HUD badge.
"""

import os
import shutil
import struct
import subprocess
import zlib

SIZES = [16, 32, 48, 128]
NETFLIX_RED = "#E50914"


def build_svg(size):
    """
    Construct the SVG for a given icon size with proper padding,
    corner radius, and optically centered forward chevrons matching popup.html.
    """
    s = size
    # 5% padding around rounded square so corners are not clipped
    p = round(s * 0.05) if s > 16 else 1
    w = s - 2 * p
    r = round(w * 0.20)

    # Chevron scale and gap adjustment:
    # At 16px, give slightly wider gap and slightly larger presence so the two
    # chevrons do not blur together into a single blob on 1x displays.
    if s == 16:
        glyph_ratio = 0.68
        path_d = "M4 18l7.5-6L4 6v12zm8.5-12v12l8.5-6L12.5 6z"
    else:
        glyph_ratio = 0.62
        # Exact SVG path used in popup/popup.html and content/content.js
        path_d = "M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"

    icon_w = w * glyph_ratio
    offset = p + (w - icon_w) / 2.0
    scale = icon_w / 24.0

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 {s} {s}">
  <rect x="{p}" y="{p}" width="{w}" height="{w}" rx="{r}" fill="{NETFLIX_RED}"/>
  <g transform="translate({offset:.2f}, {offset:.2f}) scale({scale:.4f})">
    <path d="{path_d}" fill="#ffffff"/>
  </g>
</svg>"""


def render_with_cli(svg_content, out_png_path, size):
    """Try rendering SVG using installed CLI tools (magick, convert, or rsvg-convert)."""
    target = f"png32:{out_png_path}"
    magick = shutil.which("magick")
    if magick:
        subprocess.run(
            [magick, "-background", "none", "svg:-", target],
            input=svg_content.encode("utf-8"),
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return True

    convert = shutil.which("convert")
    if convert:
        subprocess.run(
            [convert, "-background", "none", "svg:-", target],
            input=svg_content.encode("utf-8"),
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return True

    rsvg = shutil.which("rsvg-convert")
    if rsvg:
        subprocess.run(
            [rsvg, "-w", str(size), "-h", str(size), "-o", out_png_path],
            input=svg_content.encode("utf-8"),
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return True

    return False


def render_pure_python(size):
    """
    Self-contained pure-Python PNG generator using 4x4 supersampling (SSAA)
    as a robust fallback when no system image conversion tool is installed.
    """
    s = size
    p = round(s * 0.05) if s > 16 else 1
    w_box = s - 2 * p
    r = round(w_box * 0.20)

    if s == 16:
        glyph_ratio = 0.68
        t1_x0, t1_x1 = 4.0, 11.5
        t2_x0, t2_x1 = 12.5, 21.0
    else:
        glyph_ratio = 0.62
        t1_x0, t1_x1 = 4.0, 12.5
        t2_x0, t2_x1 = 13.0, 21.5

    icon_w = w_box * glyph_ratio
    offset = p + (w_box - icon_w) / 2.0
    scale = icon_w / 24.0

    box_cx = p + w_box / 2.0
    box_cy = p + w_box / 2.0
    inner_w = w_box / 2.0 - r

    sub_offsets = [0.125, 0.375, 0.625, 0.875]
    n_samples = len(sub_offsets) * len(sub_offsets)

    def sample(x, y):
        dx = max(0.0, abs(x - box_cx) - inner_w)
        dy = max(0.0, abs(y - box_cy) - inner_w)
        if dx > 0 and dy > 0:
            if dx * dx + dy * dy > r * r:
                return 0
        elif dx > r or dy > r:
            return 0

        svg_x = (x - offset) / scale
        svg_y = (y - offset) / scale

        in_t1 = (t1_x0 <= svg_x <= t1_x1) and abs(svg_y - 12.0) <= 6.0 * (t1_x1 - svg_x) / (t1_x1 - t1_x0)
        in_t2 = (t2_x0 <= svg_x <= t2_x1) and abs(svg_y - 12.0) <= 6.0 * (t2_x1 - svg_x) / (t2_x1 - t2_x0)

        if in_t1 or in_t2:
            return 2
        return 1

    raw_scanlines = bytearray()
    for y in range(s):
        raw_scanlines.append(0)
        for x in range(s):
            white_count = 0
            red_count = 0
            for sy in sub_offsets:
                for sx in sub_offsets:
                    res = sample(x + sx, y + sy)
                    if res == 2:
                        white_count += 1
                    elif res == 1:
                        red_count += 1

            total_bg = white_count + red_count
            alpha = int(255 * (total_bg / n_samples))
            if alpha == 0:
                raw_scanlines.extend((0, 0, 0, 0))
            else:
                white_frac = white_count / total_bg
                r_val = round(229 * (1.0 - white_frac) + 255 * white_frac)
                g_val = round(9 * (1.0 - white_frac) + 255 * white_frac)
                b_val = round(20 * (1.0 - white_frac) + 255 * white_frac)
                raw_scanlines.extend((r_val, g_val, b_val, alpha))

    compressed = zlib.compress(bytes(raw_scanlines), level=9)

    def chunk(tag, data):
        c = tag + data
        crc = zlib.crc32(c) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + c + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", s, s, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")


def main():
    icons_dir = "icons"
    os.makedirs(icons_dir, exist_ok=True)

    # Also save the master SVG (128x128)
    master_svg = build_svg(128)
    svg_path = os.path.join(icons_dir, "icon.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(master_svg)
    print(f"Saved master SVG: {svg_path}")

    for s in SIZES:
        svg_content = build_svg(s)
        out_png = os.path.join(icons_dir, f"icon-{s}.png")

        success = False
        try:
            success = render_with_cli(svg_content, out_png, s)
        except Exception as e:
            print(f"CLI render failed for {s}x{s} ({e}), falling back to Python...")

        if not success:
            png_bytes = render_pure_python(s)
            with open(out_png, "wb") as f:
                f.write(png_bytes)

        print(f"Generated {out_png} ({s}x{s})")


if __name__ == "__main__":
    main()
