#!/usr/bin/env python3
"""Cuts Plana's portraits, logo, backdrop, sign-in scene and Discord avatar from the art in /branding.

Run from the repository root: python3 scripts/brand_assets.py (needs Pillow).
Every shipped image comes from here; never edit the outputs by hand. See BRANDING.md.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "branding" / "expressions"
PORTRAITS = ROOT / "src" / "assets" / "plana"
AVATAR = ROOT / "branding" / "out" / "discord-avatar.png"

# The faint scene behind the stand-alone pages (sign-in, 404). Shown at low opacity under a
# dark surface, so it is saved small: full width, lower quality.
BACKDROP_SOURCE = ROOT / "branding" / "BG_CS_PV4_161_2.jpg"
BACKDROP_WIDTH = 1600

# The sign-in scene: three frames of her checking a fingerprint, in the order they play.
# The source numbers don't follow the story: _3 raises the finger, _2 adds the scan grid.
SCENE = {
    "scene-look": ROOT / "branding" / "BG_CS_StudentCouncil_03_1.jpg",
    "scene-raise": ROOT / "branding" / "BG_CS_StudentCouncil_03_3.jpg",
    "scene-scan": ROOT / "branding" / "BG_CS_StudentCouncil_03_2.jpg",
}
SCENE_WIDTH = 1600

# Mood name -> source expression number. Expression 1 is Plana_00.png; the rest are Plana_<nn>.png.
MOODS = {
    "standby": 1,
    "content": 16,
    "attentive": 8,
    "curious": 9,
    "asleep": 99,
    "hesitant": 18,
    "uneasy": 7,
    "puzzled": 6,
    "confused": 13,
    "stern": 11,
}

# The sources are lossless PNGs, 1000x1920. Every box below is still in the pixels of the older
# lossy WebPs (1000x1905) they replaced, so the framing is unchanged: a WebP pixel (x, y) is PNG
# pixel (x, y) * PNG_SCALE + PNG_OFFSET, fitted by matching the two sets of art.
PNG_SCALE = 1.0168
PNG_OFFSET = (-8.4, -8.6)
PNG_PAD = 32  # transparent margin, since the canvas starts slightly above the PNG's top edge

# The crop, in WebP pixels. All the expressions are in one pose.
# Everything is centred on her eyes: the midpoint between her visible pupil (x=597) and
# the one under her fringe, mirrored across her nose (x=536).
EYES_X = 536

# The canvas is wider than the badge so her ribbon and halo can flow out past it.
CANVAS_WIDTH, CANVAS_HEIGHT = 720, 760
CANVAS = (EYES_X - CANVAS_WIDTH // 2, 0, EYES_X + CANVAS_WIDTH // 2, CANVAS_HEIGHT)
BADGE_WIDTH = 560  # the M3 9-sided cookie she stands in
BADGE_LEFT, BADGE_TOP = EYES_X - BADGE_WIDTH // 2, 200
OUT_WIDTH = 360  # saved width of the whole canvas

# The logo is a tighter square on her face, so it still reads at 16px.
LOGO_WIDTH = 440
LOGO_BOX = (EYES_X - LOGO_WIDTH // 2, 220, EYES_X + LOGO_WIDTH // 2, 220 + LOGO_WIDTH)

# Theme colour behind the logo. Must match --color-primary-container in main.css.
PRIMARY_CONTAINER = "#364479"


def source(n: int) -> Image.Image:
    art = Image.open(SOURCES / f"Plana_{0 if n == 1 else n:02d}.png").convert("RGBA")
    padded = Image.new("RGBA", (art.width + 2 * PNG_PAD, art.height + 2 * PNG_PAD), (0, 0, 0, 0))
    padded.paste(art, (PNG_PAD, PNG_PAD))
    return padded


def cut(n: int, box: tuple[float, float, float, float], size: tuple[int, int]) -> Image.Image:
    """The box (in WebP pixels) from expression n, resampled once straight to size."""
    x0, y0, x1, y1 = box
    dx, dy = PNG_OFFSET[0] + PNG_PAD, PNG_OFFSET[1] + PNG_PAD
    png_box = (x0 * PNG_SCALE + dx, y0 * PNG_SCALE + dy, x1 * PNG_SCALE + dx, y1 * PNG_SCALE + dy)
    return source(n).resize(size, Image.LANCZOS, box=png_box)


def cookie9(cx: float, cy: float, radius: float, steps: int = 720) -> list[tuple[float, float]]:
    """M3's 9-sided cookie: nine rounded lobes, inner radius 0.8, one lobe pointing up.

    Must match cookiePath() in src/components/PlanaPortrait.vue.
    """
    points = []
    for i in range(steps):
        theta = 2 * math.pi * i / steps
        r = radius * (0.9 + 0.1 * math.cos(9 * theta))
        # theta 0 is straight up; y grows downwards.
        points.append((cx + r * math.sin(theta), cy - r * math.cos(theta)))
    return points


def portrait(n: int) -> Image.Image:
    """Her, cut off at the cookie's edge from its middle down; everything above stands clear."""
    k = OUT_WIDTH / CANVAS_WIDTH
    crop = cut(n, CANVAS, (OUT_WIDTH, round(CANVAS_HEIGHT * k)))
    half = BADGE_WIDTH / 2 * k
    cx = (BADGE_LEFT - CANVAS[0]) * k + half
    cy = (BADGE_TOP - CANVAS[1]) * k + half
    ss = 4  # draw the mask large and shrink it, for a smooth edge
    mask = Image.new("L", (crop.width * ss, crop.height * ss), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(x * ss, y * ss) for x, y in cookie9(cx, cy, half)], fill=255)
    draw.rectangle((0, 0, mask.width, cy * ss), fill=255)
    mask = mask.resize(crop.size, Image.LANCZOS)
    out = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    out.paste(crop, (0, 0), mask)
    return out


