import { NextResponse } from "next/server";
import { getCoverUrl } from "@lib/covers";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get("title") ?? "";
    const author = searchParams.get("author") ?? undefined;
    if (!title) {
      return NextResponse.json({ url: null });
    }
    const url = await getCoverUrl(title, author);
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ url: null });
  }
}
