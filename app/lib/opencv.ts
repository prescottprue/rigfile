/**
 * Lazy, memoized OpenCV.js loader. The ~10MB single-file WASM build is served
 * as a static edge asset at `/opencv.js` (copied from node_modules into
 * `public/` by scripts/copy-opencv.mjs) and injected via a `<script>` on
 * first use. Deliberately NOT a bundler `import()`: that pulls the 10MB into
 * the Cloudflare Worker upload even though it only ever runs in the browser.
 * Loading it as an asset keeps both the client bundle and the Worker lean —
 * the file downloads only the first time someone scans, then browser-caches.
 *
 * Browser-only, like `~/lib/image`: only ever awaited from event handlers.
 *
 * We declare the exact slice of the OpenCV API we use rather than lean on the
 * package's auto-generated typings (which are incomplete). The UMD build sets
 * `window.cv` and fires `onRuntimeInitialized` once the WASM is ready.
 */

/** An OpenCV `Mat` — only the members the document-scan code touches. */
export interface CvMat {
  rows: number;
  cols: number;
  data32S: Int32Array;
  delete(): void;
}

export interface CvMatVector {
  size(): number;
  get(index: number): CvMat;
  delete(): void;
}

/** Opaque value types passed straight back into OpenCV calls. */
export type CvSize = object;
export type CvScalar = object;

export interface Cv {
  Mat: { new (): CvMat };
  MatVector: { new (): CvMatVector };
  Size: { new (width: number, height: number): CvSize };
  Scalar: { new (...values: number[]): CvScalar };

  imread(canvas: HTMLCanvasElement): CvMat;
  imshow(canvas: HTMLCanvasElement, mat: CvMat): void;
  matFromArray(
    rows: number,
    cols: number,
    type: number,
    array: number[],
  ): CvMat;
  getStructuringElement(shape: number, size: CvSize): CvMat;
  getPerspectiveTransform(src: CvMat, dst: CvMat): CvMat;

  cvtColor(src: CvMat, dst: CvMat, code: number): void;
  GaussianBlur(src: CvMat, dst: CvMat, size: CvSize, sigmaX: number): void;
  Canny(src: CvMat, dst: CvMat, threshold1: number, threshold2: number): void;
  dilate(src: CvMat, dst: CvMat, kernel: CvMat): void;
  findContours(
    image: CvMat,
    contours: CvMatVector,
    hierarchy: CvMat,
    mode: number,
    method: number,
  ): void;
  arcLength(curve: CvMat, closed: boolean): number;
  approxPolyDP(
    curve: CvMat,
    approx: CvMat,
    epsilon: number,
    closed: boolean,
  ): void;
  isContourConvex(curve: CvMat): boolean;
  contourArea(curve: CvMat): number;
  warpPerspective(
    src: CvMat,
    dst: CvMat,
    transform: CvMat,
    size: CvSize,
    flags: number,
    borderMode: number,
    borderValue: CvScalar,
  ): void;

  onRuntimeInitialized: (() => void) | undefined;

  COLOR_RGBA2GRAY: number;
  MORPH_RECT: number;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
  CV_32FC2: number;
  INTER_LINEAR: number;
  BORDER_CONSTANT: number;
}

const SCRIPT_ID = "opencv-js";
const SCRIPT_SRC = "/opencv.js";
/**
 * Hard cap on WASM init. On memory-constrained devices (notably iOS Safari)
 * the runtime can stall instantiating; without this the caller hangs forever.
 * On timeout we reject AND clear the memo so a later attempt can retry.
 */
const LOAD_TIMEOUT_MS = 20_000;

let cvPromise: Promise<Cv> | null = null;

export function loadOpenCv(): Promise<Cv> {
  cvPromise ??= new Promise<Cv>((resolve, reject) => {
    const win = window as unknown as { cv?: Cv };
    let settled = false;

    const succeed = (cv: Cv) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(cv);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cvPromise = null; // allow a retry on the next attempt
      reject(err);
    };
    const timer = setTimeout(
      () => fail(new Error("OpenCV load timed out")),
      LOAD_TIMEOUT_MS,
    );

    const whenReady = (cv: Cv) => {
      if (typeof cv.Mat === "function") succeed(cv);
      else cv.onRuntimeInitialized = () => succeed(cv);
    };

    if (win.cv) {
      whenReady(win.cv);
      return;
    }
    const onLoad = () =>
      win.cv
        ? whenReady(win.cv)
        : fail(new Error("OpenCV loaded but window.cv is missing"));
    const onError = () => fail(new Error("Failed to load OpenCV"));

    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    document.head.appendChild(script);
  });
  return cvPromise;
}
