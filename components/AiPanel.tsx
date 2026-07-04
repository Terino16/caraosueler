"use client";

import { useRef, useState } from "react";

// ── Big red button (lives in the header) ─────────────────────────────────────

interface AiButtonProps {
  hasSlideTexts: boolean;
  generating: boolean;
  progress: string;
  onGenerate: () => void;
}

export function AiGenerateButton({
  hasSlideTexts,
  generating,
  progress,
  onGenerate,
}: AiButtonProps) {
  return (
    <button
      type="button"
      onClick={onGenerate}
      disabled={generating || !hasSlideTexts}
      title={!hasSlideTexts ? "Add text data (Step 2) first" : undefined}
      className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-lg shadow-red-900/40 flex items-center gap-2 select-none"
    >
      {generating ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
          <span className="truncate max-w-36">{progress || "Working…"}</span>
        </>
      ) : (
        <>
          <span className="text-base leading-none">✦</span>
          Generate with AI
        </>
      )}
    </button>
  );
}

// ── Reference image section (always visible on the page) ─────────────────────

interface AiReferenceSectionProps {
  referenceImage: File | null;
  onReferenceImageChange: (file: File | null) => void;
  error: string | null;
}

export function AiReferenceSection({
  referenceImage,
  onReferenceImageChange,
  error,
}: AiReferenceSectionProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    onReferenceImageChange(file);
  }

  function handleRemove() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    onReferenceImageChange(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-white/70 text-sm font-semibold">Style Reference Image</p>
        <span className="text-white/30 text-xs">(optional — sent to gpt-image-2 for visual style)</span>
      </div>

      {referenceImage && previewUrl ? (
        <div className="relative group rounded-xl overflow-hidden border border-white/10 max-w-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Reference"
            className="w-full h-40 object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-red-600 text-white text-sm font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
            title="Remove reference image"
          >
            ×
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
            <p className="text-white/70 text-xs truncate">{referenceImage.name}</p>
            <p className="text-emerald-400 text-[10px]">✓ Reference image set</p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={[
            "w-full max-w-xs rounded-xl border-2 border-dashed py-8 text-center transition-colors cursor-pointer",
            dragging
              ? "border-red-400 bg-red-950/30"
              : "border-white/15 bg-white/5 hover:border-red-500/40 hover:bg-red-950/10",
          ].join(" ")}
        >
          <p className="text-3xl mb-2">🖼️</p>
          <p className="text-white/60 text-sm font-medium">Drop or click to upload</p>
          <p className="text-white/30 text-xs mt-1">
            This photo&apos;s lighting &amp; style will be matched in AI images
          </p>
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {error && (
        <p className="text-red-400 text-xs bg-red-900/20 rounded-lg px-3 py-2 border border-red-500/20 max-w-xs">
          {error}
        </p>
      )}

      <div className="text-white/25 text-xs space-y-0.5">
        <p>• Slide 4 is skipped — upload that image manually after generation.</p>
        <p>• Images are generated one at a time (sequential).</p>
      </div>
    </div>
  );
}

// ── Default export (legacy — kept for backward-compat) ────────────────────────
export default function AiPanel(props: AiButtonProps & AiReferenceSectionProps) {
  return <AiGenerateButton {...props} />;
}
