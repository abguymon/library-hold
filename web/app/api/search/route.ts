import { NextResponse } from "next/server";
import { loadConfig } from "@lib/config";
import { ensureAuth, search, currentHoldCount, holdLimit, resolveFormat, authorStr, availStr } from "@lib/iiivega";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const format = searchParams.get("format") ?? undefined;
    if (!q.trim()) {
      return NextResponse.json({ results: [], holdsCount: 0, holdsLimit: 15 });
    }

    let cfg = loadConfig();
    cfg = await ensureAuth(cfg);

    const formatId = resolveFormat(format);

    // Fetch search results and hold count in parallel
    const [results, count] = await Promise.all([
      search(cfg, q, formatId),
      currentHoldCount(cfg),
    ]);

    const limit = holdLimit(cfg);

    return NextResponse.json({
      results: results.map((r) => ({
        id: r.id,
        title: r.title ?? "Unknown",
        author: authorStr(r.primaryAgent),
        year: r.publicationYear,
        availability: availStr(r.availability),
        materialType: r.materialType,
      })),
      holdsCount: count ?? 0,
      holdsLimit: limit,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
