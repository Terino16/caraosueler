import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai";

interface RequestBody {
  prompt: string;
  referenceImageBase64?: string;
  referenceMediaType?: string;
}

/**
 * gpt-image-2 doesn't accept `response_format`.
 * Extract base64 from whatever shape the API returns.
 */
async function extractBase64(
  item: { b64_json?: string | null; url?: string | null } | undefined,
): Promise<string> {
  if (!item) throw new Error("No image data in response");

  if (item.b64_json) return item.b64_json;

  if (item.url) {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`Failed to fetch generated image URL: ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  }

  throw new Error("Response contained neither b64_json nor url");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as RequestBody;
    const { prompt, referenceImageBase64, referenceMediaType } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const apiKey = process.env.OPEN_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPEN_AI_API_KEY is not set" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });

    let imageBase64: string;

    if (referenceImageBase64) {
      const mediaType = (referenceMediaType ?? "image/png") as
        | "image/png"
        | "image/jpeg"
        | "image/webp"
        | "image/gif";
      const buffer = Buffer.from(referenceImageBase64, "base64");
      const file = await toFile(buffer, "reference.png", { type: mediaType });

      const response = await openai.images.edit({
        model: "gpt-image-2",
        image: file,
        prompt,
        // "1024x1536" is the standard portrait size per the docs pricing table.
        // The previous "1024x1792" is non-standard — it has ~16 % more pixels and
        // a higher price than 1024x1536 with no documented quality benefit.
        size: "1024x1536",
        // Explicitly set low quality.  Omitting this defaults to "auto" which
        // the API may resolve to "high" ($0.165 vs $0.005 per image at 1024x1536).
        quality: "low",
      });

      imageBase64 = await extractBase64(response.data?.[0]);
    } else {
      const response = await openai.images.generate({
        model: "gpt-image-2",
        prompt,
        size: "1024x1536",
        quality: "low",
      });

      imageBase64 = await extractBase64(response.data?.[0]);
    }

    return NextResponse.json({ imageBase64 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
