import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

interface RequestBody {
  currentPhotoBase64: string;
  currentMediaType: string;
  inspirationPhotoBase64: string;
  inspirationMediaType: string;
}

// ── Step 1: Analyse both photos with gpt-5.4-nano vision ─────────────────────
// Produces a precise "transformation delta" text that the image edit step uses
// as an explicit instruction.

async function analyseTransformationDelta(
  openai: OpenAI,
  currentBase64: string,
  currentMediaType: string,
  inspirationBase64: string,
  inspirationMediaType: string,
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5.4-nano",
    messages: [
      {
        role: "system",
        content: `You are an expert fitness physique analyst.
You will receive TWO photos: PHOTO A (the person's current body) and PHOTO B (the target/inspiration physique).
Your job is to describe in very precise, actionable terms what physical changes need to happen to transform Photo A's body into Photo B's body.
Focus only on body attributes. Be specific about the direction and magnitude of each change.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: "PHOTO A — Current body (the person to be transformed):" },
          {
            type: "image_url",
            image_url: {
              url: `data:${currentMediaType};base64,${currentBase64}`,
              // "low" instead of "high" — reduces input tokens by ~85 % for this
              // vision-only analysis step.  The physique comparison only needs
              // coarse structural detail, not full-fidelity pixel analysis.
              detail: "low",
            },
          },
          { type: "text", text: "PHOTO B — Target/Inspiration physique:" },
          {
            type: "image_url",
            image_url: {
              url: `data:${inspirationMediaType};base64,${inspirationBase64}`,
              detail: "low",
            },
          },
          {
            type: "text",
            text: `Compare Photo A and Photo B and describe the TRANSFORMATION DELTA — exactly what needs to change to turn Photo A's body into Photo B's body:

1. Body fat change (increase/decrease, where, by how much visually)
2. Muscle definition change (more/less separation, vascularity, striations)
3. Overall muscle mass change (larger/smaller, which groups)
4. Waist/midsection change (narrower/wider, softer/harder)
5. Shoulder/hip width proportions change
6. Limb (arms/legs) change in size and definition
7. Skin texture and tone change
8. Any other notable structural changes

Be very direct: say "add significant belly fat / soften the abs" or "dramatically increase bicep size and definition".`,
          },
        ],
      },
    ],
    max_completion_tokens: 600,
  });

  return completion.choices[0]?.message?.content ?? "";
}

// ── Step 2: Generate transformation with images.edit() ────────────────────────
// The Image API's edit endpoint accepts an array of images, so we can pass
// BOTH the current photo and the inspiration photo as references.  This is
// simpler and cheaper than the Responses API because:
//   • No mainline model token cost (Responses API adds gpt-5.x token charges
//     on top of the image generation cost for every call).
//   • Directly uses gpt-image-2 via the Image API.
//   • The doc explicitly shows passing multiple images to images.edit().

async function generateTransformation(
  openai: OpenAI,
  currentBase64: string,
  currentMediaType: string,
  inspirationBase64: string,
  inspirationMediaType: string,
  deltaDescription: string,
): Promise<string> {
  const currentBuffer = Buffer.from(currentBase64, "base64");
  const currentFile = await toFile(currentBuffer, "current.png", {
    type: currentMediaType,
  });

  const inspirationBuffer = Buffer.from(inspirationBase64, "base64");
  const inspirationFile = await toFile(inspirationBuffer, "inspiration.png", {
    type: inspirationMediaType,
  });

  const prompt = `You are given two reference photos and must generate a body transformation image.

IMAGE 1 (Current person): The individual whose face, hair, skin tone, and identity must be preserved exactly.
IMAGE 2 (Target physique): The body shape, proportions, and composition to apply to the person from Image 1.

TRANSFORMATION TASK:
Apply the following specific body changes from Image 2 onto the person from Image 1:

${deltaDescription}

STRICT RULES:
- Face: Copy EXACTLY from Image 1. Do not alter facial features, expression, or structure in any way.
- Hair: Keep identical to Image 1.
- Identity: The person must be immediately recognisable as the same individual from Image 1.
- Body transformation: Apply the FULL body shape, fat distribution, and proportions visible in Image 2. This is a DRAMATIC transformation — do not be subtle.
- Clothing: Keep the same as Image 1, adjusted to fit the new body shape naturally.
- Background and setting: Keep identical to Image 1.
- Lighting: Match Image 1's lighting direction and colour temperature.
- Photorealism: Output must look like a real, natural photograph.

Generate the transformed image now.`;

  const response = await openai.images.edit({
    model: "gpt-image-2",
    // Pass both images as an array — Image API fully supports multiple references.
    // This replaces the previous responses.create() call which was
    // architecturally incorrect: gpt-image-2 cannot be used as the primary model
    // in responses.create(); only mainline models (gpt-5.x) can, and they add
    // their own token cost on every request.
    image: [currentFile, inspirationFile],
    prompt,
    size: "1024x1024",
    quality: "low",
  });

  const item = response.data?.[0];
  if (!item) throw new Error("No image data in response");

  if (item.b64_json) return item.b64_json;

  if (item.url) {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`Failed to fetch image URL: ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  }

  throw new Error("Response contained neither b64_json nor url");
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as RequestBody;
    const {
      currentPhotoBase64,
      currentMediaType,
      inspirationPhotoBase64,
      inspirationMediaType,
    } = body;

    if (!currentPhotoBase64 || !inspirationPhotoBase64) {
      return NextResponse.json(
        { error: "Both currentPhotoBase64 and inspirationPhotoBase64 are required" },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPEN_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPEN_AI_API_KEY is not set" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });

    // Step 1 — produce the transformation delta description
    const deltaDescription = await analyseTransformationDelta(
      openai,
      currentPhotoBase64,
      currentMediaType || "image/jpeg",
      inspirationPhotoBase64,
      inspirationMediaType || "image/jpeg",
    );

    // Step 2 — generate the transformed image via images.edit()
    const imageBase64 = await generateTransformation(
      openai,
      currentPhotoBase64,
      currentMediaType || "image/jpeg",
      inspirationPhotoBase64,
      inspirationMediaType || "image/jpeg",
      deltaDescription,
    );

    return NextResponse.json({ imageBase64, deltaDescription });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
