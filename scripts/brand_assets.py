#!/usr/bin/env python3
"""Writes Plana's live rig, logo, backdrop, sign-in scene and Discord avatar from the art in /branding.

Run from the repository root: python3 scripts/brand_assets.py (needs Pillow).
Every shipped image comes from here; never edit the outputs by hand. See BRANDING.md.
"""

import json
import math
import subprocess
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

# Her live rig (Spine 3.8, from the game): the binary skeleton is converted to 3.8 JSON with
# scripts/spine38_to_json.mjs and played by Rigby2D (src/lib/rigby). Only the animations the
# app plays are kept, and values are rounded, to keep the download small.
RIG_SOURCE = ROOT / "branding" / "NP0035_spr"
RIG = PORTRAITS / "rig"
RIG_ANIMATIONS = [
    "Idle_01", "Eye_Close_01", "Look_01_M", "LookEnd_01_M", "Pat_01_M", "PatEnd_01_M",
    "17",  # the heart halo, while she is patted
]

# Mood name -> expression number: the face animation the rig keeps for each mood (the same as
# MOOD_ANIMATION in src/lib/plana-live.ts). The logo is cut from Standby's PNG, Plana_00.png.
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


def rounded(value, places: int = 4):
    if isinstance(value, float):
        return round(value, places)
    if isinstance(value, list):
        return [rounded(v, places) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v, places) for k, v in value.items()}
    return value


def rig() -> None:
    """Writes her rig for the live portraits: skeleton JSON, atlas, and the atlas page as WebP."""
    RIG.mkdir(parents=True, exist_ok=True)
    converted = RIG / "plana.full.json"
    subprocess.run(
        ["bun", str(ROOT / "scripts" / "spine38_to_json.mjs"), str(RIG_SOURCE / "NP0035_spr.skel"), str(converted)],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    skeleton = json.loads(converted.read_text())
    converted.unlink()
    keep = RIG_ANIMATIONS + [f"{n:02d}" for n in MOODS.values()]
    skeleton["animations"] = {k: v for k, v in skeleton["animations"].items() if k in keep}
    (RIG / "plana.json").write_text(json.dumps(rounded(skeleton), separators=(",", ":")))

    atlas = (RIG_SOURCE / "NP0035_spr.atlas").read_text()
    (RIG / "plana.atlas").write_text(atlas.replace("NP0035_spr.png", "plana.webp"))  # the page's file
    page = Image.open(RIG_SOURCE / "NP0035_spr.png").convert("RGBA")
    page.save(RIG / "plana.webp", quality=90, alpha_quality=100, method=6)


def main() -> None:
    PORTRAITS.mkdir(parents=True, exist_ok=True)
    AVATAR.parent.mkdir(parents=True, exist_ok=True)

    # Her portraits are live: the rig, played in the badge by the app (src/lib/plana-live.ts).
    rig()

    # The mark at the top of the navigation rail.
    logo(128).save(PORTRAITS / "logo.webp", quality=90, method=6)

    # Behind the stand-alone pages.
    fit_width(BACKDROP_SOURCE, BACKDROP_WIDTH).save(PORTRAITS / "backdrop.webp", quality=72, method=6)

    # The sign-in scene, shown at full strength, so saved at a higher quality than the backdrop.
    for name, path in SCENE.items():
        fit_width(path, SCENE_WIDTH).save(PORTRAITS / f"{name}.webp", quality=80, method=6)

    # Uploaded by hand as the bot's avatar in the Developer Portal; the favicon is that avatar.
    logo(1024).save(AVATAR)

    print(f"Wrote the rig, the logo, the backdrop, {len(SCENE)} scene frames and {AVATAR.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
