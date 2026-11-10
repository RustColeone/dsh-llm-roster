# Art credits and license

The fourteen characters (GPT, Claude, Gemini, DeepSeek, Grok, Kimi, GLM, Qwen, Mistral, MiniMax, Llama, Doubao,
Perplexity and Hunyuan) are the designs of **ZipZipPipe** (https://space.bilibili.com/4168597/), licensed under the
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
| Kimi | https://蓝色大肥鱼.com/works/kimi202610170001.html |
| GLM | https://蓝色大肥鱼.com/works/glm202610170001.html |
| Qwen | https://蓝色大肥鱼.com/works/qwen202610170001.html |
| Mistral | https://蓝色大肥鱼.com/works/mistral202610170001.html |
| MiniMax | https://蓝色大肥鱼.com/works/minimax202610170001.html |
| Llama | https://蓝色大肥鱼.com/works/llama202610170001.html |
| Doubao | https://蓝色大肥鱼.com/works/doubao202610170001.html |
| Perplexity | https://蓝色大肥鱼.com/works/perplexity202610170001.html |
| Hunyuan | https://蓝色大肥鱼.com/works/hunyuan202610170001.html |
| (chibi style) | https://蓝色大肥鱼.com/works/deepseek202610210007.html |

## Changes

The pictures in this folder are adaptations, not the original works.

- **New illustrations.** Each was generated with OpenAI's image model from the design sheets and the characters'
  avatars by [ChimeraArchiveHarness](https://github.com/RustColeone/ChimeraArchiveHarness)'s
  `tools/draw_students.py`. Its prompts are in `extensions/students/art.yml`: a chibi, and a middle-school,
  high-school and university version of each character. The middle-school and university pictures of Gemini,
  DeepSeek and Grok were drawn on 2026-11-09 with the same tool and prompts.
- **The other nine** (Kimi, GLM, Qwen, Mistral, MiniMax, Llama, Doubao, Perplexity and Hunyuan) were drawn on
  2026-11-10 by this project's [`tools/draw-art.py`](../tools/draw-art.py), in the same style and with the same tier
  prompts, from each one's standing art alone (and the chibi style reference for her chibi). The prompts and her look
  are in [`tools/characters.yml`](../tools/characters.yml), and the tool writes her cards and faces as below.
- **Resized and cropped** for shipping by [`tools/import-art.py`](../tools/import-art.py) (the first five):

| File | Source in ChimeraArchiveHarness (`extensions/students/<name>/`) |
| --- | --- |
| `<name>/face.webp` | `avatar.png`, 256 px |
| `<name>/chibi.webp` | `art/chibi.webp`, on a 2:3 card |
| `<name>/middle.webp` | `art/model-chuugakusei.webp` |
| `<name>/high.webp` | `art/model-koukousei.webp` |
| `<name>/university.webp` | `art/model-daigakusei.webp` |
| `<name>/face-<tier>.webp` | each tier's face, cropped from its card (192 px) |

These adapted pictures are shared under the same license, CC BY-NC-SA 4.0, as ShareAlike requires. If you reuse
them:

- credit ZipZipPipe for the character designs (all fourteen), and 上善无形 for DeepSeek-chan;
- link the license, and say that the pictures are AI-generated adaptations;
- don't use them commercially;
- share any adaptation of them under the same license.

The original works come with no warranties.

Pictures you upload in the roster stay in your DSH home (`llm-roster/art/`). They are not part of this package or
this license.
