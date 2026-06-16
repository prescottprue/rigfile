// Copy the OpenCV.js build into public/ so it ships as a static edge asset
// (loaded lazily via a <script> on first document scan) instead of being
// bundled into the client OR the Cloudflare Worker. Run from dev/build and
// postinstall. Idempotent; a missing source is a skip, not an error.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const src = resolve("node_modules/@techstark/opencv-js/dist/opencv.js");
const dest = resolve("public/opencv.js");

if (!existsSync(src)) {
  console.warn(`[copy-opencv] source missing, skipping: ${src}`);
  process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("[copy-opencv] public/opencv.js updated");
