export type BrandKey = "gym";

export interface CarouselBrandConfig {
  /** Path relative to process.cwd() where the meta-prompt template lives */
  templatePath: string;
  /** Prefix used for ZIP filenames, e.g. "gymnerds" → gymnerds_0001.zip */
  zipPrefix: string;
  /** Hardcoded slide index (0-based) that always requires a manual upload. */
  manualSlideIndex: number | null;
  /**
   * Public path to an overlay asset composited on top of slides.
   * null = no global overlay for this brand.
   */
  manualOverlayAsset: string | null;
  /** Brand-readable display name */
  displayName: string;
}

export const CAROUSEL_BRANDS: Record<BrandKey, CarouselBrandConfig> = {
  gym: {
    templatePath: "public/exercise-carousel-prompt-generator-template.md",
    zipPrefix: "gymnerds",
    manualSlideIndex: 3,
    manualOverlayAsset: "/120.png",
    displayName: "Gym Carousels",
  },
};
