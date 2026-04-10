import { NextResponse } from "next/server";
import { loadConfig } from "@lib/config";
import { ensureAuth, getHolds, holdLimit } from "@lib/iiivega";
import { loadBundledBooks } from "@lib/books";

export async function GET() {
  try {
    let cfg = loadConfig();
    cfg = await ensureAuth(cfg);

    // Fetch holds and bundled titles in parallel
    const [holds, bundled] = await Promise.all([
      getHolds(cfg),
      Promise.resolve(loadBundledBooks()),
    ]);

    const limit = holdLimit(cfg);
    const bundledTitles = new Set(bundled.map((b) => b.title.toLowerCase()));
    const pictureBookCount = holds.filter(
      (h) => h.resource?.title && bundledTitles.has(h.resource.title.toLowerCase()),
    ).length;

    const items = holds.map((h) => ({
      id: h.id,
      title: h.resource?.title ?? "Unknown",
      materialType: h.resource?.materialType,
      location: h.location,
      frozen: h.frozen ?? false,
      status: h.status,
      priority: h.priority,
      priorityQueueLength: h.priorityQueueLength,
    }));

    return NextResponse.json({
      holds: items,
      total: items.length,
      limit,
      pictureBookCount,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
