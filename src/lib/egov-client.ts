import { getCache, setCache } from "./cache.js";
import { CACHE_TTLS, ANNEX_TABLE_MAP } from "../types/index.js";
import type {
  EGovLawDataResponse,
  EGovKeywordResponse,
  EGovLawsResponse,
} from "../types/index.js";

const BASE_URL = "https://laws.e-gov.go.jp/api/2";

interface FetchOptions {
  cacheTtl?: number;
  cacheKey?: string;
}

/**
 * Convert Japanese annex table names to AppdxTable[N] format.
 * e.g. "別表第一" → "AppdxTable[1]", "別表第3の2" → "AppdxTable[7]"
 */
export function normalizeElm(elm: string): string {
  // Already in AppdxTable format
  if (elm.startsWith("AppdxTable")) return elm;

  // 漢数字→アラビア数字変換
  const kanjiToArabic: Record<string, string> = {
    一: "1", 二: "2", 三: "3", 四: "4", 五: "5",
    六: "6", 七: "7", 八: "8", 九: "9", 十: "10",
  };

  let normalized = elm;

  // "別表第X" or "別表第Xの Y" patterns
  const match = normalized.match(/別表第([一二三四五六七八九十\d]+)(?:の(\d+))?/);
  if (match) {
    let tableNum = match[1];
    // Convert kanji to arabic
    if (kanjiToArabic[tableNum]) {
      tableNum = kanjiToArabic[tableNum];
    }
    const suffix = match[2] ? `-${match[2]}` : "";
    const key = `${tableNum}${suffix}`;
    if (ANNEX_TABLE_MAP[key]) {
      return ANNEX_TABLE_MAP[key];
    }
  }

  return elm;
}

async function fetchWithCache<T>(
  url: string,
  opts: FetchOptions = {}
): Promise<{ data: T; fromCache: boolean; stale: boolean }> {
  const cacheKey = opts.cacheKey ?? url;
  const ttl = opts.cacheTtl ?? CACHE_TTLS.LAW_TEXT;

  // Try cache first
  const cached = await getCache<T>(cacheKey);
  if (cached && !cached.stale) {
    return { data: cached.data, fromCache: true, stale: false };
  }

  // Fetch from API with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      // If we have stale cache, use it as fallback
      if (cached) {
        return { data: cached.data, fromCache: true, stale: true };
      }
      throw new Error(`e-Gov API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as T;
    try {
      await setCache(cacheKey, data, ttl);
    } catch {
      // Cache write failure should not fail the API call
    }
    return { data, fromCache: false, stale: false };
  } catch (error) {
    // Network error — fallback to stale cache
    if (cached) {
      return { data: cached.data, fromCache: true, stale: true };
    }
    throw error;
  }
}

export async function getLawData(
  lawId: string,
  elm?: string
): Promise<{ data: EGovLawDataResponse; fromCache: boolean; stale: boolean }> {
  if (!/^[A-Za-z0-9]+$/.test(lawId)) {
    throw new Error(`Invalid law ID format: ${lawId}`);
  }
  const normalizedElm = elm ? normalizeElm(elm) : undefined;
  let url = `${BASE_URL}/law_data/${lawId}?response_format=json`;
  if (normalizedElm) {
    url += `&elm=${encodeURIComponent(normalizedElm)}`;
  }
  const cacheKey = normalizedElm ? `law_${lawId}_${normalizedElm}` : `law_${lawId}`;
  return fetchWithCache<EGovLawDataResponse>(url, {
    cacheKey,
    cacheTtl: CACHE_TTLS.LAW_TEXT,
  });
}

export async function searchByKeyword(
  keyword: string,
  lawType?: string
): Promise<{ data: EGovKeywordResponse; fromCache: boolean; stale: boolean }> {
  const params = new URLSearchParams({ keyword });
  if (lawType) {
    params.set("law_type", lawType);
  }
  const url = `${BASE_URL}/keyword?${params.toString()}`;
  const cacheKey = `keyword_${keyword}_${lawType ?? "all"}`;
  return fetchWithCache<EGovKeywordResponse>(url, {
    cacheKey,
    cacheTtl: CACHE_TTLS.LAW_TEXT,
  });
}

export async function getLaws(
  lawType?: string,
  category?: string
): Promise<{ data: EGovLawsResponse; fromCache: boolean; stale: boolean }> {
  const params = new URLSearchParams();
  if (lawType) params.set("law_type", lawType);
  if (category) params.set("category", category);
  const url = `${BASE_URL}/laws?${params.toString()}`;
  const cacheKey = `laws_${lawType ?? "all"}_${category ?? "all"}`;
  return fetchWithCache<EGovLawsResponse>(url, {
    cacheKey,
    cacheTtl: CACHE_TTLS.LAW_TEXT,
  });
}
