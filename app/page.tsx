"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ImageDropzone from "@/components/ImageDropzone";
import TextInputPanel from "@/components/TextInputPanel";
import SlidePreview from "@/components/SlidePreview";
import Link from "next/link";
import { AiGenerateButton, AiReferenceSection } from "@/components/AiPanel";
import type { Slide, SlideText, TextKey, TextPositions } from "@/lib/types";
import { DEFAULT_POSITIONS, DEFAULT_APP_ICON } from "@/lib/types";
import { exportZip } from "@/lib/exportZip";
import { stripMetadata } from "@/lib/stripMetadata";

const SLIDE_4_INDEX = 3; // 0-based

let idCounter = 0;
function uid() { return `slide-${++idCounter}`; }

// Module-level stable cache: File → { id, objectUrl }.
// WeakMap at module scope avoids useRef and is safe to read in useMemo.
const fileMetaCache = new WeakMap<File, { id: string; objectUrl: string }>();

// ── helpers ───────────────────────────────────────────────────────────────────

async function fileFromBase64(b64: string, name: string): Promise<File> {
  const bin  = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/png" });
  return new File([blob], name, { type: "image/png" });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip "data:...;base64,"
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── component ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  // Manual uploads (from ImageDropzone)
  const [images,     setImages]     = useState<File[]>([]);
  // AI-generated images — one entry per slide index, null = not yet generated / skipped
  const [aiImages,   setAiImages]   = useState<(File | null)[]>([]);
  const [slideTexts, setSlideTexts] = useState<SlideText[]>([]);

  // AI state
  const [aiGenerating,   setAiGenerating]   = useState(false);
  const [aiProgress,     setAiProgress]     = useState("");
  const [aiError,        setAiError]        = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);

  // Per-slide editable prompts & per-slide regen state
  const [editedPrompts, setEditedPrompts] = useState<Record<number, string>>({});
  const [regenIdx,      setRegenIdx]      = useState<number | null>(null);

  // Per-slide text positions
  const [positionsMap, setPositionsMap] = useState<Record<string, TextPositions>>({});

  // App icon overlay on slide 4
  const [appIcon, setAppIcon] = useState(DEFAULT_APP_ICON);

  const [appendPerTen,   setAppendPerTen]   = useState(true);
  const [exporting,      setExporting]      = useState(false);
  const [exportProgress, setExportProgress] = useState<[number, number]>([0, 0]);
  const [exportError,    setExportError]    = useState<string | null>(null);

  // ── derive slides ─────────────────────────────────────────────────────────
  const slides = useMemo(() => {
    const maxLen = Math.max(images.length, aiImages.length, slideTexts.length);
    const result: Slide[] = [];
    for (let i = 0; i < maxLen; i++) {
      const file = images[i] ?? aiImages[i] ?? null;
      if (!file) continue;
      let meta = fileMetaCache.get(file);
      if (!meta) {
        meta = { id: uid(), objectUrl: URL.createObjectURL(file) };
        fileMetaCache.set(file, meta);
      }
      result.push({ ...meta, file, text: slideTexts[i] });
    }
    return result;
  }, [images, aiImages, slideTexts]);

  // Revoke all object URLs on unmount
  const slidesRef = useRef(slides);
  useEffect(() => { slidesRef.current = slides; }, [slides]);
  useEffect(() => {
    return () => { slidesRef.current.forEach((s) => URL.revokeObjectURL(s.objectUrl)); };
  }, []);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleImagesChange = useCallback((files: File[]) => setImages(files), []);
  const handleTextsChange  = useCallback((texts: SlideText[]) => setSlideTexts(texts), []);

  const handlePositionChange = useCallback(
    (slideId: string, key: TextKey, x: number, y: number) => {
      setPositionsMap((prev) => ({
        ...prev,
        [slideId]: { ...(prev[slideId] ?? DEFAULT_POSITIONS), [key]: { x, y } },
      }));
    }, [],
  );

  const handleAppIconPositionChange = useCallback((x: number, y: number) => {
    setAppIcon((prev) => ({ ...prev, x, y }));
  }, []);

  const handleAppIconBorderRadiusChange = useCallback((borderRadius: number) => {
    setAppIcon((prev) => ({ ...prev, borderRadius }));
  }, []);

  // ── AI generation ─────────────────────────────────────────────────────────
  async function generateOneImage(
    prompt: string,
    slideIndex: number,
    refBase64: string | null,
    refMediaType: string | null,
  ): Promise<File | null> {
    const body: Record<string, string> = { prompt };
    if (refBase64)    body.referenceImageBase64 = refBase64;
    if (refMediaType) body.referenceMediaType   = refMediaType;

    const res = await fetch("/api/ai/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { imageBase64?: string; error?: string };
    if (!res.ok || !data.imageBase64) throw new Error(data.error ?? "Image generation failed");

    const raw  = await fileFromBase64(data.imageBase64, `slide-${slideIndex + 1}.png`);
    return stripMetadata(raw);
  }

  async function handleAiGenerate() {
    if (slideTexts.length === 0) return;
    setAiGenerating(true);
    setAiError(null);
    setAiProgress("Generating prompts…");

    try {
      // Get reference image base64 up front so it can lock style for both the
      // prompt-writing step and the image-generation step.
      let refBase64: string | null = null;
      let refMediaType: string | null = null;
      if (referenceImage) {
        refBase64    = await fileToBase64(referenceImage);
        refMediaType = referenceImage.type || "image/png";
      }

      // Step 1: generate prompts
      const promptRes = await fetch("/api/ai/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides: slideTexts,
          referenceImageBase64: refBase64,
          referenceMediaType: refMediaType,
          brand: "gym",
        }),
      });
      const promptData = await promptRes.json() as { prompts?: (string | null)[]; error?: string };
      if (!promptRes.ok || !promptData.prompts) throw new Error(promptData.error ?? "Prompt generation failed");

      const prompts = promptData.prompts;

      // Seed edited prompts
      const initialEdited: Record<number, string> = {};
      prompts.forEach((p, i) => { if (p) initialEdited[i] = p; });
      setEditedPrompts(initialEdited);

      // Step 2: generate all images in parallel — each updates state as it lands
      const indicesToGenerate = prompts
        .map((p, i) => (p ? i : null))
        .filter((i): i is number => i !== null);

      setAiProgress(`Generating ${indicesToGenerate.length} images in parallel…`);

      // Initialise the array to the right length so slot indices are stable
      setAiImages(Array.from({ length: prompts.length }, () => null));

      await Promise.all(
        indicesToGenerate.map(async (i) => {
          const prompt = prompts[i]!;
          try {
            const file = await generateOneImage(prompt, i, refBase64, refMediaType);
            // Write only this slot — preserves any concurrent updates
            setAiImages((prev) => {
              const next = [...prev];
              while (next.length <= i) next.push(null);
              next[i] = file;
              return next;
            });
          } catch (err) {
            // Surface per-image errors without killing other parallel jobs
            console.error(`Slide ${i + 1} generation failed:`, err);
            setAiError(`Slide ${i + 1} failed: ${err instanceof Error ? err.message : "Unknown error"}`);
          }
        }),
      );

      setAiProgress("");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI generation failed");
      setAiProgress("");
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleRegenerate(slideIdx: number) {
    const prompt = editedPrompts[slideIdx];
    if (!prompt) return;
    setRegenIdx(slideIdx);
    setAiError(null);
    try {
      let refBase64: string | null = null;
      let refMediaType: string | null = null;
      if (referenceImage) {
        refBase64    = await fileToBase64(referenceImage);
        refMediaType = referenceImage.type || "image/png";
      }
      const file = await generateOneImage(prompt, slideIdx, refBase64, refMediaType);
      setAiImages((prev) => {
        const next = [...prev];
        while (next.length <= slideIdx) next.push(null);
        next[slideIdx] = file;
        return next;
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegenIdx(null);
    }
  }

  // ── slide-4 manual upload ─────────────────────────────────────────────────
  // Write to aiImages at index 3 so the index is preserved correctly.
  // (Writing to images[] would require padding with nulls that break the merge.)
  async function handleSlot4Upload(file: File) {
    const stripped = await stripMetadata(file);
    setAiImages((prev) => {
      const next = [...prev];
      while (next.length <= SLIDE_4_INDEX) next.push(null);
      next[SLIDE_4_INDEX] = stripped;
      return next;
    });
  }

  // ── export ────────────────────────────────────────────────────────────────
  async function handleExport() {
    if (slides.length === 0) return;
    setExporting(true);
    setExportError(null);
    setExportProgress([0, slides.length]);
    try {
      const slidesForExport = slides.map((s, i) => {
        const textIdx = slideTexts.indexOf(s.text as SlideText);
        const originalIdx = textIdx >= 0 ? textIdx : i;
        return {
          ...s,
          positions: positionsMap[s.id] ?? DEFAULT_POSITIONS,
          appIcon: originalIdx === SLIDE_4_INDEX ? appIcon : undefined,
        };
      });
      await exportZip(slidesForExport, appendPerTen, (done, total) => {
        setExportProgress([done, total]);
      }, "gymnerds");
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const [exportDone, exportTotal] = exportProgress;

  // ── does slot 4 need an image? ────────────────────────────────────────────
  const slide4Needed =
    aiImages.length > 0 &&        // AI has been run
    slideTexts.length > SLIDE_4_INDEX && // there IS a slide 4
    !images[SLIDE_4_INDEX] &&     // user hasn't manually uploaded
    !aiImages[SLIDE_4_INDEX];     // AI didn't generate (expected)

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/10 px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight">Caraouseler</h1>
            <span className="text-xs text-indigo-300 border border-indigo-500/40 bg-indigo-950/30 rounded-lg px-2.5 py-1">
              💪 Gym Carousels
            </span>
            <Link
              href="/she75"
              className="text-xs text-rose-400 hover:text-rose-300 border border-rose-500/30 hover:border-rose-400/50 rounded-lg px-2.5 py-1 transition-colors"
            >
              🌿 She75
            </Link>
            <Link
              href="/transform"
              className="text-xs text-violet-400 hover:text-violet-300 border border-violet-500/30 hover:border-violet-400/50 rounded-lg px-2.5 py-1 transition-colors"
            >
              ✦ Body Transform
            </Link>
          </div>
          <p className="text-white/40 text-sm">
            Compose carousel slides with text overlays &amp; download as ZIP
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Big red AI button */}
          <AiGenerateButton
            hasSlideTexts={slideTexts.length > 0}
            generating={aiGenerating}
            progress={aiProgress}
            onGenerate={handleAiGenerate}
          />

          {/* Download ZIP */}
          {slides.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors shadow-lg flex items-center gap-2"
            >
              {exporting ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {exportTotal > 0 ? `${exportDone}/${exportTotal}` : "Preparing…"}
                </>
              ) : (
                "⬇ Download ZIP"
              )}
            </button>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {/* Steps 1, 2 & AI reference ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="space-y-4">
            <SectionLabel n={1} label="Upload Images" hint="(manual — or use AI Generate)" />
            <ImageDropzone files={images} onChange={handleImagesChange} />
          </section>

          <section className="space-y-4">
            <SectionLabel n={2} label="Add Text Data" hint="(optional)" />
            <TextInputPanel
              slideTexts={slideTexts}
              imageCount={images.length}
              onChange={handleTextsChange}
            />
            {/* Rating /10 toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer w-fit select-none group">
              <span className={["relative inline-flex w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0", appendPerTen ? "bg-indigo-600" : "bg-white/15"].join(" ")}>
                <input type="checkbox" checked={appendPerTen} onChange={(e) => setAppendPerTen(e.target.checked)} className="sr-only" />
                <span className={["absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200", appendPerTen ? "translate-x-4" : "translate-x-0"].join(" ")} />
              </span>
              <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                Append <code className="text-white/50">/10</code> to rating
              </span>
            </label>
          </section>

          {/* Step 3 — AI Reference Image */}
          <section className="space-y-4">
            <SectionLabel n={3} label="AI Style Reference" hint="(for Generate with AI)" />
            <AiReferenceSection
              referenceImage={referenceImage}
              onReferenceImageChange={setReferenceImage}
              error={aiError}
            />
          </section>
        </div>

        {/* Export error */}
        {exportError && (
          <p className="text-red-400 text-sm bg-red-900/20 rounded-lg px-4 py-3 border border-red-500/20">
            {exportError}
          </p>
        )}

        {/* Slide 4 upload prompt ───────────────────────────────────────────── */}
        {slide4Needed && (
          <Slide4Uploader onUpload={handleSlot4Upload} />
        )}

        {/* Preview grid ───────────────────────────────────────────────────── */}
        {slides.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SectionLabel n={4} label="Preview" />
                <span className="text-white/30 text-sm">
                  {slides.length} slide{slides.length !== 1 ? "s" : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="hidden lg:flex px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors shadow items-center gap-2"
              >
                {exporting ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {exportTotal > 0 ? `${exportDone}/${exportTotal}` : "…"}
                  </>
                ) : "⬇ Download ZIP"}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {slides.map((slide, i) => {
                // Find the original text index for this slide
                const textIdx = slideTexts.indexOf(slide.text as SlideText);
                const originalIdx = textIdx >= 0 ? textIdx : i;

                return (
                  <SlidePreview
                    key={slide.id}
                    slide={slide}
                    index={originalIdx}
                    positions={positionsMap[slide.id] ?? DEFAULT_POSITIONS}
                    onPositionChange={(key, x, y) => handlePositionChange(slide.id, key, x, y)}
                    appendPerTen={appendPerTen}
                    showAppIcon={originalIdx === SLIDE_4_INDEX}
                    appIcon={appIcon}
                    onAppIconPositionChange={handleAppIconPositionChange}
                    onAppIconBorderRadiusChange={handleAppIconBorderRadiusChange}
                    prompt={editedPrompts[originalIdx]}
                    onPromptChange={(p) => setEditedPrompts((prev) => ({ ...prev, [originalIdx]: p }))}
                    onRegenerate={() => handleRegenerate(originalIdx)}
                    regenerating={regenIdx === originalIdx}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Empty state ─────────────────────────────────────────────────────── */}
        {slides.length === 0 && (
          <div className="text-center py-24 text-white/20">
            <p className="text-6xl mb-4">🎠</p>
            <p className="text-lg font-medium">Upload images or use AI Generate to get started</p>
            <p className="text-sm mt-1">
              Add text data (Step 2) then hit the red AI button to generate images
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{n}</span>
      <h2 className="font-semibold text-white/90">{label}</h2>
      {hint && <span className="text-white/30 text-xs">{hint}</span>}
    </div>
  );
}

function Slide4Uploader({ onUpload }: { onUpload: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const f = Array.from(files ?? []).find((f) => f.type.startsWith("image/"));
    if (f) onUpload(f);
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-400 text-lg">⚠</span>
        <p className="text-amber-300 font-semibold text-sm">Slide 4 — Upload Your Own Image</p>
      </div>
      <p className="text-white/50 text-xs">
        AI skips slide 4 by design. Upload the image you want for that slide below.
      </p>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        className={["w-full rounded-xl border-2 border-dashed py-6 text-center text-sm transition-colors", dragging ? "border-amber-400 bg-amber-900/20" : "border-amber-500/30 bg-white/5 hover:border-amber-400/60"].join(" ")}
      >
        <p className="text-white/60">Drop or click to upload Slide 4 image</p>
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
