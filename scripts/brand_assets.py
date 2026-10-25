#!/usr/bin/env python3
"""Cuts Plana's portraits, logo and Discord avatar from the art in /branding.

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

# Mood name -> source expression number (Plana_Portrait_Expression_<n>.webp).
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

# The crop, in source pixels. The sources are 1000x1905, all in one pose.
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
    return Image.open(SOURCES / f"Plana_Portrait_Expression_{n}.webp").convert("RGBA")


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
    crop = source(n).crop(CANVAS)
    half = BADGE_WIDTH / 2
    cx = BADGE_LEFT - CANVAS[0] + half
    cy = BADGE_TOP - CANVAS[1] + half
    ss = 4  # draw the mask large and shrink it, for a smooth edge
    mask = Image.new("L", (crop.width * ss, crop.height * ss), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(x * ss, y * ss) for x, y in cookie9(cx, cy, half)], fill=255)
    draw.rectangle((0, 0, mask.width, cy * ss), fill=255)
    mask = mask.resize(crop.size, Image.LANCZOS)
    out = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    out.paste(crop, (0, 0), mask)
    height = round(OUT_WIDTH * out.height / out.width)
    return out.resize((OUT_WIDTH, height), Image.LANCZOS)


def logo(size: int) -> Image.Image:
    """Her Standby face on the navy circle, close in, without the halo."""
    crop = source(MOODS["standby"]).crop(LOGO_BOX)
    big = 1024  # draw the circle large and shrink it, for a smooth edge
    disc = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(disc).ellipse((0, 0, big - 1, big - 1), fill=PRIMARY_CONTAINER)
    face = crop.resize((big, big), Image.LANCZOS)
    circle = Image.new("L", (big, big), 0)
    ImageDraw.Draw(circle).ellipse((0, 0, big - 1, big - 1), fill=255)
    disc.paste(face, (0, 0), Image.composite(face.getchannel("A"), circle, circle))
    return disc.resize((size, size), Image.LANCZOS)


def main() -> None:
    PORTRAITS.mkdir(parents=True, exist_ok=True)
    AVATAR.parent.mkdir(parents=True, exist_ok=True)

    for mood, n in MOODS.items():
        portrait(n).save(PORTRAITS / f"{mood}.webp", quality=90, method=6)

    # The mark at the top of the navigation rail.
    logo(128).save(PORTRAITS / "logo.webp", quality=90, method=6)

    # Uploaded by hand as the bot's avatar in the Developer Portal; the favicon is that avatar.
    logo(1024).save(AVATAR)

    print(f"Wrote {len(MOODS)} portraits, the logo, and {AVATAR.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
