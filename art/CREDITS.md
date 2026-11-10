# Art credits and license

The five characters (GPT, Claude, Gemini, DeepSeek and Grok) are the designs of
**ZipZipPipe** (https://space.bilibili.com/4168597/), licensed under the
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
([legal code](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en)).

DeepSeek-chan, the original character, is by **上善无形 (上善)** (https://space.bilibili.com/4456176).

The design sheets used are these, as published in the AI-girl fan archive 蓝色大肥鱼.com:

| Character | Design sheet |
| --- | --- |
| GPT | https://蓝色大肥鱼.com/works/gpt202610170004.html |
| Claude | https://蓝色大肥鱼.com/works/claude202610030001.html |
| Gemini | https://蓝色大肥鱼.com/works/gemini202610170002.html |
| DeepSeek | https://蓝色大肥鱼.com/works/deepseek202610170005.html |
| Grok | https://蓝色大肥鱼.com/works/grok202610170001.html |
| (chibi style) | https://蓝色大肥鱼.com/works/deepseek202610210007.html |

## Changes

The pictures in this folder are adaptations, not the original works.

- **New illustrations.** Each was generated with OpenAI's image model from the design sheets and the characters'
  avatars by [ChimeraArchiveHarness](https://github.com/RustColeone/ChimeraArchiveHarness)'s
  `tools/draw_students.py`. Its prompts are in `extensions/students/art.yml`: a chibi, and a middle-school,
  high-school and university version of each character. The middle-school and university pictures of Gemini,
  DeepSeek and Grok were drawn on 2026-11-09 with the same tool and prompts.
- **Resized and cropped** for shipping by [`tools/import-art.py`](../tools/import-art.py):

| File | Source in ChimeraArchiveHarness (`extensions/students/<name>/`) |
| --- | --- |
| `<name>/face.webp` | `avatar.png`, 256 px |
| `<name>/chibi.webp` | `art/chibi.webp`, on a 2:3 card |
| `<name>/middle.webp` | `art/model-chuugakusei.webp` |
| `<name>/high.webp` | `art/model-koukousei.webp` |
| `<name>/university.webp` | `art/model-daigakusei.webp` |

These adapted pictures are shared under the same license, CC BY-NC-SA 4.0, as ShareAlike requires. If you reuse
them:

- credit ZipZipPipe for the character designs, and 上善无形 for DeepSeek-chan;
- link the license, and say that the pictures are AI-generated adaptations;
- don't use them commercially;
- share any adaptation of them under the same license.

The original works come with no warranties.

Pictures you upload in the roster stay in your DSH home (`llm-roster/art/`). They are not part of this package or
this license.
