import { NextResponse } from "next/server";
import { loadConfig } from "@lib/config";
import { ensureAuth, search, placeHold, currentHoldCount, holdLimit } from "@lib/iiivega";
import { findBook } from "@lib/books";

interface RequestBody {
  formatGroupId?: string;
  title?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    let cfg = loadConfig();
    cfg = await ensureAuth(cfg);

    const count = await currentHoldCount(cfg);
    const limit = holdLimit(cfg);
    if (count !== null && count >= limit) {
      return NextResponse.json(
        { error: `Hold limit reached (${count}/${limit})` },
        { status: 409 },
      );
    }

    // If a formatGroupId is provided directly (from search results), use it
    if (body.formatGroupId) {
      const ok = await placeHold(cfg, body.formatGroupId, undefined, body.title);
      if (ok) {
        return NextResponse.json({ placed: true, message: `Hold placed for "${body.title ?? body.formatGroupId}"` });
      }
      return NextResponse.json({ placed: false, message: "Failed to place hold" }, { status: 500 });
    }

    // Otherwise, search by title (used from the Books page "Request Again")
    const title = body.title;
    if (!title) {
      return NextResponse.json({ error: "title or formatGroupId required" }, { status: 400 });
    }

    const results = await search(cfg, title, "1");
    if (!results.length) {
      return NextResponse.json(
        { placed: false, message: `"${title}" not found in catalog` },
        { status: 404 },
      );
    }

    const top = results[0]!;

    // Try to match the bundled title to prefer an exact catalog result
    const bundledBook = findBook(title);
    const bestMatch = bundledBook
      ? (results.find((r) => r.title?.toLowerCase() === bundledBook.title.toLowerCase()) ?? top)
      : top;

    const ok = await placeHold(cfg, bestMatch.id, undefined, bestMatch.title);
    return NextResponse.json({
      placed: ok,
      message: ok
        ? `Hold placed for "${bestMatch.title ?? title}"`
        : `Failed to place hold for "${bestMatch.title ?? title}"`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
