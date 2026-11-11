#!/usr/bin/env python3
"""Make the Original art pack (packs/original.zip): the fourteen characters' art stages, bond pictures and mood faces.

    python3 tools/original-pack.py ~/Projects/DiscordStudyBot

Her art stages are the tiers (stage-2 the middle tier, stage-3 the high, the awakened stage-4 the university), her chibi
the chibi; her bond pictures (a cafe, at home, a summer festival) are more cards to choose from, and her mood faces more
avatars. The first five (GPT, Claude, Gemini, DeepSeek, Grok) are as ChimeraArchiveHarness drew them, from the checkout
named, with her round avatar.png her portrait. The other nine are drawn by this project with the same prompts
(`python tools/draw-art.py --original`, kept in tools/.drawn/), their chibi is the bundled pack's (art/), and their
portrait is the face of their stage-2 drawing. Cards are their sources' own size (2:3, at most 1024 wide, WebP quality
86) and faces 256 px, as in art/; the first five's chibi and its face are made as tools/import-art.py makes them.
"""
import importlib.util
import io
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("import_art", HERE / "import-art.py")
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)

ID = "original"
CARDS = {"middle": "stage-2", "high": "stage-3", "university": "stage-4", "cafe": "bond-1", "home": "bond-2", "festival": "bond-3"}
MOODS = ["happy", "calm", "worried", "sad"]
# the nine this project draws (tools/characters.yml), and where each one's face is on her stage-2 drawing (1024 x 1536):
# centre x, centre y, side (chosen by eye; check a new drawing's crop)
NINE = ["kimi", "glm", "qwen", "mistral", "minimax", "llama", "doubao", "perplexity", "hunyuan"]
PORTRAIT = (512, 430, 600)
PORTRAITS: dict[str, tuple[int, int, int]] = {
    "kimi": (470, 390, 600), "qwen": (480, 390, 600), "mistral": (450, 470, 600), "minimax": (440, 440, 600),
    "llama": (470, 470, 600), "doubao": (450, 370, 600), "perplexity": (540, 400, 600),
}
DRAWN = HERE / ".drawn"
STAMP = (2026, 11, 11, 0, 0, 0)  # every file's date in the .zip, so the same pictures make the same .zip

PACK = {
    "_": "The fourteen characters in their art stages, as the tiers, with their bond pictures and mood faces to choose "
         "from; the first five as ChimeraArchiveHarness drew them. Every picture is named by its file. Made by "
         "tools/original-pack.py.",
    "name": "Original",
    "zh-CN": "原版",
    "version": "2.2.0",
    "author": "ZipZipPipe (designs), 上善无形 (DeepSeek-chan); the first five drawn for ChimeraArchiveHarness",
    "license": "CC BY-NC-SA 4.0",
    "url": "https://github.com/RustColeone/dsh-llm-roster",
    "description": {
        "name": "Every character's art stages, from a school uniform to an awakened splash, with her bond pictures and "
                "mood faces.",
        "zh-CN": "每位角色的立绘阶段：从校服到觉醒立绘，并带有她的羁绊图与心情表情。",
    },
    "tiers": {
        "chibi": {"name": "Chibi", "zh-CN": "Q版"},
        "middle": {"name": "Stage 2", "zh-CN": "二阶段"},
        "high": {"name": "Stage 3", "zh-CN": "三阶段"},
        "university": {"name": "Awakened", "zh-CN": "觉醒"},
    },
}
# what her pictures that are no tier's are called (in pack.json, by each one's file)
LABELS = {
        "cafe": {"name": "Café", "zh-CN": "咖啡厅"},
        "home": {"name": "At home", "zh-CN": "居家"},
        "festival": {"name": "Summer festival", "zh-CN": "夏日祭", "stars": 5},  # (★5 as an outfit in the summon; the others ★4)
        "face-happy": {"name": "Happy", "zh-CN": "开心"},
        "face-calm": {"name": "Calm", "zh-CN": "平静"},
        "face-worried": {"name": "Worried", "zh-CN": "担心"},
        "face-sad": {"name": "Sad", "zh-CN": "悲伤"},
}

CREDITS = """# Original: credits and license

The fourteen characters (GPT, Claude, Gemini, DeepSeek, Grok, Kimi, GLM, Qwen, Mistral, MiniMax, Llama, Doubao,
Perplexity and Hunyuan) are the designs of **ZipZipPipe** (https://space.bilibili.com/4168597/); DeepSeek-chan, the
original character, is by **上善无形 (上善)** (https://space.bilibili.com/4456176). These pictures are licensed under the
Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0,
https://creativecommons.org/licenses/by-nc-sa/4.0/).

They are adaptations, not the original works, each generated with OpenAI's image model:

- GPT, Claude, Gemini, DeepSeek and Grok from their design sheets (as published in the AI-girl fan archive
  蓝色大肥鱼.com) and their avatars, by ChimeraArchiveHarness's `tools/draw_students.py`
  (https://github.com/RustColeone/ChimeraArchiveHarness), with the prompts in its `extensions/students/art.yml`: her
  stages (`stage-2`, `stage-3`, `stage-4`), her bond pictures (`bond-1` to `bond-3`), her mood faces and her chibi.
- The other nine from their standing art (as kept in the same archive), by dsh-llm-roster's `tools/draw-art.py
  --original`, with the same prompts for her stages, bond pictures and mood faces (in its `tools/characters.yml`);
  their chibi is dsh-llm-roster's bundled one.

For this pack they were resized to the roster's cards (512 x 768) and faces by dsh-llm-roster's
`tools/original-pack.py`.
"""


