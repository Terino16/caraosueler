import JSZip from "jszip";
import type { Slide, TextPositions, TextStyle, AppIconConfig } from "./types";
import { DEFAULT_TEXT_STYLE, APP_ICON_SRC } from "./types";
import { drawSlide, CANVAS_WIDTH, CANVAS_HEIGHT } from "./renderSlide";
import { getNextOrderNumber, formatOrderedZipName } from "./orderCounter";

export interface SlideExport extends Slide {
  positions: TextPositions;
  textStyle?: TextStyle;
  appIcon?: AppIconConfig;
  /**
   * Public path to a per-slide overlay image (e.g. a brand logo or UI screenshot).
   * When set, takes precedence over the global APP_ICON_SRC for this slide.
   * Requires appIcon to also be set for positioning/sizing config.
   */
  overlayAssetSrc?: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas.toBlob returned null"));
    }, "image/png");
  });
}

export async function exportZip(
  slides: SlideExport[],
  appendPerTen: boolean,
  onProgress?: (done: number, total: number) => void,
  projectPrefix: string = "carousel",
): Promise<void> {
  const zip = new JSZip();
  const total = slides.length;

  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2D context");

  // Load the global app icon only if at least one slide needs it (no per-slide overlay).
  const needsGlobalIcon = slides.some((s) => s.appIcon && !s.overlayAssetSrc);
  const globalAppIconImg = needsGlobalIcon ? await loadImage(APP_ICON_SRC) : null;

  // Cache per-slide overlay images so the same path isn't fetched twice.
  const overlayCache = new Map<string, HTMLImageElement>();

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const img   = await loadImage(slide.objectUrl);

    let iconOverlay: { image: HTMLImageElement; config: AppIconConfig } | null = null;

    if (slide.appIcon) {
      if (slide.overlayAssetSrc) {
        // Per-slide overlay: load and cache.
        let overlayImg = overlayCache.get(slide.overlayAssetSrc);
        if (!overlayImg) {
          overlayImg = await loadImage(slide.overlayAssetSrc);
          overlayCache.set(slide.overlayAssetSrc, overlayImg);
        }
        iconOverlay = { image: overlayImg, config: slide.appIcon };
      } else if (globalAppIconImg) {
        // Fall back to the global /120.png (gym route behaviour).
        iconOverlay = { image: globalAppIconImg, config: slide.appIcon };
      }
    }

    drawSlide(
      ctx, img, slide.text, slide.positions, CANVAS_WIDTH, CANVAS_HEIGHT,
      null, appendPerTen, slide.textStyle ?? DEFAULT_TEXT_STYLE, iconOverlay,
    );

    const blob       = await canvasToBlob(canvas);
    const paddedIdx  = String(i + 1).padStart(3, "0");
    const baseName   = slide.file.name.replace(/\.[^.]+$/, "");
    zip.file(`${paddedIdx}_${baseName}.png`, blob);
    onProgress?.(i + 1, total);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const orderNumber = getNextOrderNumber(projectPrefix);
  const url = URL.createObjectURL(zipBlob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = formatOrderedZipName(projectPrefix, orderNumber);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
