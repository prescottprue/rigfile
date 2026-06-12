/**
 * Shrink an image client-side before upload (canvas resize → JPEG re-encode).
 * Falls back to the original file when the browser can't decode it (e.g.
 * HEIC outside Safari) — server-side size caps still apply, so a failed
 * downscale degrades to a clear server error rather than a broken upload.
 */
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
