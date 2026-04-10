import { loadTracking, saveTracking } from "../books.js";
import type { TrackingAdapter } from "./index.js";

/**
 * Local JSON file adapter.
 * Reads/writes ~/.library-hold/books.json (or BOOKS_DATA_PATH env var).
 */
export class LocalTrackingAdapter implements TrackingAdapter {
  async getAll(): Promise<ReturnType<typeof loadTracking>> {
    return loadTracking();
  }

  async save(data: ReturnType<typeof loadTracking>): Promise<void> {
    saveTracking(data);
  }
}

export const localAdapter: TrackingAdapter = new LocalTrackingAdapter();
