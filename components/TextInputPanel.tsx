"use client";

import { useEffect, useRef, useState } from "react";
import { parseSlideText, isParseError } from "@/lib/parseSlideText";
import type { SlideText } from "@/lib/types";

interface Props {
  slideTexts: SlideText[];
  imageCount: number;
  onChange: (texts: SlideText[]) => void;
}

type Tab = "paste" | "file";

const EXAMPLE_JSON = `[
  {
    "heading": "Sunset in Bali",
    "rating": "9.5",
    "subtext": "Golden hour hits different\\non the island of the gods."
  },
  {
    "heading": "No Rating Here",
    "subtext": "Sometimes the view speaks for itself."
  },
  {
    "rating": "10"
  }
]`;

/** Delay (ms) after the last keystroke before validation fires */
const VALIDATE_DEBOUNCE = 700;

export default function TextInputPanel({ slideTexts, imageCount, onChange }: Props) {
  const [tab,   setTab]   = useState<Tab>("paste");
  const [raw,   setRaw]   = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Update the raw text immediately; defer validation so typing doesn't flash errors */
  function applyRaw(text: string, immediate = false) {
    setRaw(text);

    if (timerRef.current) clearTimeout(timerRef.current);

    if (!text.trim()) {
      setError(null);
      onChange([]);
      return;
    }

    const validate = () => {
      const result = parseSlideText(text);
      if (isParseError(result)) {
        setError(result.error);
      } else {
        setError(null);
        onChange(result.data);
      }
    };

    if (immediate) {
      validate();
    } else {
      timerRef.current = setTimeout(validate, VALIDATE_DEBOUNCE);
    }
  }

  // Clean up timer on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === "string") applyRaw(content, true);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const extra =
    imageCount > 0 && slideTexts.length > imageCount
      ? slideTexts.length - imageCount
      : 0;

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        {(["paste", "file"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={[
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              tab === t
                ? "bg-indigo-600 text-white"
                : "text-white/50 hover:text-white/80",
            ].join(" ")}
          >
            {t === "paste" ? "Paste JSON" : "Upload file"}
          </button>
        ))}
      </div>

      {tab === "paste" && (
        <div className="space-y-1">
          <textarea
            rows={10}
            value={raw}
            onChange={(e) => applyRaw(e.target.value)}
            placeholder={EXAMPLE_JSON}
            className={[
              "w-full rounded-xl bg-white/5 border p-3 font-mono text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:ring-2 resize-y transition-colors",
              error
                ? "border-red-500/60 focus:ring-red-500/40"
                : "border-white/10 focus:ring-indigo-500/40",
            ].join(" ")}
          />
          <p className="text-white/25 text-xs">
            Use <code className="text-white/40">\n</code> inside a string value for a line break
          </p>
        </div>
      )}

      {tab === "file" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-5 py-2.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white/80 text-sm font-medium transition-colors"
          >
            Browse .json / .txt file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            className="hidden"
            onChange={onFileChange}
          />
          {raw && (
            <p className="text-white/40 text-xs font-mono truncate">
              {raw.slice(0, 80)}…
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 rounded-lg px-3 py-2 border border-red-500/20">
          {error}
        </p>
      )}

      {/* Status */}
      {!error && slideTexts.length > 0 && (
        <div className="space-y-1">
          <p className="text-emerald-400 text-sm">
            ✓ {slideTexts.length} text entr{slideTexts.length !== 1 ? "ies" : "y"} loaded
          </p>
          {extra > 0 && (
            <p className="text-amber-400/80 text-xs">
              ⚠ {extra} extra entr{extra !== 1 ? "ies" : "y"} beyond the number of images — {extra === 1 ? "it" : "they"} will be ignored.
            </p>
          )}
        </div>
      )}

      {!error && slideTexts.length > 0 && imageCount > slideTexts.length && (
        <p className="text-white/40 text-xs">
          {imageCount - slideTexts.length} image{imageCount - slideTexts.length !== 1 ? "s" : ""} have no matching text entry and will be exported without text overlay.
        </p>
      )}
    </div>
  );
}
