import { NextResponse } from "next/server";
import { loadConfig } from "@lib/config";
import { ensureAuth, getCheckouts } from "@lib/iiivega";

export async function GET() {
  try {
    let cfg = loadConfig();
    cfg = await ensureAuth(cfg);
    const checkouts = await getCheckouts(cfg);

    const items = checkouts.map((c) => {
      let dueDate = c.dueDate ?? c.due ?? c.dueDateTime ?? "";
      if (dueDate.includes("T")) dueDate = dueDate.slice(0, 10);
      return {
        title: c.resource?.title ?? "Unknown",
        materialType: c.resource?.materialType,
        dueDate: dueDate || undefined,
      };
    });

    return NextResponse.json(items);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
