import { NextResponse } from "next/server";
import { loadConfig } from "@lib/config";
import { ensureAuth, getLocations } from "@lib/iiivega";

export async function GET() {
  try {
    let cfg = loadConfig();
    cfg = await ensureAuth(cfg);
    const locations = await getLocations(cfg);
    return NextResponse.json(locations);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
