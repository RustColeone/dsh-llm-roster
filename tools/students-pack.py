#!/usr/bin/env python3
"""Make the Original Students art pack (packs/original-students.zip) from a ChimeraArchiveHarness checkout.

    python3 tools/students-pack.py ~/Projects/DiscordStudyBot

The five students (GPT, Claude, Gemini, DeepSeek, Grok) as ChimeraArchiveHarness drew them first: her art stages are the
tiers (stage-2 the middle tier, stage-3 the high, the awakened stage-4 the university), her chibi the chibi, and her
round avatar.png her portrait. Her bond pictures (a cafe, at home, a summer festival) are more cards to choose from, and
her mood faces more avatars. Cards are 512 x 768 and faces 192 px (the portrait 256), as in art/; the chibi and its
face are made as tools/import-art.py makes them. The other nine characters are not in it: they wear the bundled pack's.
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

ID = "original-students"
CARDS = {"middle": "stage-2", "high": "stage-3", "university": "stage-4", "cafe": "bond-1", "home": "bond-2", "festival": "bond-3"}
MOODS = ["happy", "calm", "worried", "sad"]
STAMP = (2026, 11, 10, 0, 0, 0)  # every file's date in the .zip, so the same pictures make the same .zip

PACK = {
    "_": "The five students as ChimeraArchiveHarness drew them first: their art stages as the tiers, with their bond "
         "pictures and mood faces to choose from. Every picture is named by its file. Made by tools/students-pack.py. "
         "The other characters wear the bundled pack's pictures.",
    "name": "Original Students",
    "zh-CN": "原版学生",
    "version": "1.0.0",
    "author": "ZipZipPipe (designs), 上善无形 (DeepSeek-chan); drawn for ChimeraArchiveHarness",
    "license": "CC BY-NC-SA 4.0",
    "url": "https://github.com/RustColeone/dsh-llm-roster",
    "description": {
        "name": "The five students' original art: their stages, from a school uniform to an awakened splash, with their "
                "bond pictures and mood faces.",
        "zh-CN": "五位学生的原版立绘：从校服到觉醒立绘的各个阶段，还有她们的羁绊图与心情表情。",
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
        "festival": {"name": "Summer festival", "zh-CN": "夏日祭"},
        "face-happy": {"name": "Happy", "zh-CN": "开心"},
        "face-calm": {"name": "Calm", "zh-CN": "平静"},
        "face-worried": {"name": "Worried", "zh-CN": "担心"},
        "face-sad": {"name": "Sad", "zh-CN": "悲伤"},
}

CREDITS = """# Original Students: credits and license

The five students (GPT, Claude, Gemini, DeepSeek and Grok) are the designs of **ZipZipPipe**
(https://space.bilibili.com/4168597/); DeepSeek-chan, the original character, is by **上善无形 (上善)**
(https://space.bilibili.com/4456176). These pictures are licensed under the Creative Commons
Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0,
https://creativecommons.org/licenses/by-nc-sa/4.0/).

They are adaptations, not the original works: each was generated with OpenAI's image model from the characters' design
sheets (as published in the AI-girl fan archive 蓝色大肥鱼.com) and their avatars by ChimeraArchiveHarness's
`tools/draw_students.py` (https://github.com/RustColeone/ChimeraArchiveHarness), with the prompts in its
`extensions/students/art.yml`: her stages (`stage-2`, `stage-3`, `stage-4`), her bond pictures (`bond-1` to `bond-3`),
her mood faces and her chibi. For this pack they were resized to the roster's cards (512 x 768) and faces by
dsh-llm-roster's `tools/students-pack.py`.
"""


def webp(image: Image.Image, quality: int) -> bytes:
    out = io.BytesIO()
    image.save(out, "WEBP", quality=quality)
    return out.getvalue()


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "~/Projects/DiscordStudyBot").expanduser()
    students = root / "extensions" / "students"
    # every picture by its file: her card and avatar at each tier (her portrait for her stages), and her others' names
    pack = dict(PACK)
    pack["characters"] = {name: {
        "art": {tier: f"{name}/{tier}.webp" for tier in ["chibi", "middle", "high", "university"]},
        "face": {"chibi": f"{name}/face-chibi.webp", **{tier: f"{name}/face.webp" for tier in ["middle", "high", "university"]}},
    } for name in art.CHARACTERS}
    pack["models"] = {}
    pack["pictures"] = {f"{name}/{picture}.webp": label for name in art.CHARACTERS for picture, label in LABELS.items()}
    files = {"pack.json": (json.dumps(pack, ensure_ascii=False, indent=2) + "\n").encode(), "CREDITS.md": CREDITS.encode()}
    for name in art.CHARACTERS:
        source = students / name
        files[f"{name}/face.webp"] = webp(Image.open(source / "avatar.png").convert("RGBA").resize((256, 256), Image.LANCZOS), 85)
        chibi = art.chibi(Image.open(source / "art" / "chibi.webp"))
        files[f"{name}/chibi.webp"] = webp(chibi, 82)
        x, y, side = art.FACES[name]["chibi"]
        backdrop = Image.new("RGBA", chibi.size, (235, 240, 250, 255))
        backdrop.alpha_composite(chibi)
        face = backdrop.crop((x - side // 2, y - side // 2, x + side // 2, y + side // 2)).resize((art.FACE, art.FACE), Image.LANCZOS)
        files[f"{name}/face-chibi.webp"] = webp(face.convert("RGB"), 85)
        for card, kind in CARDS.items():
            files[f"{name}/{card}.webp"] = webp(art.card(Image.open(source / "art" / f"{kind}.webp")).convert("RGB"), 80)
        for mood in MOODS:
            image = Image.open(source / "art" / f"mood-{mood}.webp").convert("RGB").resize((art.FACE, art.FACE), Image.LANCZOS)
            files[f"{name}/face-{mood}.webp"] = webp(image, 85)
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
