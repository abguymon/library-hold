import { NextResponse } from "next/server";
import { loadConfig } from "@lib/config";
import { ensureAuth } from "@lib/iiivega";
import { runTopup } from "@lib/topup";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      target?: number;
      pickup?: string;
    };
    const target = body.target ?? 10;

    let cfg = loadConfig();
    cfg = await ensureAuth(cfg);

    const result = await runTopup(cfg, target, body.pickup);
    const { placed, notFound, pictureBookHolds, limit, totalHolds } = result;

    const parts: string[] = [];
    if (placed.length > 0) {
      parts.push(`Placed ${placed.length} hold${placed.length !== 1 ? "s" : ""}: ${placed.join(", ")}`);
    }
    if (notFound.length > 0) {
      parts.push(`${notFound.length} not found in catalog`);
    }
    if (placed.length === 0 && notFound.length === 0) {
      const headroom = limit - totalHolds;
      parts.push(
        pictureBookHolds >= target
          ? `Already at target (${pictureBookHolds}/${target} picture book holds)`
          : headroom <= 0
            ? `Hold limit reached (${totalHolds}/${limit})`
            : "Nothing to place",
      );
    }

    return NextResponse.json({
      placed,
      notFound,
      pictureBookHolds,
      target,
      message: parts.join(". "),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