def logo(size: int) -> Image.Image:
    """Her Standby face on the navy circle, close in, without the halo."""
    big = 1024  # draw the circle large and shrink it, for a smooth edge
    disc = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(disc).ellipse((0, 0, big - 1, big - 1), fill=PRIMARY_CONTAINER)
    face = cut(MOODS["standby"], LOGO_BOX, (big, big))
    circle = Image.new("L", (big, big), 0)
    ImageDraw.Draw(circle).ellipse((0, 0, big - 1, big - 1), fill=255)
    disc.paste(face, (0, 0), Image.composite(face.getchannel("A"), circle, circle))
    return disc.resize((size, size), Image.LANCZOS)


def fit_width(path: Path, width: int) -> Image.Image:
    image = Image.open(path).convert("RGB")
    if image.width > width:
        height = round(image.height * width / image.width)
        image = image.resize((width, height), Image.LANCZOS)
    return image


def main() -> None:
    PORTRAITS.mkdir(parents=True, exist_ok=True)
    AVATAR.parent.mkdir(parents=True, exist_ok=True)

    for mood, n in MOODS.items():
        portrait(n).save(PORTRAITS / f"{mood}.webp", quality=90, method=6)

    # The mark at the top of the navigation rail.
    logo(128).save(PORTRAITS / "logo.webp", quality=90, method=6)

    # Behind the stand-alone pages.
    fit_width(BACKDROP_SOURCE, BACKDROP_WIDTH).save(PORTRAITS / "backdrop.webp", quality=72, method=6)

    # The sign-in scene, shown at full strength, so saved at a higher quality than the backdrop.
    for name, path in SCENE.items():
        fit_width(path, SCENE_WIDTH).save(PORTRAITS / f"{name}.webp", quality=80, method=6)

    # Uploaded by hand as the bot's avatar in the Developer Portal; the favicon is that avatar.
    logo(1024).save(AVATAR)

    print(f"Wrote {len(MOODS)} portraits, the logo, the backdrop, {len(SCENE)} scene frames and {AVATAR.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
