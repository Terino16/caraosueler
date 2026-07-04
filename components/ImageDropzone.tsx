"use client";

import { useCallback, useRef, useState } from "react";
import { stripMetadata } from "@/lib/stripMetadata";

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
}

export default function ImageDropzone({ files, onChange }: Props) {
  const inputRef      = useRef<HTMLInputElement>(null);
  const [dropping,    setDropping]    = useState(false); // OS file drop active
  const [processing,  setProcessing]  = useState(false); // metadata stripping
  const [dragSrcIdx,  setDragSrcIdx]  = useState<number | null>(null);
  const dragSrcRef    = useRef<number | null>(null); // sync ref for drop handler
  const [overIdx,     setOverIdx]     = useState<number | null>(null);

  // ── add & strip ───────────────────────────────────────────────────────────
  const addFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const arr = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
      if (arr.length === 0) return;
      setProcessing(true);
      try {
        const stripped = await Promise.all(arr.map(stripMetadata));
        onChange([...files, ...stripped]);
      } finally {
        setProcessing(false);
      }
    },
    [files, onChange],
  );

  const onZoneDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropping(false);
      if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const removeFile = (index: number) => onChange(files.filter((_, i) => i !== index));

  // ── thumbnail drag-to-reorder ─────────────────────────────────────────────
  function onThumbDragStart(e: React.DragEvent, idx: number) {
    dragSrcRef.current = idx;
    setDragSrcIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }

  function onThumbDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragSrcRef.current !== null && dragSrcRef.current !== idx) setOverIdx(idx);
  }

  function onThumbDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.stopPropagation();
    const src = dragSrcRef.current;
    if (src === null || src === idx) { dragSrcRef.current = null; setDragSrcIdx(null); setOverIdx(null); return; }
    const next = [...files];
    const [moved] = next.splice(src, 1);
    next.splice(idx, 0, moved);
    onChange(next);
    dragSrcRef.current = null;
    setDragSrcIdx(null);
    setOverIdx(null);
  }

  function onThumbDragEnd() { dragSrcRef.current = null; setDragSrcIdx(null); setOverIdx(null); }

  return (
    <div className="space-y-4">
      {/* ── Drop zone ─────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
        onDragLeave={() => setDropping(false)}
        onDrop={onZoneDrop}
        disabled={processing}
        className={[
          "w-full rounded-2xl border-2 border-dashed py-12 text-center transition-colors select-none",
          processing
            ? "border-white/10 bg-white/5 cursor-wait opacity-70"
            : dropping
              ? "border-indigo-400 bg-indigo-950/30 cursor-copy"
              : "border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10 cursor-pointer",
        ].join(" ")}
      >
        {processing ? (
          <>
            <span className="inline-block w-7 h-7 border-2 border-white/20 border-t-white/70 rounded-full animate-spin mb-3" />
            <p className="text-white/60 font-medium text-sm">Stripping metadata…</p>
          </>
        ) : (
          <>
            <p className="text-4xl mb-3">🖼️</p>
            <p className="text-white/80 font-medium">Drag &amp; drop images here</p>
            <p className="text-white/40 text-sm mt-1">
              or click to browse — multiple images supported
            </p>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* ── Thumbnail strip ───────────────────────────────────────────────── */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-white/50 text-sm">
              {files.length} image{files.length !== 1 ? "s" : ""} — drag thumbnails to reorder
            </p>
            <span
              title="Metadata has been stripped from all uploaded images"
              className="text-[10px] text-emerald-400/70 border border-emerald-500/20 rounded px-1.5 py-0.5 font-medium select-none"
            >
              metadata-free
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            {files.map((file, i) => {
              const url        = URL.createObjectURL(file);
                  const isOver     = overIdx === i;
                  const isSrcDrag  = dragSrcIdx === i;

              return (
                <div
                  key={`${file.name}-${i}`}
                  draggable
                  onDragStart={(e) => onThumbDragStart(e, i)}
                  onDragOver={(e)  => onThumbDragOver(e, i)}
                  onDrop={(e)      => onThumbDrop(e, i)}
                  onDragEnd={onThumbDragEnd}
                  className={[
                    "relative group rounded-lg transition-all duration-150 cursor-grab active:cursor-grabbing",
                    isSrcDrag ? "opacity-40 scale-95" : "",
                    isOver    ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-950" : "",
                  ].join(" ")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={file.name}
                    draggable={false}
                    className="h-24 w-auto rounded-lg object-cover border border-white/10 pointer-events-none select-none"
                    onLoad={() => URL.revokeObjectURL(url)}
                  />

                  {/* Index badge */}
                  <span className="absolute top-1 left-1 bg-black/60 text-white/80 text-xs font-bold rounded px-1 py-0.5 leading-none select-none">
                    {i + 1}
                  </span>

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
