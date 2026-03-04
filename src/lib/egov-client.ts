import { getCache, setCache } from "./cache.js";
import { CACHE_TTLS } from "../types/index.js";
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
  let url = `${BASE_URL}/law_data/${lawId}?response_format=json`;
  if (elm) {
    url += `&elm=${encodeURIComponent(elm)}`;
  }
  const cacheKey = elm ? `law_${lawId}_${elm}` : `law_${lawId}`;
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
