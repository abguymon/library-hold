import { NextResponse } from "next/server";
import { getMergedBooks } from "@lib/books";
import { loadConfig } from "@lib/config";
import { loadCoverCache, cacheKey } from "@lib/covers";

export async function GET() {
  try {
    const books = getMergedBooks();
    const cfg = loadConfig();
    const watchedSet = new Set((cfg.watchedAuthors ?? []).map((a) => a.toLowerCase()));

    // Load the pre-populated cover cache — no live fetches here so the
    // response is fast. Missing covers fall back to lazy fetch in BookCard.
    const coverCache = loadCoverCache();

    const annotated = books.map((b) => {
      const key = cacheKey(b.title);
      const cached = coverCache[key];
      return {
        ...b,
        watchedAuthor: watchedSet.size > 0 && watchedSet.has(b.author.toLowerCase()),
        // undefined = not cached yet (BookCard will lazy-fetch)
        // null = cached miss  (BookCard skips fetch)
        // string = cached hit (BookCard uses it directly)
        coverUrl: cached !== undefined ? (cached || null) : undefined,
      };
    });
    return NextResponse.json(annotated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
