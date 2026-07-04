import type { SlideText } from "./types";

type ParseSuccess = { data: SlideText[] };
type ParseError = { error: string };
type ParseResult = ParseSuccess | ParseError;

export function parseSlideText(raw: string): ParseResult {
  if (!raw.trim()) {
    return { error: "Input is empty." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Invalid JSON — please check your formatting." };
  }

  if (!Array.isArray(parsed)) {
    return { error: "JSON must be an array of objects, e.g. [{\"heading\": \"...\"}]." };
  }

  const results: SlideText[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { error: `Entry at index ${i} must be an object (got ${Array.isArray(item) ? "array" : String(item)}).` };
    }

    const obj = item as Record<string, unknown>;
    const slide: SlideText = {};

    if ("heading" in obj) {
      if (typeof obj.heading !== "string") {
        return { error: `Entry ${i}: "heading" must be a string if provided.` };
      }
      slide.heading = obj.heading;
    }

    if ("rating" in obj) {
      const r = obj.rating;
      if (typeof r !== "string" && typeof r !== "number") {
        return { error: `Entry ${i}: "rating" must be a string or number if provided.` };
      }
      slide.rating = r;
    }

    if ("subtext" in obj) {
      if (typeof obj.subtext !== "string") {
        return { error: `Entry ${i}: "subtext" must be a string if provided.` };
      }
      slide.subtext = obj.subtext;
    }

    results.push(slide);
  }

  return { data: results };
}

export function isParseError(result: ParseResult): result is ParseError {
  return "error" in result;
}
