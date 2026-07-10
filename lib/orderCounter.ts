// Tracks a per-project, persistent order number so exported zip files can be
// named like "she75_0001.zip", "she75_0002.zip", etc. The counter lives in
// localStorage, keyed by project prefix, and increments every time a zip is
// downloaded for that project.

const STORAGE_PREFIX = "caraouseler:orderCounter:";

export function getNextOrderNumber(projectPrefix: string): number {
  const key = `${STORAGE_PREFIX}${projectPrefix}`;

  if (typeof window === "undefined" || !window.localStorage) {
    return 1;
  }

  const stored = window.localStorage.getItem(key);
  const current = stored ? parseInt(stored, 10) : 0;
  const next = (Number.isFinite(current) ? current : 0) + 1;

  window.localStorage.setItem(key, String(next));
  return next;
}

export function formatOrderedZipName(projectPrefix: string, orderNumber: number): string {
  const padded = String(orderNumber).padStart(4, "0");
  return `${projectPrefix}_${padded}.zip`;
}
