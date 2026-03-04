import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CacheEntry } from "../types/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "..", "..", "cache");

async function ensureCacheDir(): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }
}

function cacheFilePath(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(CACHE_DIR, `${safeKey}.json`);
}

export async function getCache<T>(key: string): Promise<{ data: T; stale: boolean } | null> {
  const filePath = cacheFilePath(key);
  try {
    const raw = await readFile(filePath, "utf-8");
    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - entry.cachedAt;
    if (age < entry.ttl) {
      return { data: entry.data, stale: false };
    }
    // Return stale data (caller can decide to use it as fallback)
    return { data: entry.data, stale: true };
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, data: T, ttl: number): Promise<void> {
  await ensureCacheDir();
  const entry: CacheEntry<T> = {
    data,
    cachedAt: Date.now(),
    ttl,
  };
  const filePath = cacheFilePath(key);
  await writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
}
