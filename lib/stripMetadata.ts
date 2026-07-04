/**
 * Strips all metadata (EXIF, XMP, IPTC, GPS, ICC profiles, thumbnails, …)
 * from an image file by redrawing it through an HTML Canvas and exporting
 * fresh pixel data as a new PNG blob.  Canvas rendering only preserves raw
 * RGBA pixels — every byte of the original file's metadata is discarded.
 *
 * The returned File has the same base-name as the original but uses a .png
 * extension, since canvas.toBlob always produces PNG here.
 */
export async function stripMetadata(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);

  try {
    // Load the image
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el  = new Image();
      el.onload  = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not decode ${file.name}`));
      el.src     = objectUrl;
    });

    // Draw onto a canvas at the image's native resolution
    const canvas  = document.createElement("canvas");
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context available");
    ctx.drawImage(img, 0, 0);

    // Export as a brand-new PNG — no metadata slot exists in this format path
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error(`canvas.toBlob failed for ${file.name}`));
      }, "image/png");
    });

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.png`, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
