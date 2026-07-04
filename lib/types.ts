export type TextKey = "heading" | "rating" | "subtext";

export interface TextPosition {
  /** 0 = left edge, 1 = right edge, 0.5 = centre */
  x: number;
  /** 0 = top edge, 1 = bottom edge, 0.5 = centre */
  y: number;
}

export type TextPositions = Record<TextKey, TextPosition>;

/** Sensible default — all three elements stacked through the vertical centre */
export const DEFAULT_POSITIONS: TextPositions = {
  heading: { x: 0.5, y: 0.4 },
  rating:  { x: 0.5, y: 0.5 },
  subtext: { x: 0.5, y: 0.62 },
};

export interface SlideText {
  heading?: string;
  rating?: string | number;
  subtext?: string;
}

export interface Slide {
  id: string;
  file: File;
  objectUrl: string;
  text?: SlideText;
}

// ── Text style ────────────────────────────────────────────────────────────────

export interface TextStyle {
  /** Fill colour of the text (CSS colour string) */
  color: string;
  /** Canvas textAlign — "center" or "left" */
  align: CanvasTextAlign;
  /**
   * Letter-spacing as a CSS length string (e.g. "0px", "-1px").
   * Applied via ctx.letterSpacing (supported in all modern browsers).
   */
  letterSpacing: string;
}

/** Default style used by the main carousel builder (white, centred, normal tracking) */
export const DEFAULT_TEXT_STYLE: TextStyle = {
  color: "#ffffff",
  align: "center",
  letterSpacing: "0px",
};

/** She75 style — pink, left-aligned, tight tracking */
export const SHE75_TEXT_STYLE: TextStyle = {
  color: "#F9A8D4", // tailwind pink-300
  align: "left",
  letterSpacing: "-1px",
};

/** Default drag positions for she75 — anchored at the left edge (x = 0.06) */
export const SHE75_DEFAULT_POSITIONS: TextPositions = {
  heading: { x: 0.06, y: 0.4  },
  rating:  { x: 0.06, y: 0.5  }, // unused in she75 but required for type compat
  subtext: { x: 0.06, y: 0.62 },
};
