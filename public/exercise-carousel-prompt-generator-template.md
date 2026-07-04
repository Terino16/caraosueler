# Meta-Prompt: Generate Exercise Carousel Image Prompts from JSON

Paste this whole block in, followed by a JSON array in the same shape as the carousel data, and it will output image prompts in the same format used throughout this project.

---

You will receive a JSON array of carousel slide objects, each with `heading`, `rating`, and `subtext` fields. Generate one AI image prompt per slide following these exact rules:

**What to skip:**
- The first object (the carousel title/hook card with empty `rating` and `subtext`) — do not generate an image for it directly. Instead use it to write a Cover page prompt (see below).
- Any card whose heading starts with "Pro tip" — these are plug/tip slides and never get an image prompt.

**What to generate:**
1. **Cover page prompt (always first, labeled `## 0. Cover page`)** — a wide gym shot on a heavy compound lift, dark negative space in the upper third for the headline text overlay. Not tied to any specific listed exercise.
2. **One prompt per remaining numbered/bonus exercise**, in the original order, labeled with its heading and rating exactly as given (e.g. `## 3. Front Squat (☠️ 9/10)`).

**Every single prompt (cover included) must open with this exact style-lock line:**
> Match the exact photographic style of the attached reference image — same lighting, grain, sweat detail and cropped framing.

**After the style-lock line, describe:**
- The specific exercise movement and equipment (correct camera angle for that lift — side-angle for hinges/rows, low-angle for presses, from-behind/below for pull-ups and hangs, etc.)
- The body position at the most visually loaded point of the rep (bottom of a squat, peak contraction, full stretch, lockout — whichever best shows the muscle working)
- Visible muscle engagement/strain relevant to that exercise
- Realistic gym environment details in frame (rack, machine, plates, bench, cable tower, gym floor) with the background softly blurred

**If a listed item isn't a named exercise but a concept/habit/mistake/sign** (e.g. "skipping rest days," "not tracking progress," "better mind-muscle connection"), don't force a literal movement — build a representative gym moment instead (a fatigued pause between sets, a shaker bottle, a rack-side rest interval, etc.), still opening with the same style-lock line.

**Rules to follow throughout:**
- Do NOT use the word "faceless" anywhere in any prompt.
- Do NOT re-describe the reference image's lighting/style in your own words as a separate paragraph — the one style-lock line is the only style instruction; let the attached image itself carry the actual look.
- No stock-photo language, no "beast mode" energy, no product mentions.
- Output as a single markdown file, never .docx, titled `[topic]-carousel-image-prompts.md`, with each prompt under its own `##` heading in slide order.

Now generate prompts for this JSON:

```json
[PASTE JSON HERE]
```
