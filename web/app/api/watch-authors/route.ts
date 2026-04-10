import { NextResponse } from "next/server";
import { loadConfig, saveConfig } from "@lib/config";

export async function GET() {
  try {
    const cfg = loadConfig();
    return NextResponse.json({ authors: cfg.watchedAuthors ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const { author } = (await req.json()) as { author: string };
    if (!author?.trim()) {
      return NextResponse.json({ error: "author is required" }, { status: 400 });
    }
    const cfg = loadConfig();
    const watched = cfg.watchedAuthors ?? [];
    const lower = author.trim().toLowerCase();
    if (!watched.some((a) => a.toLowerCase() === lower)) {
      saveConfig({ ...cfg, watchedAuthors: [...watched, author.trim()] });
    }
    const updated = loadConfig();
    return NextResponse.json({ authors: updated.watchedAuthors ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { author } = (await req.json()) as { author: string };
    if (!author?.trim()) {
      return NextResponse.json({ error: "author is required" }, { status: 400 });
    }
    const cfg = loadConfig();
    const watched = cfg.watchedAuthors ?? [];
    const lower = author.trim().toLowerCase();
    saveConfig({
      ...cfg,
      watchedAuthors: watched.filter((a) => a.toLowerCase() !== lower),
    });
    const updated = loadConfig();
    return NextResponse.json({ authors: updated.watchedAuthors ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
