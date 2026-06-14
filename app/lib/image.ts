/**
 * Shrink an image client-side before upload (canvas resize → JPEG re-encode).
 * Falls back to the original file when the browser can't decode it (e.g.
 * HEIC outside Safari) — server-side size caps still apply, so a failed
 * downscale degrades to a clear server error rather than a broken upload.
 *
 * Lives outside the `.client.*` naming pattern on purpose: route components
 * are statically reachable from the SSR bundle, and merely defining these
 * browser-API functions there is harmless — they're only called from event
 * handlers.
 */
/**
 * Crop an image client-side to a sub-rectangle, given as fractions of the
 * image's (orientation-corrected) dimensions — so the caller works in the
 * coordinate space of the displayed `<img>` without worrying about the
 * intrinsic pixel size or EXIF rotation. Re-encodes to JPEG (which bakes in
 * orientation and strips EXIF). Falls back to the original file when the
 * browser can't decode it, same contract as `downscaleImage`.
 *
 * Lives here, outside the `.client.*` pattern, for the same reason as
 * `downscaleImage`: only ever called from browser event handlers.
 */
export async function cropImage(
  file: File,
  rect: { x: number; y: number; width: number; height: number },
  { quality = 0.9 }: { quality?: number } = {},
): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const sx = Math.round(rect.x * bitmap.width);
    const sy = Math.round(rect.y * bitmap.height);
    const sw = Math.max(1, Math.round(rect.width * bitmap.width));
    const sh = Math.max(1, Math.round(rect.height * bitmap.height));

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", quality),
    );
    if (!blob) return file;
    const base = file.name.replace(/\.\w+$/, "") || "image";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function downscaleImage(
  file: File,
  { maxDim, quality }: { maxDim: number; quality: number },
): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === "image/jpeg") return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", quality),
    );
    if (!blob) return file;
    const base = file.name.replace(/\.\w+$/, "") || "image";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
