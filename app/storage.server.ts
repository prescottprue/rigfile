import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type StoredFile = {
  body: Uint8Array;
  contentType: string;
};

export interface Storage {
  upload(
    key: string,
    body: Uint8Array | ArrayBuffer,
    contentType: string,
  ): Promise<void>;
  read(key: string): Promise<StoredFile | null>;
  exists(key: string): Promise<boolean>;
}

/**
 * Local-filesystem driver. Used for Node self-host. Files live under
 * UPLOADS_DIR (default ./data/uploads) with a sibling .meta.json per file
 * holding the content-type. Keys are treated as relative paths; leading
 * slashes and ".." segments are rejected.
 */
class LocalFilesystemStorage implements Storage {
  constructor(private readonly root: string) {}

  private absolute(key: string): string {
    if (key.includes("..") || key.startsWith("/")) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return join(this.root, key);
  }

  async upload(
    key: string,
    body: Uint8Array | ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    const path = this.absolute(key);
    await mkdir(dirname(path), { recursive: true });
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
    await writeFile(path, bytes);
    await writeFile(`${path}.meta.json`, JSON.stringify({ contentType }));
  }

  async read(key: string): Promise<StoredFile | null> {
    const path = this.absolute(key);
    if (!existsSync(path)) return null;
    const [body, meta] = await Promise.all([
      readFile(path),
      readFile(`${path}.meta.json`, "utf8").catch(() => null),
    ]);
    const contentType = meta
      ? (JSON.parse(meta).contentType as string)
      : "application/octet-stream";
    return {
      body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
      contentType,
    };
  }

  async exists(key: string): Promise<boolean> {
    const path = this.absolute(key);
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * R2 binding driver. Used on Cloudflare Workers.
 * The binding shape matches @cloudflare/workers-types `R2Bucket`.
 */
type R2Object = {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
};
type R2Bucket = {
  put(
    key: string,
    value: Uint8Array | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  head(key: string): Promise<unknown>;
};

class R2Storage implements Storage {
  constructor(private readonly bucket: R2Bucket) {}

  async upload(
    key: string,
    body: Uint8Array | ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    await this.bucket.put(key, body, { httpMetadata: { contentType } });
  }

  async read(key: string): Promise<StoredFile | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    const buf = await obj.arrayBuffer();
    return {
      body: new Uint8Array(buf),
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
    };
  }

  async exists(key: string): Promise<boolean> {
    return (await this.bucket.head(key)) !== null;
  }
}

let _singleton: Storage | undefined;

/**
 * Pick the storage driver based on runtime. On CF, the caller can pass an R2
 * binding explicitly. On Node, reads UPLOADS_DIR from the env.
 */
export function getStorage(r2?: R2Bucket): Storage {
  if (r2) return new R2Storage(r2);
  if (_singleton) return _singleton;
  const root = resolve(process.env.UPLOADS_DIR ?? "./data/uploads");
  _singleton = new LocalFilesystemStorage(root);
  return _singleton;
}
