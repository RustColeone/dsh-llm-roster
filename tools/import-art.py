#!/usr/bin/env python3
"""Copy the five characters' art from a ChimeraArchiveHarness checkout into art/, as sharp as its sources.

    python3 tools/import-art.py ~/Projects/DiscordStudyBot

For each character (extensions/students/<name>/): avatar.png becomes face.webp (256 px square), and each tier gets one
card picture (2:3, at its source's own size, at most 1024 wide; WebP quality 86): chibi (art/chibi.webp, padded onto a
card), middle (model-chuugakusei, else stage-2), high (model-koukousei, else stage-3) and university (model-daigakusei,
else stage-4); and its own round avatar, face-<tier>.webp (256 px), cropped from the card at FACES (centre x, centre y,
side, as on a 512 x 768 card: scaled to the card's own size), so the avatar beside DSH's model picker says the tier at
a glance. art/pack.json and plugin/models.json are not touched: they
name the characters and tiers, and say which model is which tier.
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
CARD = (512, 768)  # the card the FACES boxes are measured on; a card is its source's own size (MOST wide at most)
MOST = 1024
FACE = 256
QUALITY = 86
# Where each tier's face is on its card: centre x, centre y, side (chosen by eye; check a new picture's crop).
FACES = {
    "gpt": {"chibi": (258, 398, 230), "middle": (276, 182, 236), "high": (284, 192, 236), "university": (284, 176, 236)},
    "claude": {"chibi": (256, 378, 230), "middle": (250, 196, 236), "high": (250, 192, 236), "university": (242, 186, 236)},
    "gemini": {"chibi": (256, 384, 230), "middle": (252, 214, 236), "high": (262, 196, 236), "university": (266, 196, 236)},
    "deepseek": {"chibi": (256, 398, 230), "middle": (250, 204, 236), "high": (242, 196, 236), "university": (260, 186, 236)},
    "grok": {"chibi": (244, 392, 230), "middle": (242, 210, 236), "high": (262, 202, 236), "university": (252, 186, 236)},
}


def card(image: Image.Image) -> Image.Image:
    """Cover-crop to 2:3, at the source's own size (no larger than MOST wide: no picture is made bigger)."""
    image = image.convert("RGBA")
    w, h = image.size
    target = CARD[0] / CARD[1]
    if w / h > target:
        nw = int(h * target)
        image = image.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target)
        image = image.crop((0, 0, w, nh))  # keep the head: crop from the top
    width = min(image.size[0], MOST)
    return image.resize((width, round(width / target)), Image.LANCZOS) if width != image.size[0] else image


def chibi(image: Image.Image) -> Image.Image:
    """A transparent square chibi, centred low on a transparent 2:3 card as wide as it is (MOST at most)."""
    image = image.convert("RGBA")
    side = min(image.size[0], MOST)
    image = image.resize((side, side), Image.LANCZOS) if image.size != (side, side) else image
    canvas = Image.new("RGBA", (side, round(side * 1.5)), (0, 0, 0, 0))
    canvas.paste(image, (0, canvas.size[1] - side - round(40 * side / CARD[0])), image)
    return canvas


def scaled(box: tuple[int, int, int], width: int) -> tuple[int, int, int]:
    """A FACES box (as on a 512 x 768 card) on a card `width` wide."""
    k = width / CARD[0]
    return tuple(round(value * k) for value in box)


def crop_face(card_path: Path, box: tuple[int, int, int]) -> Image.Image:
    """The square around a face on a card, on a soft light background where the card is transparent (the chibi)."""
    image = Image.open(card_path).convert("RGBA")
    x, y, side = scaled(box, image.size[0])
    background = Image.new("RGBA", image.size, (235, 240, 250, 255))
    background.alpha_composite(image)
    return background.crop((x - side // 2, y - side // 2, x + side // 2, y + side // 2)).resize((FACE, FACE), Image.LANCZOS)


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "~/Projects/DiscordStudyBot").expanduser()
    students = root / "extensions" / "students"
    out = Path(__file__).resolve().parent.parent / "art"
    for name in CHARACTERS:
        source = students / name
        target = out / name
        target.mkdir(parents=True, exist_ok=True)
        face = Image.open(source / "avatar.png").convert("RGBA").resize((256, 256), Image.LANCZOS)
        face.save(target / "face.webp", "WEBP", quality=88, method=6)
        chibi(Image.open(source / "art" / "chibi.webp")).save(target / "chibi.webp", "WEBP", quality=QUALITY, method=6)
        for tier, files in TIERS.items():
            found = next((source / "art" / file for file in files if (source / "art" / file).is_file()), None)
            if found is None:
                print(f"{name}: no picture for {tier}", file=sys.stderr)
                continue
            card(Image.open(found)).save(target / f"{tier}.webp", "WEBP", quality=QUALITY, method=6)
            print(f"{name}/{tier}.webp <- {found.name}")
        for tier, box in FACES[name].items():
            crop_face(target / f"{tier}.webp", box).convert("RGB").save(target / f"face-{tier}.webp", "WEBP", quality=88, method=6)
    return 0


if __name__ == "__main__":
    sys.exit(main())
