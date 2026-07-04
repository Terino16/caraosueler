import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";

const SLIDE_4_INDEX = 3; // 0-based; always user-uploaded

const TEMPLATE = readFileSync(
  join(process.cwd(), "public", "she75-wellness-prompt-template.md"),
  "utf-8",
);

function buildSystemPrompt(slidesJson: string): string {
  return TEMPLATE.replace(/```json[\s\S]*?```/, "```json\n" + slidesJson + "\n```");
}

type SlideInput = { heading?: string; rating?: string | number; subtext?: string };

/** True for any slide that should never receive an AI image */
function isSkipped(slide: SlideInput, index: number): boolean {
  if (index === SLIDE_4_INDEX) return true;
  const h = (slide.heading ?? "").trim().toLowerCase();
  return h.startsWith("pro tip");
}

/**
 * Align the markdown sections emitted by gpt-5.4-nano back to their original
 * slide indices, respecting skipped slides (slide 4, Pro tip cards).
 */
function parsePromptsFromMarkdown(
  markdown: string,
  slides: SlideInput[],
): (string | null)[] {
  const sections = markdown.split(/^##\s+/m).slice(1);

  const extracted = sections.map((s) => {
    const body = s.split("\n").slice(1).join("\n").trim();
    return body || null;
  });

  const result: (string | null)[] = new Array(slides.length).fill(null);
  let sectionIdx = 0;

  for (let i = 0; i < slides.length; i++) {
    if (isSkipped(slides[i], i)) continue;
    result[i] = extracted[sectionIdx] ?? null;
    sectionIdx++;
  }

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { slides: SlideInput[] };
    const { slides } = body;

    if (!Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json({ error: "slides array is required" }, { status: 400 });
    }

    const apiKey = process.env.OPEN_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPEN_AI_API_KEY is not set" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });
    const slidesJson = JSON.stringify(slides, null, 2);
    const systemPrompt = buildSystemPrompt(slidesJson);

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the wellness lifestyle image prompts now." },
      ],
      temperature: 0.8, // slightly higher for more creative scene variation
    });

    const markdown = completion.choices[0]?.message?.content ?? "";
    const prompts = parsePromptsFromMarkdown(markdown, slides);

    return NextResponse.json({ prompts, rawMarkdown: markdown });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
