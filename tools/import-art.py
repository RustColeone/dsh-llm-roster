#!/usr/bin/env python3
"""Copy the five characters' art from a ChimeraArchiveHarness checkout into art/, small enough to ship.

    python3 tools/import-art.py ~/Projects/DiscordStudyBot

For each character (extensions/students/<name>/): avatar.png becomes face.webp (256 px square, the composer's round
avatar), and each tier gets one card picture (512 x 768): chibi (art/chibi.webp, padded onto a card), middle
(model-chuugakusei, else stage-2), high (model-koukousei, else stage-3) and university (model-daigakusei, else stage-4).
art/art.json is not touched: it says which model is which tier.
"""
import sys
from pathlib import Path

from PIL import Image

CHARACTERS = ["gpt", "claude", "gemini", "deepseek", "grok"]
TIERS = {  # tier -> source pictures in her art/ folder, first found wins
    "middle": ["model-chuugakusei.webp", "stage-2.webp"],
    "high": ["model-koukousei.webp", "stage-3.webp"],
    "university": ["model-daigakusei.webp", "stage-4.webp"],
}
CARD = (512, 768)


def card(image: Image.Image) -> Image.Image:
    """Cover-crop to 2:3, then resize to CARD."""
    image = image.convert("RGBA")
    w, h = image.size
    target = CARD[0] / CARD[1]
    if w / h > target:
        nw = int(h * target)
        image = image.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target)
        image = image.crop((0, 0, w, nh))  # keep the head: crop from the top
    return image.resize(CARD, Image.LANCZOS)


def chibi(image: Image.Image) -> Image.Image:
    """A transparent square chibi, centred low on a transparent 2:3 card."""
    image = image.convert("RGBA")
    side = CARD[0]
    image = image.resize((side, side), Image.LANCZOS)
    canvas = Image.new("RGBA", CARD, (0, 0, 0, 0))
    canvas.paste(image, (0, CARD[1] - side - 40), image)
    return canvas


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "~/Projects/DiscordStudyBot").expanduser()
    students = root / "extensions" / "students"
    out = Path(__file__).resolve().parent.parent / "art"
    for name in CHARACTERS:
        source = students / name
        target = out / name
        target.mkdir(parents=True, exist_ok=True)
        face = Image.open(source / "avatar.png").convert("RGBA").resize((256, 256), Image.LANCZOS)
        face.save(target / "face.webp", "WEBP", quality=85)
        chibi(Image.open(source / "art" / "chibi.webp")).save(target / "chibi.webp", "WEBP", quality=82)
        for tier, files in TIERS.items():
            found = next((source / "art" / file for file in files if (source / "art" / file).is_file()), None)
            if found is None:
                print(f"{name}: no picture for {tier}", file=sys.stderr)
                continue
            card(Image.open(found)).save(target / f"{tier}.webp", "WEBP", quality=80)
            print(f"{name}/{tier}.webp <- {found.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
