"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Slide, TextKey, TextPositions, TextStyle } from "@/lib/types";
import { DEFAULT_TEXT_STYLE } from "@/lib/types";
import {
  drawSlide,
  getTextCentres,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "@/lib/renderSlide";

interface Props {
  slide: Slide;
  index: number;
  positions: TextPositions;
  onPositionChange: (key: TextKey, x: number, y: number) => void;
  appendPerTen: boolean;
  textStyle?: TextStyle;
  // AI prompt editing & regeneration
  prompt?: string;
  onPromptChange?: (prompt: string) => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

interface DragState {
  key: TextKey;
  startClientX: number;
  startClientY: number;
  startNormX: number;
  startNormY: number;
}

/** How close (in normalised units) the cursor must be to a text centre to grab it */
const HIT_RADIUS = 0.12;

export default function SlidePreview({
  slide,
  index,
  positions,
  onPositionChange,
  appendPerTen,
  textStyle = DEFAULT_TEXT_STYLE,
  prompt,
  onPromptChange,
  onRegenerate,
  regenerating = false,
}: Props) {
  const [promptOpen, setPromptOpen] = useState(false);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imgRef     = useRef<HTMLImageElement | null>(null);
  const dragRef    = useRef<DragState | null>(null);
  const [activeKey, setActiveKey] = useState<TextKey | null>(null);
  const [hoverKey,  setHoverKey]  = useState<TextKey | null>(null);

  // ── draw ───────────────────────────────────────────────────────────────────
  const redraw = useCallback(
    (img: HTMLImageElement, ak: TextKey | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawSlide(ctx, img, slide.text, positions, CANVAS_WIDTH, CANVAS_HEIGHT, ak, appendPerTen, textStyle);
    },
    [slide.text, positions, appendPerTen, textStyle],
  );

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      redraw(img, activeKey);
    };
    img.src = slide.objectUrl;
  }, [slide.objectUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw when text, positions, or activeKey changes (but NOT on objectUrl change)
  useEffect(() => {
    if (imgRef.current) redraw(imgRef.current, activeKey);
  }, [redraw, activeKey]);

  // ── coordinate helpers ─────────────────────────────────────────────────────
  const clientToNorm = useCallback(
    (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        nx: (clientX - rect.left) / rect.width,
        ny: (clientY - rect.top)  / rect.height,
      };
    },
    [],
  );

  const findHit = useCallback(
    (nx: number, ny: number): TextKey | null => {
      const centres = getTextCentres(positions, 1, 1);
      const keys: TextKey[] = ["heading", "rating", "subtext"];
      let best: TextKey | null = null;
      let bestDist = Infinity;

      for (const key of keys) {
        // Only consider elements that have content
        const t = slide.text;
        if (!t) continue;
        if (key === "heading" && !t.heading) continue;
        if (key === "rating"  && (t.rating === undefined || String(t.rating).trim() === "")) continue;
        if (key === "subtext" && !t.subtext) continue;

        const { cx, cy } = centres[key];
        const dx = nx - cx;
        const dy = ny - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < HIT_RADIUS && dist < bestDist) {
          bestDist = dist;
          best = key;
        }
      }
      return best;
    },
    [positions, slide.text],
  );

  // ── drag start (mouse) ─────────────────────────────────────────────────────
  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { nx, ny } = clientToNorm(canvas, e.clientX, e.clientY);
      const hit = findHit(nx, ny);
      if (!hit) return;
      e.preventDefault();
      dragRef.current = {
        key: hit,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startNormX: positions[hit].x,
        startNormY: positions[hit].y,
      };
      setActiveKey(hit);
    },
    [clientToNorm, findHit, positions],
  );

  // ── drag start (touch) ─────────────────────────────────────────────────────
  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || e.touches.length === 0) return;
      const t = e.touches[0];
      const { nx, ny } = clientToNorm(canvas, t.clientX, t.clientY);
      const hit = findHit(nx, ny);
      if (!hit) return;
      e.preventDefault();
      dragRef.current = {
        key: hit,
        startClientX: t.clientX,
        startClientY: t.clientY,
        startNormX: positions[hit].x,
        startNormY: positions[hit].y,
      };
      setActiveKey(hit);
    },
    [clientToNorm, findHit, positions],
  );

  // ── global mouse/touch move & up ──────────────────────────────────────────
  useEffect(() => {
    function onMove(clientX: number, clientY: number) {
      const drag   = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (clientX - drag.startClientX) / rect.width;
      const dy = (clientY - drag.startClientY) / rect.height;
      const nx = Math.max(0, Math.min(1, drag.startNormX + dx));
      const ny = Math.max(0, Math.min(1, drag.startNormY + dy));
      onPositionChange(drag.key, nx, ny);
    }

    function onEnd() {
      if (!dragRef.current) return;
      dragRef.current = null;
      setActiveKey(null);
    }

    function handleMouseMove(e: MouseEvent) { onMove(e.clientX, e.clientY); }
    function handleMouseUp()                { onEnd(); }
    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length > 0) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }
    function handleTouchEnd()               { onEnd(); }

    window.addEventListener("mousemove",  handleMouseMove);
    window.addEventListener("mouseup",    handleMouseUp);
    window.addEventListener("touchmove",  handleTouchMove, { passive: false });
    window.addEventListener("touchend",   handleTouchEnd);
    return () => {
      window.removeEventListener("mousemove",  handleMouseMove);
      window.removeEventListener("mouseup",    handleMouseUp);
      window.removeEventListener("touchmove",  handleTouchMove);
      window.removeEventListener("touchend",   handleTouchEnd);
    };
  }, [onPositionChange]);

  // ── hover cursor ───────────────────────────────────────────────────────────
  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (dragRef.current) return; // already dragging
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { nx, ny } = clientToNorm(canvas, e.clientX, e.clientY);
      setHoverKey(findHit(nx, ny));
    },
    [clientToNorm, findHit],
  );

  const onMouseLeave = useCallback(() => setHoverKey(null), []);

  const cursor =
    activeKey ? "cursor-grabbing" :
    hoverKey  ? "cursor-grab"     :
                "cursor-default";

  return (
    <div className="flex flex-col gap-2">
      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-xl border border-white/10 bg-black"
        style={{ aspectRatio: "9/16" }}
      >
        {/* Regenerating overlay */}
        {regenerating && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 rounded-xl gap-2">
            <span className="w-7 h-7 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <span className="text-white/60 text-xs">Regenerating…</span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className={`w-full h-full ${cursor} touch-none`}
          style={{ display: "block" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onTouchStart={onTouchStart}
        />

        {/* Drag hint */}
        {slide.text &&
          (slide.text.heading || slide.text.rating !== undefined || slide.text.subtext) && (
            <div className="absolute bottom-1.5 left-0 right-0 flex justify-center pointer-events-none">
              <span className="text-white/30 text-[9px] bg-black/40 rounded px-1.5 py-0.5 select-none">
                drag to reposition
              </span>
            </div>
          )}
      </div>

      {/* ── Meta ────────────────────────────────────────────────────────────── */}
      <div className="px-1 space-y-0.5">
        <p className="text-white/60 text-xs font-medium">
          #{index + 1} &middot; {slide.file.name}
        </p>
        {slide.text?.heading && (
          <p className="text-white/80 text-xs truncate">{slide.text.heading}</p>
        )}
        {slide.text?.rating !== undefined && (
          <p className="text-indigo-300 text-xs">{String(slide.text.rating)}</p>
        )}
      </div>

      {/* ── AI prompt editor + Regenerate ───────────────────────────────────── */}
      {prompt !== undefined && (
        <div className="space-y-1.5 px-0.5">
          {/* Toggle */}
          <button
            type="button"
            onClick={() => setPromptOpen((v) => !v)}
            className="text-white/30 hover:text-white/60 text-[10px] transition-colors flex items-center gap-1"
          >
            <span className={["transition-transform duration-150", promptOpen ? "rotate-90" : ""].join(" ")}>▶</span>
            {promptOpen ? "Hide prompt" : "Edit prompt"}
          </button>

          {promptOpen && (
            <div className="space-y-1.5">
              <textarea
                rows={5}
                value={prompt}
                onChange={(e) => onPromptChange?.(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 p-2 text-[10px] font-mono text-white/80 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-red-500/40 resize-y"
              />
              <button
                type="button"
                onClick={onRegenerate}
                disabled={regenerating || !prompt.trim()}
                className="w-full py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                {regenerating ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Regenerating…
                  </>
                ) : (
                  "↺ Regenerate"
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