def webp(image: Image.Image, quality: int) -> bytes:
    out = io.BytesIO()
    image.save(out, "WEBP", quality=quality, method=6)
    return out.getvalue()


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "~/Projects/DiscordStudyBot").expanduser()
    students = root / "extensions" / "students"
    everyone = [*art.CHARACTERS, *NINE]
    kinds = [*CARDS.values(), *(f"mood-{mood}" for mood in MOODS)]
    missing = [f"{name}/{kind}" for name in NINE for kind in kinds if not (DRAWN / name / f"{kind}.png").is_file()]
    if missing:
        print(f"not drawn yet (python tools/draw-art.py --original): {', '.join(missing)}", file=sys.stderr)
        return 2
    # every picture by its file: her card and avatar at each tier (her portrait for her stages), and her others' names
    pack = dict(PACK)
    pack["characters"] = {name: {
        "art": {tier: f"{name}/{tier}.webp" for tier in ["chibi", "middle", "high", "university"]},
        "face": {"chibi": f"{name}/face-chibi.webp", **{tier: f"{name}/face.webp" for tier in ["middle", "high", "university"]}},
    } for name in everyone}
    pack["models"] = {}
    pack["pictures"] = {f"{name}/{picture}.webp": label for name in everyone for picture, label in LABELS.items()}
    files = {"pack.json": (json.dumps(pack, ensure_ascii=False, indent=2) + "\n").encode(), "CREDITS.md": CREDITS.encode()}
    for name in art.CHARACTERS:
        source = students / name
        files[f"{name}/face.webp"] = webp(Image.open(source / "avatar.png").convert("RGBA").resize((256, 256), Image.LANCZOS), 88)
        chibi = art.chibi(Image.open(source / "art" / "chibi.webp"))
        files[f"{name}/chibi.webp"] = webp(chibi, art.QUALITY)
        x, y, side = art.scaled(art.FACES[name]["chibi"], chibi.size[0])
        backdrop = Image.new("RGBA", chibi.size, (235, 240, 250, 255))
        backdrop.alpha_composite(chibi)
        face = backdrop.crop((x - side // 2, y - side // 2, x + side // 2, y + side // 2)).resize((art.FACE, art.FACE), Image.LANCZOS)
        files[f"{name}/face-chibi.webp"] = webp(face.convert("RGB"), 88)
        for card, kind in CARDS.items():
            files[f"{name}/{card}.webp"] = webp(art.card(Image.open(source / "art" / f"{kind}.webp")).convert("RGB"), art.QUALITY)
        for mood in MOODS:
            image = Image.open(source / "art" / f"mood-{mood}.webp").convert("RGB").resize((art.FACE, art.FACE), Image.LANCZOS)
            files[f"{name}/face-{mood}.webp"] = webp(image, 88)
    bundled = HERE.parent / "art"
    for name in NINE:
        for file in ["chibi.webp", "face-chibi.webp"]:
            files[f"{name}/{file}"] = (bundled / name / file).read_bytes()
        for card, kind in CARDS.items():
            files[f"{name}/{card}.webp"] = webp(art.card(Image.open(DRAWN / name / f"{kind}.png")).convert("RGB"), art.QUALITY)
        for mood in MOODS:
            image = Image.open(DRAWN / name / f"mood-{mood}.png").convert("RGB").resize((art.FACE, art.FACE), Image.LANCZOS)
            files[f"{name}/face-{mood}.webp"] = webp(image, 88)
        x, y, side = PORTRAITS.get(name, PORTRAIT)
        drawing = Image.open(DRAWN / name / "stage-2.png").convert("RGB")
        portrait = drawing.crop((x - side // 2, y - side // 2, x + side // 2, y + side // 2)).resize((256, 256), Image.LANCZOS)
        files[f"{name}/face.webp"] = webp(portrait, 88)
    out = HERE.parent / "packs" / f"{ID}.zip"
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w") as archive:
        for path, data in sorted(files.items()):
            info = zipfile.ZipInfo(f"{ID}/{path}", STAMP)
            info.compress_type = zipfile.ZIP_STORED if path.endswith(".webp") else zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    print(f"{out.relative_to(HERE.parent)}: {len(files)} files, {out.stat().st_size / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
