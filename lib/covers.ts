import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".library-hold");
const COVER_CACHE_PATH =
  process.env["COVER_CACHE_PATH"] ??
  path.join(CONFIG_DIR, "covers.json");

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

export function loadCoverCache(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(COVER_CACHE_PATH, "utf8")) as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

export function saveCoverCache(cache: Record<string, string>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(COVER_CACHE_PATH, JSON.stringify(cache, null, 2));
}

export function cacheKey(title: string): string {
  return title.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Open Library (primary — best coverage of classic/vintage picture books)
// ---------------------------------------------------------------------------

interface OpenLibraryResponse {
  docs?: Array<{ cover_i?: number }>;
}

async function getCoverFromOpenLibrary(
  title: string,
  author?: string,
): Promise<string | null> {
  try {
    const q = author ? `${title} ${author}` : title;
    const url =
      `https://openlibrary.org/search.json` +
      `?q=${encodeURIComponent(q)}&limit=3&fields=cover_i,title`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenLibraryResponse;
    // Take first doc that actually has a cover
    const coverId = data.docs?.find((d) => d.cover_i)?.cover_i;
    if (!coverId) return null;
    // -M = medium (~180×270px), good quality without being huge
    return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Google Books (fallback — better for recent/popular books)
// ---------------------------------------------------------------------------

interface GoogleBooksResponse {
  items?: Array<{
    volumeInfo?: {
      imageLinks?: {
        smallThumbnail?: string;
        thumbnail?: string;
        small?: string;
        medium?: string;
      };
    };
  }>;
}

async function getCoverFromGoogleBooks(
  title: string,
  author?: string,
): Promise<string | null> {
  try {
    // Use intitle:/inauthor: operators for more targeted matching
    const q = author
      ? `intitle:${title} inauthor:${author}`
      : `intitle:${title}`;
    const url =
      `https://www.googleapis.com/books/v1/volumes` +
      `?q=${encodeURIComponent(q)}&maxResults=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as GoogleBooksResponse;
    const links = data.items?.[0]?.volumeInfo?.imageLinks;
    if (!links) return null;
    const raw =
      links.medium ?? links.small ?? links.thumbnail ?? links.smallThumbnail;
    if (!raw) return null;
    return raw.replace(/^http:/, "https:").replace(/zoom=\d/, "zoom=2");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a cover image URL for a book.
 * Tries Open Library first (better for classic picture books), then Google Books.
 * Returns null if neither source has a cover.
 */
export async function getCoverUrl(
  title: string,
  author?: string,
): Promise<string | null> {
  const ol = await getCoverFromOpenLibrary(title, author);
  if (ol) return ol;
  return getCoverFromGoogleBooks(title, author);
}

/**
 * Return cover URL from cache, falling back to a live fetch that also
 * populates the cache. Pass `cacheOnly: true` to skip live fetches.
 */
export async function getCoverUrlCached(
  title: string,
  author?: string,
  opts?: { cacheOnly?: boolean; cache?: Record<string, string> },
): Promise<string | null> {
  const cache = opts?.cache ?? loadCoverCache();
  const key = cacheKey(title);
  if (key in cache) return cache[key] ?? null;
  if (opts?.cacheOnly) return null;

  const url = await getCoverUrl(title, author);
  // Write back — load fresh to avoid clobbering concurrent writes
  const fresh = loadCoverCache();
  fresh[key] = url ?? ""; // cache misses too (empty string = confirmed miss)
  saveCoverCache(fresh);
  return url;
}
