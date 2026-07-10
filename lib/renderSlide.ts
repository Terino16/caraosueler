import type { SlideText, TextPositions, TextKey, TextStyle, AppIconConfig } from "./types";
import { DEFAULT_TEXT_STYLE } from "./types";

export const CANVAS_WIDTH  = 1080;
export const CANVAS_HEIGHT = 1920;

const HEADING_SIZE   = 45;
const RATING_SIZE    = 45;
const SUBTEXT_SIZE   = 38;
const OUTLINE_WIDTH  = 4;
const FONT_FAMILY    = '"Geist", system-ui, -apple-system, sans-serif';
const MAX_TEXT_WIDTH = Math.round(0.88 * CANVAS_WIDTH);

// ── helpers ──────────────────────────────────────────────────────────────────

/** Word-wrap a single paragraph (no newlines) to fit within maxWidth px. */
function wrapParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Split text on explicit `\n` newlines first, then word-wrap each segment.
 * This lets JSON values like "Line 1\nLine 2" render as two distinct lines.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const segments = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const seg of segments) {
    if (seg === "") {
      lines.push(""); // preserve intentional blank lines
    } else {
      lines.push(...wrapParagraph(ctx, seg, maxWidth));
    }
  }
  return lines;
}

/**
 * Draw outlined + filled text centred at (cx, cy).
 * Returns the total pixel height of the rendered block.
 */
function drawOutlinedTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  fontWeight: string,
  cx: number,
  cy: number,
  maxWidth: number,
  active: boolean,
  style: TextStyle,
): number {
  ctx.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
  ctx.textAlign    = style.align;
  ctx.textBaseline = "middle";

  // Apply letter-spacing (supported in modern browsers via the Canvas Text API)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx as any).letterSpacing = style.letterSpacing;

  const lines  = wrapText(ctx, text, maxWidth);
  const lineH  = fontSize * 1.35;
  const totalH = lines.length * lineH;
  const startY = cy - totalH / 2 + lineH / 2;

  // Active highlight — subtle dashed bounding box
  if (active) {
    const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const pad = fontSize * 0.4;
    // For left-aligned text the box origin is cx; for centred it is cx - half width
    const boxX = style.align === "left" ? cx - pad : cx - maxLineW / 2 - pad;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth   = Math.round(CANVAS_WIDTH / 270);
    ctx.setLineDash([Math.round(CANVAS_WIDTH / 108), Math.round(CANVAS_WIDTH / 216)]);
    ctx.strokeRect(boxX, cy - totalH / 2 - pad, maxLineW + pad * 2, totalH + pad * 2);
    ctx.setLineDash([]);
    ctx.restore();
  }

  for (let i = 0; i < lines.length; i++) {
    const ly = startY + i * lineH;

    // Outline pass (always black for legibility)
    ctx.strokeStyle = "#000000";
    ctx.lineWidth   = OUTLINE_WIDTH;
    ctx.lineJoin    = "round";
    ctx.strokeText(lines[i], cx, ly);

    // Fill pass — use the style colour
    ctx.fillStyle = style.color;
    ctx.fillText(lines[i], cx, ly);
  }

  // Reset letter-spacing so it doesn't bleed into other draw calls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx as any).letterSpacing = "0px";

  return totalH;
}

// ── grain ─────────────────────────────────────────────────────────────────────

/**
 * Tile and composite a monochromatic noise layer onto `ctx`.
 *
 * @param opacity  0–1 alpha baked into every noise pixel.
 * @param tileSize Side length of the repeating noise tile (px).
 *                 Smaller → finer grain; larger → coarser, more "filmic" grain.
 */
function drawGrainLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opacity: number,
  tileSize: number,
): void {
  const imageData = ctx.createImageData(tileSize, tileSize);
  const u32 = new Uint32Array(imageData.data.buffer);
  const a   = Math.round(opacity * 255);

  for (let i = 0; i < u32.length; i++) {
    const v = (Math.random() * 256) | 0;
    // Little-endian Uint32 layout → [R, G, B, A] bytes in canvas ImageData
    u32[i] = (a << 24) | (v << 16) | (v << 8) | v;
  }

  const tile = document.createElement("canvas");
  tile.width  = tileSize;
  tile.height = tileSize;
  tile.getContext("2d")!.putImageData(imageData, 0, 0);

  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;

  ctx.save();
  ctx.globalAlpha             = 1; // alpha already baked in
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Two-pass grain:
 *  Layer 1 — fine monochromatic noise  @ 2 %  (64 px tile, 1-pixel grain)
 *  Layer 2 — coarser filmic grain      @ 1 %  (128 px tile, slightly larger clumps)
 */
function drawGrain(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  drawGrainLayer(ctx, width, height, 0.02, 64);   // 2 % fine noise
  drawGrainLayer(ctx, width, height, 0.01, 128);  // 1 % coarser grain
}

export type DragTarget = TextKey | "appIcon";

export function getAppIconBounds(
  config: AppIconConfig,
  width: number,
  height: number,
): { cx: number; cy: number; size: number; left: number; top: number } {
  const size = config.size * width;
  const cx   = config.x * width;
  const cy   = config.y * height;
  return {
    cx,
    cy,
    size,
    left: cx - size / 2,
    top:  cy - size / 2,
  };
}

function drawAppIcon(
  ctx: CanvasRenderingContext2D,
  icon: HTMLImageElement,
  config: AppIconConfig,
  width: number,
  height: number,
  active: boolean,
): void {
  const { left, top, size } = getAppIconBounds(config, width, height);
  const radius = config.borderRadius * size;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, top, size, size, radius);
  ctx.clip();
  ctx.drawImage(icon, left, top, size, size);
  ctx.restore();

  if (active) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth   = Math.round(width / 270);
    ctx.setLineDash([Math.round(width / 108), Math.round(width / 216)]);
    ctx.beginPath();
    ctx.roundRect(left, top, size, size, radius);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Render one carousel slide onto the supplied canvas context.
 * `positions` holds normalised (0–1) coordinates for each text element.
 * `activeKey` (optional) highlights the element being dragged.
 */
export function drawSlide(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  text: SlideText | undefined,
  positions: TextPositions,
  width: number,
  height: number,
  activeKey?: DragTarget | null,
  appendPerTen = true,
  textStyle: TextStyle = DEFAULT_TEXT_STYLE,
  appIcon?: { image: HTMLImageElement; config: AppIconConfig } | null,
) {
  // ── black letterbox background ────────────────────────────────────────────
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  // ── contain-fit, centred ──────────────────────────────────────────────────
  const imgAspect    = image.naturalWidth / image.naturalHeight;
  const canvasAspect = width / height;

  let drawW: number, drawH: number, drawX: number, drawY: number;
  if (imgAspect > canvasAspect) {
    drawW = width;
    drawH = width / imgAspect;
    drawX = 0;
    drawY = (height - drawH) / 2;
  } else {
    drawH = height;
    drawW = height * imgAspect;
    drawX = (width - drawW) / 2;
    drawY = 0;
  }
  ctx.drawImage(image, drawX, drawY, drawW, drawH);

  if (!text) {
    if (appIcon) {
      drawAppIcon(ctx, appIcon.image, appIcon.config, width, height, activeKey === "appIcon");
    }
    drawGrain(ctx, width, height);
    return;
  }

  // Scale pixel values to this canvas width
  const s   = width / CANVAS_WIDTH;
  const mw  = MAX_TEXT_WIDTH * s;

  // ── heading ────────────────────────────────────────────────────────────────
  if (text.heading) {
    const cx = positions.heading.x * width;
    const cy = positions.heading.y * height;
    drawOutlinedTextBlock(
      ctx, text.heading, HEADING_SIZE * s, "700", cx, cy, mw,
      activeKey === "heading", textStyle,
    );
  }

  // ── rating ─────────────────────────────────────────────────────────────────
  const rawRating = text.rating !== undefined ? String(text.rating).trim() : "";
  const ratingStr = rawRating && appendPerTen && !rawRating.includes("/")
    ? `${rawRating}/10`
    : rawRating;
  if (ratingStr) {
    const cx = positions.rating.x * width;
    const cy = positions.rating.y * height;
    drawOutlinedTextBlock(
      ctx, ratingStr, RATING_SIZE * s, "600", cx, cy, mw,
      activeKey === "rating", textStyle,
    );
  }

  // ── subtext ────────────────────────────────────────────────────────────────
  if (text.subtext) {
    const cx = positions.subtext.x * width;
    const cy = positions.subtext.y * height;
    drawOutlinedTextBlock(
      ctx, text.subtext, SUBTEXT_SIZE * s, "400", cx, cy, mw,
      activeKey === "subtext", textStyle,
    );
  }

  // ── app icon overlay ──────────────────────────────────────────────────────
  if (appIcon) {
    drawAppIcon(ctx, appIcon.image, appIcon.config, width, height, activeKey === "appIcon");
  }

  // ── grain — drawn last so it sits on top of everything ────────────────────
  drawGrain(ctx, width, height);
}

/**
 * Returns the canvas-pixel centre of each text element at the given canvas
 * dimensions — used by SlidePreview for hit-testing on mouse/touch events.
 */
export function getTextCentres(
  positions: TextPositions,
  width: number,
  height: number,
): Record<TextKey, { cx: number; cy: number }> {
  return {
    heading: { cx: positions.heading.x * width, cy: positions.heading.y * height },
    rating:  { cx: positions.rating.x  * width, cy: positions.rating.y  * height },
    subtext: { cx: positions.subtext.x * width, cy: positions.subtext.y * height },
  };
}
