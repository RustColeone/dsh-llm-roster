#!/usr/bin/env python3
"""Draw the characters of tools/characters.yml with OpenAI's image model, into art/<name>/ as the roster ships them.

    python tools/draw-art.py --dry-run                          # what it would draw, and the prompts
    python tools/draw-art.py                                    # everything not drawn yet
    python tools/draw-art.py --characters kimi --tiers high --force   # draw one again
    python tools/draw-art.py --faces-only                       # crop every avatar again (after tuning `faces`)
    python tools/draw-art.py --original                         # the Original pack's pictures (tools/original-pack.py)

Each tier of each character is drawn from her standing art (and, for the chibi, the chibi style reference first), in
the style and with the prompts of characters.yml, the same as ChimeraArchiveHarness draws the other five. The drawing
is kept in tools/.drawn/<name>/<tier>.png (not shipped), and from it the card (art/<name>/<tier>.webp, 512 x 768; a
chibi on a transparent card) and the avatar (art/<name>/face-<tier>.webp, 192 px). With --original it draws the Original
pack's pictures instead (characters.yml `original`: her stages, bond pictures and mood faces), kept in
tools/.drawn/<name>/<kind>.png alone: tools/original-pack.py makes that pack's cards and faces of them. References are downloaded once into tools/.references/. Needs `openai`, `pillow` and `pyyaml`; the key is OPENAI_API_KEY, from the environment or the file
named by --env-file. Every call is printed with the tokens it used, so the cost is known.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "tools" / "characters.yml"
REFERENCES = ROOT / "tools" / ".references"
DRAWN = ROOT / "tools" / ".drawn"
ART = ROOT / "art"
CARD = (512, 768)
FACE = 192


def ascii_url(url: str) -> str:
    """An address urllib can open: the host in IDNA (蓝色大肥鱼.com), the path quoted."""
    parts = urllib.parse.urlsplit(url)
    host = parts.hostname.encode("idna").decode() + (f":{parts.port}" if parts.port else "")
    return urllib.parse.urlunsplit((parts.scheme, host, urllib.parse.quote(parts.path, safe="/%"), parts.query, ""))


def reference(label: str, url: str) -> Path:
    """A reference picture, downloaded once and kept at most 1536 pixels on its long side."""
    target = REFERENCES / f"{label}.png"
    if target.is_file():
        return target
    request = urllib.request.Request(ascii_url(url), headers={"User-Agent": "Mozilla/5.0 (dsh-llm-roster draw-art)"})
    with urllib.request.urlopen(request, timeout=120) as response:
        image = Image.open(io.BytesIO(response.read()))
    image.thumbnail((1536, 1536), Image.LANCZOS)
    REFERENCES.mkdir(parents=True, exist_ok=True)
    image.save(target, "PNG")
    return target


def prompt_for(plan: dict, name: str, tier: str, kinds: str = "tiers") -> str:
    who = {key: str(value) for key, value in plan["characters"][name].items()}
    return " ".join([plan["style"].format(**who), plan[kinds][tier]["prompt"].format(**who)])


def card(drawn: Path, tier: str) -> Image.Image:
    """The drawing as a 512 x 768 card: a portrait cover-cropped from the top, a chibi centred low on a clear card."""
    image = Image.open(drawn).convert("RGBA")
    if tier == "chibi":
        side = CARD[0]
        image = image.resize((side, side), Image.LANCZOS)
        canvas = Image.new("RGBA", CARD, (0, 0, 0, 0))
        canvas.paste(image, (0, CARD[1] - side - 40), image)
        return canvas
    w, h = image.size
    target = CARD[0] / CARD[1]
    if w / h > target:
        nw = int(h * target)
        image = image.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        image = image.crop((0, 0, w, int(w / target)))
    return image.resize(CARD, Image.LANCZOS)


def crop_face(card_path: Path, box) -> Image.Image:
    """The square around her face on a card, on a soft light background where the card is clear (the chibi)."""
    image = Image.open(card_path).convert("RGBA")
    x, y, side = box
    background = Image.new("RGBA", image.size, (235, 240, 250, 255))
    background.alpha_composite(image)
    return background.crop((x - side // 2, y - side // 2, x + side // 2, y + side // 2)).resize((FACE, FACE), Image.LANCZOS)


def ship(plan: dict, name: str, tier: str) -> None:
    """The card and the avatar of one drawn tier."""
    target = ART / name
    target.mkdir(parents=True, exist_ok=True)
    card(DRAWN / name / f"{tier}.png", tier).save(target / f"{tier}.webp", "WEBP", quality=80)
    box = (plan["characters"][name].get("faces") or {}).get(tier) or plan["face_defaults"][tier]
    crop_face(target / f"{tier}.webp", box).convert("RGB").save(target / f"face-{tier}.webp", "WEBP", quality=85)


def load_key(env_file: Path | None) -> str:
    key = os.getenv("OPENAI_API_KEY", "").strip().strip("\"'")
    if key or env_file is None or not env_file.is_file():
        return key
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip().strip("\"'")
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--characters", default="", help="comma-separated names (default: every character)")
    parser.add_argument("--tiers", default="", help="comma-separated tiers, or with --original its kinds (default: every one)")
    parser.add_argument("--original", action="store_true", help="draw the Original pack's pictures, not Academy's tiers")
    parser.add_argument("--force", action="store_true", help="draw again what is already drawn")
    parser.add_argument("--dry-run", action="store_true", help="only say what would be drawn")
    parser.add_argument("--faces-only", action="store_true", help="only crop the avatars again, from the drawings kept")
    parser.add_argument("--env-file", default="", help="where OPENAI_API_KEY is (if not in the environment)")
    arguments = parser.parse_args()
    plan = yaml.safe_load(PLAN.read_text(encoding="utf-8"))
    names = [item for item in arguments.characters.split(",") if item] or list(plan["characters"])
    kinds = "original" if arguments.original else "tiers"
    tiers = [item for item in arguments.tiers.split(",") if item] or list(plan[kinds])
    if arguments.faces_only:
        for name in names:
            for tier in tiers:
                if (DRAWN / name / f"{tier}.png").is_file():
                    ship(plan, name, tier)
        return 0
    jobs = [(name, tier) for name in names for tier in tiers
            if arguments.force or not (DRAWN / name / f"{tier}.png").is_file()]
    if arguments.dry_run:
        for name, tier in jobs:
            options = plan[kinds][tier]
            print(f"{name}/{tier}: {options['size']} {options['quality']}\n  {prompt_for(plan, name, tier, kinds)}\n")
        print(f"{len(jobs)} picture(s) to draw")
        return 0
    key = load_key(Path(arguments.env_file) if arguments.env_file else None)
    if not key:
        print("OPENAI_API_KEY is not set", file=sys.stderr)
        return 2
    from openai import OpenAI
    client = OpenAI(api_key=key, timeout=300)
    totals = {"pictures": 0, "input_tokens": 0, "output_tokens": 0}
    for index, (name, tier) in enumerate(jobs, 1):
        options = plan[kinds][tier]
        about = plan["characters"][name]
        paths = ([reference("chibi-style", plan["chibi_reference"])] if options.get("chibi_reference") else []) + \
            [reference(name, about["image"])]
        images = []
        for number, path in enumerate(paths):
            picture = io.BytesIO(path.read_bytes())
            picture.name = f"reference-{number}.png"
            images.append(picture)
        extra = {"background": options["background"]} if options.get("background") else {}
        started = time.monotonic()
        try:
            response = client.images.edit(model=plan["model"], image=images, prompt=prompt_for(plan, name, tier, kinds),
                                          size=options["size"], quality=options["quality"], output_format="png", **extra)
        except Exception as error:  # say it and go on (an empty account stops everything after it too)
            print(f"[{index}/{len(jobs)}] {name}/{tier}: FAILED {type(error).__name__}: {str(error)[:300]}", flush=True)
            if "insufficient_quota" in str(error) or "billing" in str(error).lower():
                return 3
            continue
        data = next((base64.b64decode(item.b64_json) for item in response.data or () if getattr(item, "b64_json", None)), None)
        if data is None:
            print(f"[{index}/{len(jobs)}] {name}/{tier}: no picture came back", flush=True)
            continue
        (DRAWN / name).mkdir(parents=True, exist_ok=True)
        (DRAWN / name / f"{tier}.png").write_bytes(data)
        if kinds == "tiers":
            ship(plan, name, tier)
        usage = getattr(response, "usage", None)
        used = {"input_tokens": getattr(usage, "input_tokens", 0) or 0, "output_tokens": getattr(usage, "output_tokens", 0) or 0}
        totals["pictures"] += 1
        for field in ("input_tokens", "output_tokens"):
            totals[field] += used[field]
        print(f"[{index}/{len(jobs)}] {name}/{tier}: {options['size']} {options['quality']} · {used['input_tokens']} in / "
              f"{used['output_tokens']} out · {time.monotonic() - started:.0f}s", flush=True)
    print(json.dumps(totals))
    return 0


if __name__ == "__main__":
    sys.exit(main())
