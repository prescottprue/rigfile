import { useEffect, useRef, useState } from "react";

import { btnPrimary, btnSecondary } from "~/components/ui";
import { cropImage } from "~/lib/image";

type Rect = { x: number; y: number; w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";
type DragMode = "move" | Corner;

/** Minimum crop edge, in displayed pixels — keeps the box grabbable. */
const MIN = 40;
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

function clampRect(r: Rect, box: { w: number; h: number }): Rect {
  const w = Math.max(MIN, Math.min(r.w, box.w));
  const h = Math.max(MIN, Math.min(r.h, box.h));
  return {
    w,
    h,
    x: Math.max(0, Math.min(r.x, box.w - w)),
    y: Math.max(0, Math.min(r.y, box.h - h)),
  };
}

function cornerStyle(c: Corner): React.CSSProperties {
  const edge = -13;
  return {
    touchAction: "none",
    [c[0] === "n" ? "top" : "bottom"]: edge,
    [c[1] === "w" ? "left" : "right"]: edge,
  };
}

/**
 * Full-screen modal that lets the user crop an image (drag the box to move,
 * drag a corner to resize) before it's uploaded. Pointer-events based, so a
 * finger and a mouse behave the same. Returns a cropped JPEG via `onConfirm`,
 * or `onCancel` if dismissed. Browser-only — render it from an event handler
 * (e.g. after a file is picked), never during SSR.
 *
 * Pass `aspect` (width / height) to lock the box to a fixed ratio — e.g. `1`
 * for a square avatar crop. Omit it for a free-form crop.
 */
export function ImageCropper({
  file,
  aspect,
  onCancel,
  onConfirm,
}: {
  file: File;
  aspect?: number;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    start: Rect;
  } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function onImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    const bw = img.clientWidth;
    const bh = img.clientHeight;
    setBox({ w: bw, h: bh });

    if (aspect) {
      // Largest aspect-locked box that fits, inset slightly and centered.
      let w = bw;
      let h = w / aspect;
      if (h > bh) {
        h = bh;
        w = h * aspect;
      }
      w *= 0.9;
      h *= 0.9;
      setRect({ x: (bw - w) / 2, y: (bh - h) / 2, w, h });
      return;
    }
    // Free-form: start inset from each edge so every handle is grabbable.
    const m = 0.06;
    setRect({ x: bw * m, y: bh * m, w: bw * (1 - 2 * m), h: bh * (1 - 2 * m) });
  }

  function startDrag(e: React.PointerEvent, mode: DragMode) {
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: rect };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !box) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const s = d.start;

    if (d.mode === "move") {
      setRect(clampRect({ ...s, x: s.x + dx, y: s.y + dy }, box));
      return;
    }

    // Resize anchored at the opposite corner (which stays put).
    const east = d.mode === "ne" || d.mode === "se";
    const south = d.mode === "se" || d.mode === "sw";

    if (aspect) {
      // Drive off width, derive height, and cap to the space available from
      // the anchor so the box never leaves the image or inverts.
      const maxW = east ? box.w - s.x : s.x + s.w;
      const maxH = south ? box.h - s.y : s.y + s.h;
      const minW = Math.max(MIN, MIN * aspect);
      let w = east ? s.w + dx : s.w - dx;
      w = Math.max(minW, Math.min(w, maxW, maxH * aspect));
      const h = w / aspect;
      setRect({
        x: east ? s.x : s.x + s.w - w,
        y: south ? s.y : s.y + s.h - h,
        w,
        h,
      });
      return;
    }

    let { x, y, w, h } = s;
    if (east) {
      w = s.w + dx;
    } else {
      x = s.x + dx;
      w = s.w - dx;
    }
    if (south) {
      h = s.h + dy;
    } else {
      y = s.y + dy;
      h = s.h - dy;
    }
    // Stop a corner dragged past its opposite edge from inverting the box.
    if (w < MIN) {
      w = MIN;
      if (!east) x = s.x + s.w - MIN;
    }
    if (h < MIN) {
      h = MIN;
      if (!south) y = s.y + s.h - MIN;
    }
    setRect(clampRect({ x, y, w, h }, box));
  }

  function endDrag() {
    drag.current = null;
  }

  async function confirm() {
    if (!rect || !box) return;
    setBusy(true);
    try {
      const cropped = await cropImage(file, {
        x: rect.x / box.w,
        y: rect.y / box.h,
        width: rect.w / box.w,
        height: rect.h / box.h,
      });
      onConfirm(cropped);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Crop photo"
    >
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {url ? (
          <div className="relative">
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              onLoad={onImgLoad}
              className="max-h-[68vh] max-w-full select-none object-contain"
            />
            {rect ? (
              <div
                className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                  touchAction: "none",
                }}
                onPointerDown={(e) => startDrag(e, "move")}
              >
                {CORNERS.map((c) => (
                  <span
                    key={c}
                    aria-hidden
                    onPointerDown={(e) => startDrag(e, c)}
                    style={cornerStyle(c)}
                    className="absolute h-[26px] w-[26px] rounded-full border-2 border-white bg-black/50"
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mx-auto mt-4 flex w-full max-w-md gap-3">
        <button
          type="button"
          className={`${btnSecondary} flex-1`}
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`${btnPrimary} flex-1`}
          onClick={confirm}
          disabled={busy || !rect}
        >
          {busy ? "Cropping…" : "Use this crop"}
        </button>
      </div>
    </div>
  );
}
