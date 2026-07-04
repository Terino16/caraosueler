import JSZip from "jszip";
import type { Slide, TextPositions, TextStyle } from "./types";
import { DEFAULT_TEXT_STYLE } from "./types";
import { drawSlide, CANVAS_WIDTH, CANVAS_HEIGHT } from "./renderSlide";

export interface SlideExport extends Slide {
  positions: TextPositions;
  textStyle?: TextStyle;
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
): Promise<void> {
  const zip = new JSZip();
  const total = slides.length;

  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2D context");

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const img   = await loadImage(slide.objectUrl);

    drawSlide(ctx, img, slide.text, slide.positions, CANVAS_WIDTH, CANVAS_HEIGHT, null, appendPerTen, slide.textStyle ?? DEFAULT_TEXT_STYLE);

    const blob       = await canvasToBlob(canvas);
    const paddedIdx  = String(i + 1).padStart(3, "0");
    const baseName   = slide.file.name.replace(/\.[^.]+$/, "");
    zip.file(`${paddedIdx}_${baseName}.png`, blob);
    onProgress?.(i + 1, total);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = "carousel.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
