import { loadConfig, type Config } from "./config.js";
import {
  holdLimit,
  getHolds,
  search,
  placeHold,
} from "./iiivega.js";
// loadConfig is imported so callers can use it; exported for convenience
export { loadConfig };
import {
  type BundledBook,
  loadBundledBooks,
  topupCandidates,
  recordHeld,
} from "./books.js";

export interface TopupResult {
  pictureBookHolds: number;
  target: number;
  placed: string[];
  notFound: string[];
  totalHolds: number;
  limit: number;
}

/**
 * Core topup logic — shared by the CLI and web API route.
 *
 * @param cfg       Authenticated config (caller must call ensureAuth first)
 * @param target    Target number of picture-book holds (default 10)
 * @param pickup    Pickup location id override
 * @param bundled   Pre-loaded bundled books list (pass to avoid redundant disk reads)
 * @param onProgress  Optional callback for progress messages (CLI prints them; web ignores)
 */
export async function runTopup(
  cfg: Config,
  target = 10,
  pickup?: string,
  bundled?: BundledBook[],
  onProgress?: (msg: string) => void,
): Promise<TopupResult> {
  const log = onProgress ?? ((_: string) => {});

  const holds = await getHolds(cfg);
  const limit = holdLimit(cfg);
  const totalHolds = holds.length;

  const books = bundled ?? loadBundledBooks();
  const bundledTitlesLower = new Set(books.map((b) => b.title.toLowerCase()));
  const holdTitlesRaw = holds
    .map((h) => (h.resource?.title ?? "").toLowerCase())
    .filter(Boolean);

  // The catalog API often appends subtitles to hold titles (e.g. "Animals of the Bible : a picture book"
  // vs our bundled "Animals of the Bible"). Match if either title starts with the other.
  function titlesMatch(holdTitle: string, bundledTitle: string): boolean {
    if (holdTitle === bundledTitle) return true;
    if (holdTitle.startsWith(bundledTitle + " ")) return true;
    if (bundledTitle.startsWith(holdTitle + " ")) return true;
    return false;
  }

  // Build a set of bundled titles currently on hold (for exclusion in candidates)
  const heldBundledTitles = new Set<string>();
  for (const ht of holdTitlesRaw) {
    for (const bt of bundledTitlesLower) {
      if (titlesMatch(ht, bt)) {
        heldBundledTitles.add(bt);
        break;
      }
    }
  }
  const picbookHoldCount = heldBundledTitles.size;

  const gap = Math.max(0, target - picbookHoldCount);
  const headroom = limit - totalHolds;
  const toPlace = Math.min(gap, headroom);

  if (toPlace <= 0) {
    return {
      pictureBookHolds: picbookHoldCount,
      target,
      placed: [],
      notFound: [],
      totalHolds,
      limit,
    };
  }

  const watchedSet = cfg.watchedAuthors?.length
    ? new Set(cfg.watchedAuthors.map((a) => a.toLowerCase()))
    : undefined;
  // Pass heldBundledTitles (exact bundled title keys) so candidates excludes them correctly
  const candidates = topupCandidates(heldBundledTitles, books, undefined, watchedSet);
  const placed: string[] = [];
  const notFound: string[] = [];

  for (const book of candidates) {
    if (placed.length >= toPlace) break;

    log(`Searching: ${book.title}`);
    let results: Awaited<ReturnType<typeof search>>;
    try {
      // Include author's last name in query for precision (avoids ambiguous title matches).
      // Author last name is the last word of the author string.
      const authorWords = book.author.split(/\s+/).filter((w) => w.length > 1);
      const authorLast = authorWords[authorWords.length - 1] ?? "";
      const query = authorLast ? `${book.title} ${authorLast}` : book.title;
      results = await search(cfg, query);
    } catch {
      notFound.push(book.title);
      continue;
    }

    if (!results.length) {
      notFound.push(book.title);
      continue;
    }

    // Verify the top result is a reasonable title match.
    // The search API returns fuzzy results — we need to confirm the first significant word
    // of our query appears among the first few words of the result title.
    const STOP = new Set(["a", "an", "the", "of", "and", "in", "on", "at", "to", "for", "by", "with"]);
    const firstSignificant = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).find((w) => w.length > 1 && !STOP.has(w)) ?? "";
    const queryFirst = firstSignificant(book.title);

    const top = results.find((r) => {
      if (!r.title) return false;
      const resultWords = r.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/);
      // The first significant word of the query must be the first significant word of the result title
      const resultFirst = resultWords.find((w) => w.length > 1 && !STOP.has(w)) ?? "";
      return queryFirst && resultFirst === queryFirst;
    });

    if (!top) {
      log(`  No matching title found (catalog may not have it)`);
      notFound.push(book.title);
      continue;
    }

    log(`  Found: ${top.title ?? book.title}`);
    const ok = await placeHold(cfg, top.id, pickup, top.title);
    if (ok) {
      recordHeld(book.title);
      placed.push(book.title);
    } else {
      notFound.push(book.title);
    }
  }

  return {
    pictureBookHolds: picbookHoldCount,
    target,
    placed,
    notFound,
    totalHolds,
    limit,
  };
}
