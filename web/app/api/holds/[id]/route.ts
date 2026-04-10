import { NextResponse } from "next/server";
import { loadConfig } from "@lib/config";
import { ensureAuth, cancelHold, freezeHold } from "@lib/iiivega";

interface Params {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    let cfg = loadConfig();
    cfg = await ensureAuth(cfg);
    await cancelHold(cfg, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { frozen?: boolean };
    let cfg = loadConfig();
    cfg = await ensureAuth(cfg);
    await freezeHold(cfg, id, body.frozen ?? false);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
