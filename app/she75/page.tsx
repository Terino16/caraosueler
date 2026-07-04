"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ImageDropzone from "@/components/ImageDropzone";
import TextInputPanel from "@/components/TextInputPanel";
import SlidePreview from "@/components/SlidePreview";
import Link from "next/link";
import { AiGenerateButton, AiReferenceSection } from "@/components/AiPanel";
import type { Slide, SlideText, TextKey, TextPositions } from "@/lib/types";
import { DEFAULT_POSITIONS, SHE75_DEFAULT_POSITIONS, SHE75_TEXT_STYLE } from "@/lib/types";
import { exportZip } from "@/lib/exportZip";
import { stripMetadata } from "@/lib/stripMetadata";

const SLIDE_4_INDEX = 3;

let idCounter = 0;
function uid() { return `she75-slide-${++idCounter}`; }

const fileMetaCache = new WeakMap<File, { id: string; objectUrl: string }>();

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
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function She75Page() {
  const [images,     setImages]     = useState<File[]>([]);
  const [aiImages,   setAiImages]   = useState<(File | null)[]>([]);
  const [slideTexts, setSlideTexts] = useState<SlideText[]>([]);

  const [aiGenerating,   setAiGenerating]   = useState(false);
  const [aiProgress,     setAiProgress]     = useState("");
  const [aiError,        setAiError]        = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);

  const [editedPrompts, setEditedPrompts] = useState<Record<number, string>>({});
  const [regenIdx,      setRegenIdx]      = useState<number | null>(null);

  const [positionsMap, setPositionsMap] = useState<Record<string, TextPositions>>({});

  // she75 has no rating field — appendPerTen is permanently false
  const [exporting,      setExporting]      = useState(false);
  const [exportProgress, setExportProgress] = useState<[number, number]>([0, 0]);
  const [exportError,    setExportError]    = useState<string | null>(null);

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

  const slidesRef = useRef(slides);
  useEffect(() => { slidesRef.current = slides; }, [slides]);
  useEffect(() => {
    return () => { slidesRef.current.forEach((s) => URL.revokeObjectURL(s.objectUrl)); };
  }, []);

  const handleImagesChange = useCallback((files: File[]) => setImages(files), []);
  // Strip rating on ingest — she75 doesn't use ratings.
  const handleTextsChange = useCallback(
    (texts: SlideText[]) =>
      setSlideTexts(texts.map(({ heading, subtext }) => ({ heading, subtext }))),
    [],
  );

  const handlePositionChange = useCallback(
    (slideId: string, key: TextKey, x: number, y: number) => {
      setPositionsMap((prev) => ({
        ...prev,
        [slideId]: { ...(prev[slideId] ?? SHE75_DEFAULT_POSITIONS), [key]: { x, y } },
      }));
    }, [],
  );

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

    const raw = await fileFromBase64(data.imageBase64, `she75-slide-${slideIndex + 1}.png`);
    return stripMetadata(raw);
  }

  async function handleAiGenerate() {
    if (slideTexts.length === 0) return;
    setAiGenerating(true);
    setAiError(null);
    setAiProgress("Generating wellness prompts…");

    try {
      // ── She75-specific prompt generation endpoint ──────────────────────────
      const promptRes = await fetch("/api/ai/she75/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides: slideTexts }),
      });
      const promptData = await promptRes.json() as { prompts?: (string | null)[]; error?: string };
      if (!promptRes.ok || !promptData.prompts) throw new Error(promptData.error ?? "Prompt generation failed");

      const prompts = promptData.prompts;

      const initialEdited: Record<number, string> = {};
      prompts.forEach((p, i) => { if (p) initialEdited[i] = p; });
      setEditedPrompts(initialEdited);

      let refBase64: string | null = null;
      let refMediaType: string | null = null;
      if (referenceImage) {
        refBase64    = await fileToBase64(referenceImage);
        refMediaType = referenceImage.type || "image/png";
      }

      const indicesToGenerate = prompts
        .map((p, i) => (p ? i : null))
        .filter((i): i is number => i !== null);

      setAiProgress(`Generating ${indicesToGenerate.length} images in parallel…`);
      setAiImages(Array.from({ length: prompts.length }, () => null));

      await Promise.all(
        indicesToGenerate.map(async (i) => {
          const prompt = prompts[i]!;
          try {
            const file = await generateOneImage(prompt, i, refBase64, refMediaType);
            setAiImages((prev) => {
              const next = [...prev];
              while (next.length <= i) next.push(null);
              next[i] = file;
              return next;
            });
          } catch (err) {
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

  // Generalized slot uploader — works for slide 4, extra slides added after AI
  // generation, or any index that doesn't yet have an image.
  async function handleSlotUpload(slotIndex: number, file: File) {
    const stripped = await stripMetadata(file);
    setAiImages((prev) => {
      const next = [...prev];
      while (next.length <= slotIndex) next.push(null);
      next[slotIndex] = stripped;
      return next;
    });
  }

  async function handleExport() {
    if (slides.length === 0) return;
    setExporting(true);
    setExportError(null);
    setExportProgress([0, slides.length]);
    try {
      const slidesForExport = slides.map((s) => ({
        ...s,
        positions: positionsMap[s.id] ?? SHE75_DEFAULT_POSITIONS,
        textStyle: SHE75_TEXT_STYLE,
      }));
      await exportZip(slidesForExport, false, (done, total) => {
        setExportProgress([done, total]);
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const [exportDone, exportTotal] = exportProgress;

  // Every text entry that has no image yet (manual or AI) gets its own upload card.
  // This covers: slide 4 (always skipped by AI), Pro tip slides, and any extra
  // entries the user adds to the JSON after AI generation has already run.
  const emptySlots = aiImages.length > 0
    ? slideTexts
        .map((_, i) => i)
        .filter((i) => !images[i] && !aiImages[i])
    : [];

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/10 px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">She75</h1>
            <Link
              href="/"
              className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-400/50 rounded-lg px-2.5 py-1 transition-colors"
            >
              ← Carousel Builder
            </Link>
            <Link
              href="/transform"
              className="text-xs text-violet-400 hover:text-violet-300 border border-violet-500/30 hover:border-violet-400/50 rounded-lg px-2.5 py-1 transition-colors"
            >
              ✦ Body Transform
            </Link>
          </div>
          <p className="text-white/40 text-sm">
            Wellness lifestyle carousel — AI generates quiet-luxury aesthetic images
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <AiGenerateButton
            hasSlideTexts={slideTexts.length > 0}
            generating={aiGenerating}
            progress={aiProgress}
            onGenerate={handleAiGenerate}
          />

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
            <p className="text-white/30 text-xs">Rating field is not used in She75 — it will be ignored if included in your JSON.</p>
          </section>

          <section className="space-y-4">
            <SectionLabel n={3} label="AI Style Reference" hint="(for Generate with AI)" />
            <AiReferenceSection
              referenceImage={referenceImage}
              onReferenceImageChange={setReferenceImage}
              error={aiError}
            />
          </section>
        </div>

        {exportError && (
          <p className="text-red-400 text-sm bg-red-900/20 rounded-lg px-4 py-3 border border-red-500/20">
            {exportError}
          </p>
        )}

        {emptySlots.length > 0 && (
          <div className="space-y-3">
            {emptySlots.map((slotIdx) => (
              <SlotUploader
                key={slotIdx}
                slotIndex={slotIdx}
                heading={slideTexts[slotIdx]?.heading}
                onUpload={(file) => handleSlotUpload(slotIdx, file)}
              />
            ))}
          </div>
        )}

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
                const textIdx = slideTexts.indexOf(slide.text as SlideText);
                const originalIdx = textIdx >= 0 ? textIdx : i;

                return (
                  <SlidePreview
                    key={slide.id}
                    slide={slide}
                    index={originalIdx}
                    positions={positionsMap[slide.id] ?? SHE75_DEFAULT_POSITIONS}
                    textStyle={SHE75_TEXT_STYLE}
                    onPositionChange={(key, x, y) => handlePositionChange(slide.id, key, x, y)}
                    appendPerTen={false}
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

        {slides.length === 0 && (
          <div className="text-center py-24 text-white/20">
            <p className="text-6xl mb-4">🌿</p>
            <p className="text-lg font-medium">Upload images or use AI Generate to get started</p>
            <p className="text-sm mt-1">
              Add text data (Step 2) then hit the red AI button — she75 generates wellness lifestyle imagery
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function SectionLabel({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{n}</span>
      <h2 className="font-semibold text-white/90">{label}</h2>
      {hint && <span className="text-white/30 text-xs">{hint}</span>}
    </div>
  );
}

function SlotUploader({
  slotIndex,
  heading,
  onUpload,
}: {
  slotIndex: number;
  heading?: string;
  onUpload: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const slideNum = slotIndex + 1;
  const label = heading?.trim()
    ? `Slide ${slideNum} — "${heading.trim()}"`
    : `Slide ${slideNum}`;

  function handleFiles(files: FileList | null) {
    const f = Array.from(files ?? []).find((f) => f.type.startsWith("image/"));
    if (f) onUpload(f);
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-400 text-lg">⚠</span>
        <p className="text-amber-300 font-semibold text-sm">{label} — Upload Image</p>
      </div>
      <p className="text-white/50 text-xs">
        {slotIndex === SLIDE_4_INDEX
          ? "AI skips slide 4 by design. Upload the image you want for this slide."
          : "This slide has no image yet. Upload one manually or add it to your JSON and re-run AI."}
      </p>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        className={["w-full rounded-xl border-2 border-dashed py-6 text-center text-sm transition-colors", dragging ? "border-amber-400 bg-amber-900/20" : "border-amber-500/30 bg-white/5 hover:border-amber-400/60"].join(" ")}
      >
        <p className="text-white/60">Drop or click to upload image for {label}</p>
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
