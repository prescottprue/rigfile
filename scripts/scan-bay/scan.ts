/**
 * Scan Bay step 1 — extract.
 *
 *   npm run scan:extract -- <folder> [--out review.json] [--model qwen3-vl:8b]
 *                            [--host http://localhost:11434]
 *
 * Reads every image in <folder>, runs each through the local vision model, and
 * writes a review file (default <folder>/scan-review.json). Review/edit that
 * file, then feed it to `npm run scan:import`.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { DEFAULT_OLLAMA, extractReceipt } from "./ollama.ts";
import { isScannable, type ReviewEntry, type ReviewFile } from "./review.ts";

type Args = {
  folder: string;
  out: string;
  model: string;
  host: string;
};

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let out: string | undefined;
  let model = DEFAULT_OLLAMA.model;
  let host = DEFAULT_OLLAMA.host;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") out = argv[++i];
    else if (arg === "--model") model = argv[++i] ?? model;
    else if (arg === "--host") host = argv[++i] ?? host;
    else if (arg?.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
    else if (arg) positional.push(arg);
  }

  const folder = positional[0];
  if (!folder) {
    throw new Error(
      "Usage: scan:extract -- <folder> [--out file] [--model m] [--host url]",
    );
  }
  return {
    folder: resolve(folder),
    out: out ? resolve(out) : join(resolve(folder), "scan-review.json"),
    model,
    host,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const all = await readdir(args.folder);
  const images = all.filter(isScannable).sort();
  if (images.length === 0) {
    console.error(`No scannable images in ${args.folder}`);
    process.exit(1);
  }

  console.log(
    `[scan] ${images.length} image(s) in ${args.folder} → ${args.model}`,
  );

  const entries: ReviewEntry[] = [];
  for (const file of images) {
    process.stdout.write(`  • ${file} … `);
    try {
      const bytes = await readFile(join(args.folder, file));
      const extracted = await extractReceipt(new Uint8Array(bytes), {
        host: args.host,
        model: args.model,
      });
      entries.push({ file, status: "pending", extracted });
      const cost =
        extracted.totalCost != null ? `$${extracted.totalCost}` : "?";
      console.log(`ok — "${extracted.suggestedTitle}" (${cost})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      entries.push({ file, status: "skip", error: message, extracted: null });
      console.log(`FAILED — ${message}`);
    }
  }

  const review: ReviewFile = {
    version: 1,
    createdAt: new Date().toISOString(),
    sourceDir: args.folder,
    model: args.model,
    entries,
  };
  await writeFile(args.out, `${JSON.stringify(review, null, 2)}\n`);

  const ok = entries.filter((e) => e.status === "pending").length;
  console.log(
    `\n[scan] wrote ${args.out} — ${ok}/${entries.length} extracted.\n` +
      `Review it, then: npm run scan:import -- ${args.out} --vehicle <id>`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
