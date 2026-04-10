import type { TrackingEntry } from "../books.js";

export type { TrackingEntry };

/** Adapter interface for reading/writing book tracking data. */
export interface TrackingAdapter {
  getAll(): Promise<Record<string, TrackingEntry>>;
  save(data: Record<string, TrackingEntry>): Promise<void>;
}
