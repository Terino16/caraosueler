"use client";

import { useRef, useState } from "react";
import Link from "next/link";

interface PhotoSlot {
  file: File | null;
  previewUrl: string | null;
  base64: string | null;
  mediaType: string | null;
}

function emptySlot(): PhotoSlot {
  return { file: null, previewUrl: null, base64: null, mediaType: null };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PhotoUpload({
  label,
  hint,
  emoji,
  slot,
  onChange,
}: {
  label: string;
  hint: string;
  emoji: string;
  slot: PhotoSlot;
  onChange: (slot: PhotoSlot) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const previewUrl = URL.createObjectURL(file);
    const base64 = await fileToBase64(file);
    if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    onChange({ file, previewUrl, base64, mediaType: file.type });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void handleFile(f);
  }

  return (
    <div className="space-y-3 flex-1">
      <div>
        <p className="text-white/90 font-semibold text-sm">{label}</p>
        <p className="text-white/40 text-xs mt-0.5">{hint}</p>
      </div>

      {slot.previewUrl ? (
        <div className="relative group rounded-2xl overflow-hidden border border-white/10 aspect-[3/4] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slot.previewUrl} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => { if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl); onChange(emptySlot()); }}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 hover:bg-red-600 text-white font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-sm"
          >
            ×
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
            <p className="text-white/70 text-xs truncate">{slot.file?.name}</p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={[
            "w-full aspect-[3/4] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 text-center transition-colors cursor-pointer",
            dragging
              ? "border-violet-400 bg-violet-950/30"
              : "border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10",
          ].join(" ")}
        >
          <span className="text-5xl">{emoji}</span>
          <div>
            <p className="text-white/60 text-sm font-medium">Drop or click to upload</p>
            <p className="text-white/25 text-xs mt-1">JPG, PNG, WEBP</p>
          </div>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

export default function TransformPage() {
  const [currentPhoto,     setCurrentPhoto]     = useState<PhotoSlot>(emptySlot());
  const [inspirationPhoto, setInspirationPhoto] = useState<PhotoSlot>(emptySlot());
  const [generating,       setGenerating]       = useState(false);
  const [progress,         setProgress]         = useState("");
  const [error,            setError]            = useState<string | null>(null);
  const [resultB64,        setResultB64]        = useState<string | null>(null);
  const [physiqueDesc,     setPhysiqueDesc]     = useState<string | null>(null);
  const [descOpen,         setDescOpen]         = useState(false);

  const canGenerate = !!currentPhoto.base64 && !!inspirationPhoto.base64 && !generating;

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    setResultB64(null);
    setPhysiqueDesc(null);

    try {
      setProgress("Analysing inspiration physique…");
      const res = await fetch("/api/ai/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPhotoBase64:      currentPhoto.base64,
          currentMediaType:        currentPhoto.mediaType,
          inspirationPhotoBase64:  inspirationPhoto.base64,
          inspirationMediaType:    inspirationPhoto.mediaType,
        }),
      });

      setProgress("Generating transformation…");
      const data = await res.json() as { imageBase64?: string; deltaDescription?: string; physiqueDescription?: string; error?: string };

      if (!res.ok || !data.imageBase64) throw new Error(data.error ?? "Transformation failed");

      setResultB64(data.imageBase64);
      setPhysiqueDesc(data.deltaDescription ?? data.physiqueDescription ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(false);
      setProgress("");
    }
  }

  function handleDownload() {
    if (!resultB64) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${resultB64}`;
    a.download = "transformation.png";
    a.click();
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-white/40 hover:text-white/70 text-sm transition-colors">
              ← Carousel Builder
            </Link>
            <span className="text-white/20">|</span>
            <h1 className="text-xl font-bold tracking-tight">Body Transform</h1>
          </div>
          <p className="text-white/40 text-sm mt-0.5">
            Upload your photo + an inspiration physique → AI generates the transformation
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-lg shadow-violet-900/40 flex items-center gap-2"
        >
          {generating ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="max-w-40 truncate">{progress}</span>
            </>
          ) : (
            <>✦ Generate Transformation</>
          )}
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Two upload zones */}
        <div className="flex gap-6 items-start">
          <PhotoUpload
            label="Your Current Photo"
            hint="Upload a clear full-body or upper-body photo of yourself"
            emoji="📸"
            slot={currentPhoto}
            onChange={setCurrentPhoto}
          />

          {/* Arrow divider */}
          <div className="flex flex-col items-center justify-center pt-14 flex-shrink-0 gap-1 text-white/20">
            <span className="text-3xl">→</span>
            <span className="text-xs uppercase tracking-widest">becomes</span>
          </div>

          <PhotoUpload
            label="Inspiration Physique Photo"
            hint="The body / physique you want to transform into"
            emoji="💪"
            slot={inspirationPhoto}
            onChange={setInspirationPhoto}
          />

          {/* Result */}
          {(resultB64 || generating) && (
            <>
              <div className="flex flex-col items-center justify-center pt-14 flex-shrink-0 gap-1 text-white/20">
                <span className="text-3xl">→</span>
                <span className="text-xs uppercase tracking-widest">result</span>
              </div>

              <div className="space-y-3 flex-1">
                <div>
                  <p className="text-white/90 font-semibold text-sm">Generated Result</p>
                  <p className="text-white/40 text-xs mt-0.5">Your identity, their physique</p>
                </div>

                <div className="relative rounded-2xl overflow-hidden border border-white/10 aspect-[3/4] bg-black/50">
                  {generating && !resultB64 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <span className="w-10 h-10 border-2 border-white/20 border-t-violet-400 rounded-full animate-spin" />
                      <p className="text-white/50 text-sm">{progress}</p>
                    </div>
                  )}
                  {resultB64 && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`data:image/png;base64,${resultB64}`}
                      alt="Transformation result"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                {resultB64 && (
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-medium text-sm transition-colors"
                  >
                    ⬇ Download PNG
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm bg-red-900/20 rounded-xl px-4 py-3 border border-red-500/20">
            {error}
          </p>
        )}

        {/* Physique analysis (collapsible) */}
        {physiqueDesc && (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <button
              type="button"
              onClick={() => setDescOpen((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
            >
              <div>
                <p className="font-semibold text-white/80 text-sm">Transformation Delta Analysis</p>
                <p className="text-white/30 text-xs mt-0.5">Exact changes the AI identified between your photo and the inspiration</p>
              </div>
              <span className={["text-white/30 transition-transform duration-200", descOpen ? "rotate-180" : ""].join(" ")}>
                ▼
              </span>
            </button>
            {descOpen && (
              <div className="px-5 pb-5">
                <p className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap font-mono text-xs">
                  {physiqueDesc}
                </p>
              </div>
            )}
          </div>
        )}

        {/* How it works */}
        {!resultB64 && !generating && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
            <p className="font-semibold text-white/70 text-sm">How it works</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { n: "1", title: "Upload your photo", body: "A clear full-body or upper-body shot. Your face and identity will be preserved exactly." },
                { n: "2", title: "Upload inspiration", body: "A photo of the physique you want. The AI analyses muscle groups, body composition, and proportions." },
                { n: "3", title: "AI transforms", body: "gpt-image-2 generates a realistic image of you with the target physique — same face, new body." },
              ].map(({ n, title, body }) => (
                <div key={n} className="flex gap-3">
                  <span className="w-7 h-7 rounded-full bg-violet-600/30 border border-violet-500/30 text-violet-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                  <div>
                    <p className="text-white/80 text-sm font-medium">{title}</p>
                    <p className="text-white/40 text-xs mt-0.5 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-white/25 text-xs border-t border-white/10 pt-3">
              Note: Results depend on image quality and body visibility. Clear, well-lit photos produce the best transformations.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
