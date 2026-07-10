# Meta-Prompt: Generate Exercise Carousel Image Prompts from JSON (Poster Style)


You will receive a JSON array of carousel slide objects, each with `heading`, `rating`, and `subtext` fields, plus a reference image attached to the request. Generate one AI image prompt per slide following these exact rules.

**Reference image lock (read the attached image before writing any prompt):**
Before generating prompts, analyze the attached reference image and note its exact style signature: Every prompt must lock onto this exact referrence image. 

**What to skip:**
- The first object (the carousel title/hook card with empty `rating` and `subtext`) — do not generate an image for it directly. Instead use it to write a Cover page prompt (see below).
- Any card whose heading starts with "Pro tip" — these are plug/tip slides and never get an image prompt.

**What to generate:**
1. **Cover page prompt (always first, labeled `## 0. Cover page`)** — a wide gym shot of the character doing a aesthatic pose, dark negative space in the upper third for the headline text overlay, composed as a poster (hero subject off-center, dramatic low angle, clean space for type). Not tied to any specific listed exercise.
2. **One prompt per remaining numbered/bonus exercise**, in the original order, labeled with its heading and rating exactly as given (e.g. `## 3. Front Squat (☠️ 9/10)`).

**Every single prompt (cover included) must open with this exact style-lock line:**
> Match the exact photographic style of the attached reference image — same color treatment, lighting direction and contrast, grain, sweat detail, any glow/light-beam effects, and cropped poster framing. Recreate it as a poster-style composition with clear negative space for text overlay.

**After the style-lock line, describe:**
- The specific exercise movement and equipment (correct camera angle for that lift — side-angle for hinges/rows, low-angle for presses, from-behind/below for pull-ups and hangs, etc.)
- The body position at the most visually loaded point of the rep (bottom of a squat, peak contraction, full stretch, lockout — whichever best shows the muscle working)
- Visible muscle engagement/strain relevant to that exercise
- Poster composition notes: where the negative space sits relative to the subject, how the subject is framed against the background, and where any accent lighting/effect from the reference should land on this new image
- Realistic gym environment details in frame (rack, machine, plates, bench, cable tower, gym floor) with the background softly blurred so the subject and any accent effects stay the visual focus

**If a listed item isn't a named exercise but a concept/habit/mistake/sign** (e.g. "skipping rest days," "not tracking progress," "better mind-muscle connection"), don't force a literal movement — build a representative gym moment instead (a fatigued pause between sets, a shaker bottle, a rack-side rest interval, etc.), still opening with the same style-lock line and poster composition notes.

**Rules to follow throughout:**
- Do NOT use the word "faceless" anywhere in any prompt.
- Do NOT re-describe the reference image's lighting/style in generic terms as a separate paragraph — the style-lock line plus the poster composition notes are the only style instructions; let the attached image itself carry the actual look.
- No stock-photo language, no "beast mode" energy, no product mentions.
- Output as a single markdown file, never .docx, titled `[topic]-carousel-image-prompts.md`, with each prompt under its own `##` heading in slide order.

Now generate prompts for this JSON (attach the reference image alongside this request):

```json
[PASTE JSON HERE]  ← replaced with the actual slides JSON at request time
```