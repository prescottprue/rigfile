import { useEffect, useRef, useState } from "react";

import { btnPrimary, btnSecondary } from "~/components/ui";
import {
  defaultQuad,
  detectDocumentQuad,
  type Quad,
  warpDocument,
} from "~/lib/document-scan";

type Status = "detecting" | "ready" | "flattening" | "unavailable";

/** Clamp a fractional coordinate to the image. */
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Full-screen document-scan modal: auto-detects the page's four corners,
 * lets the user nudge each one, then perspective-warps the photo flat (better
 * OCR, cleaner stored scan). OpenCV.js loads lazily on open; if it can't
 * load, the modal degrades to "crop instead" / "use original" so a scan is
 * never blocked. Browser-only — render from an event handler, never SSR.
 */
export function DocumentScanner({
  file,
  onConfirm,
  onCancel,
  onCropInstead,
}: {
  file: File;
  onConfirm: (flattened: File) => void;
  onCancel: () => void;
  /** Fall back to the plain rectangular cropper with the same photo. */
  onCropInstead: (file: File) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [status, setStatus] = useState<Status>("detecting");
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ corner: number; id: number } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Kick off detection once on open. A failure to load OpenCV (network, old
  // device) flips to the degraded state rather than throwing.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const detected = await detectDocumentQuad(file);
        if (!alive) return;
        setQuad(detected ?? defaultQuad());
        setStatus("ready");
      } catch {
        if (alive) setStatus("unavailable");
      }
    })();
    return () => {
      alive = false;
    };
  }, [file]);

  function onImgLoad() {
    const img = imgRef.current;
    if (img) setBox({ w: img.clientWidth, h: img.clientHeight });
  }

  function startDrag(e: React.PointerEvent, corner: number) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { corner, id: e.pointerId };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const img = imgRef.current;
    if (!d || !img || !quad) return;
    const r = img.getBoundingClientRect();
    const x = clamp01((e.clientX - r.left) / r.width);
    const y = clamp01((e.clientY - r.top) / r.height);
    setQuad(quad.map((p, i) => (i === d.corner ? { x, y } : p)) as Quad);
  }

  function endDrag() {
    drag.current = null;
  }

  async function flatten() {
    if (!quad) return;
    setStatus("flattening");
    try {
      onConfirm(await warpDocument(file, quad));
    } catch {
      setStatus("unavailable");
    }
  }

  const points =
    box && quad
      ? quad.map((p) => `${p.x * box.w},${p.y * box.h}`).join(" ")
      : "";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Scan document"
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
            {box && quad && status !== "unavailable" ? (
              <>
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${box.w} ${box.h}`}
                  preserveAspectRatio="none"
                  role="img"
                >
                  <title>Detected document outline</title>
                  <polygon
                    points={points}
                    fill="rgba(251,146,60,0.18)"
                    stroke="#fb923c"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {quad.map((p, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed 4-corner quad, index is the identity
                    key={i}
                    aria-hidden
                    onPointerDown={(e) => startDrag(e, i)}
                    style={{
                      left: p.x * box.w,
                      top: p.y * box.h,
                      touchAction: "none",
                    }}
                    className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent/70"
                  />
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        {status === "detecting" || status === "flattening" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex items-center gap-3 rounded-xl bg-card px-4 py-3">
              <span
                aria-hidden
                className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent"
              />
              <p className="text-sm font-medium text-ink">
                {status === "detecting"
                  ? "Finding the document…"
                  : "Flattening…"}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {status === "unavailable" ? (
        <div className="mx-auto mt-4 w-full max-w-md space-y-3">
          <p className="rounded-xl border border-line bg-card p-3 text-center text-sm text-ink">
            Couldn't run the document scanner on this device. Crop it manually
            instead, or use the original photo.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className={`${btnSecondary} flex-1`}
              onClick={() => onConfirm(file)}
            >
              Use original
            </button>
            <button
              type="button"
              className={`${btnPrimary} flex-1`}
              onClick={() => onCropInstead(file)}
            >
              Crop instead
            </button>
          </div>
          <button
            type="button"
            className="w-full text-center text-sm text-ink-muted hover:underline"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mx-auto mt-4 w-full max-w-md space-y-2">
          <div className="flex gap-3">
            <button
              type="button"
              className={`${btnSecondary} flex-1`}
              onClick={onCancel}
              disabled={status === "flattening"}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${btnPrimary} flex-1`}
              onClick={flatten}
              disabled={status !== "ready"}
            >
              {status === "flattening" ? "Flattening…" : "Flatten & use"}
            </button>
          </div>
          <button
            type="button"
            className="w-full text-center text-sm text-ink-muted hover:underline"
            onClick={() => onCropInstead(file)}
            disabled={status === "flattening"}
          >
            Crop instead (no flatten)
          </button>
        </div>
      )}
    </div>
  );
}
