import { NextResponse } from "next/server";
import { loadTracking, saveTracking } from "@lib/books";

interface Params {
  params: Promise<{ title: string }>;
}

interface PatchBody {
  read?: boolean;
  rating?: number;
  skip?: boolean;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { title } = await params;
    const decodedTitle = decodeURIComponent(title);
    const body = (await req.json()) as PatchBody;

    const tracking = loadTracking();
    const key = decodedTitle.toLowerCase().trim();
    const entry = tracking[key] ?? {
      title: decodedTitle,
      read: false,
      rating: null,
      readDates: [],
      skip: false,
      heldDates: [],
    };

    if (body.read === true && !entry.read) {
      entry.read = true;
      entry.readDates = [...entry.readDates, new Date().toISOString().slice(0, 10)];
    }
    if (body.rating != null) {
      entry.rating = body.rating;
    }
    if (body.skip === true) {
      entry.skip = true;
    }

    tracking[key] = entry;
    saveTracking(tracking);

    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
