import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { readFileSync } from "fs";
import { join } from "path";
import { CAROUSEL_BRANDS, type BrandKey } from "@/lib/carousel-brands";

type SlideInput = {
  heading?: string;
  rating?: string | number;
  subtext?: string;
};

function loadTemplate(brand: BrandKey): string {
  const config = CAROUSEL_BRANDS[brand];
  return readFileSync(join(process.cwd(), config.templatePath), "utf-8");
}

function buildSystemPrompt(template: string, slidesJson: string): string {
  return template.replace(/```json[\s\S]*?```/, "```json\n" + slidesJson + "\n```");
}

/** Slides that should never receive an AI image */
function isSkipped(slide: SlideInput, index: number): boolean {
  const h = (slide.heading ?? "").trim().toLowerCase();

  const GYM_MANUAL_INDEX = CAROUSEL_BRANDS.gym.manualSlideIndex;
  if (GYM_MANUAL_INDEX !== null && index === GYM_MANUAL_INDEX) return true;
  return h.startsWith("pro tip");
}

function fallbackUserMessage(hasReference: boolean): string {
  if (hasReference) {
    return "Generate the image prompts now, using the attached reference image to lock the visual style.";
  }
  return "Generate the image prompts now. No reference image was provided, so invent a plausible, realistic gym-photo style.";
}

/**
 * Align the markdown sections emitted by gpt-5.4-nano back to their original
 * slide indices, respecting skipped slides.
 *
 * gpt-5.4-nano is instructed to skip certain slides, so its output may have
 * fewer sections than the total slide count.  We advance through sections only
 * for non-skipped indices.
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

interface RequestBody {
  slides: SlideInput[];
  referenceImageBase64?: string;
  referenceMediaType?: string;
  brand?: BrandKey;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as RequestBody;
    const { slides, referenceImageBase64, referenceMediaType } = body;
    const brand: BrandKey = body.brand ?? "gym";

    if (!Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json({ error: "slides array is required" }, { status: 400 });
    }
    if (!(brand in CAROUSEL_BRANDS)) {
      return NextResponse.json({ error: `Unknown brand: ${brand}` }, { status: 400 });
    }

    const apiKey = process.env.OPEN_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPEN_AI_API_KEY is not set" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });
    const template = loadTemplate(brand);
    const slidesJson = JSON.stringify(slides, null, 2);
    const systemPrompt = buildSystemPrompt(template, slidesJson);

    const hasReference = Boolean(referenceImageBase64);
    const userContent: string | ChatCompletionContentPart[] = hasReference
      ? [
          {
            type: "text",
            text: fallbackUserMessage(true),
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${referenceMediaType ?? "image/png"};base64,${referenceImageBase64}`,
            },
          },
        ]
      : fallbackUserMessage(false);

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
    });

    const markdown = completion.choices[0]?.message?.content ?? "";
    const prompts = parsePromptsFromMarkdown(markdown, slides);

    return NextResponse.json({ prompts, rawMarkdown: markdown });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
