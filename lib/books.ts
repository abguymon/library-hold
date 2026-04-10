import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR } from "./config.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// In Docker, BOOKS_DATA_PATH can override the default ~/.library-hold/books.json
const TRACKING_PATH = process.env["BOOKS_DATA_PATH"] ?? path.join(CONFIG_DIR, "books.json");

// Resolve data/ relative to this file, with fallbacks for webpack/Docker contexts
function resolveBundledPath(): string {
  if (process.env["BOOKS_BUNDLE_PATH"]) return process.env["BOOKS_BUNDLE_PATH"];
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const candidate = path.join(dir, "..", "data", "picture-books.json");
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    // import.meta.url not available (e.g. some webpack contexts)
  }
  // Fallback: cwd-relative (works when running from repo root or web/)
  const cwd = path.join(process.cwd(), "data", "picture-books.json");
  if (fs.existsSync(cwd)) return cwd;
  return path.join(process.cwd(), "..", "data", "picture-books.json");
}
const BUNDLED_PATH = resolveBundledPath();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A book from the bundled data/picture-books.json list. */
export interface BundledBook {
  title: string;
  author: string;
  year: number;
  lists: BookList[];
  series: string | null;
  seriesOrder: number | null;
}

export type BookList = "caldecott_medal" | "caldecott_honor" | string;

/** Personal tracking state stored in ~/.library-hold/books.json. */
export interface TrackingEntry {
  title: string;
  read: boolean;
  rating: number | null;
  readDates: string[];
  skip: boolean;
  heldDates: string[];
}

/** Merged view of bundled metadata + personal tracking. */
export interface BookRecord extends BundledBook, TrackingEntry {}

// ---------------------------------------------------------------------------
// Load/save tracking
// ---------------------------------------------------------------------------

export function loadTracking(): Record<string, TrackingEntry> {
  if (!fs.existsSync(TRACKING_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(TRACKING_PATH, "utf8")) as Record<
      string,
      TrackingEntry
    >;
  } catch {
    return {};
  }
}

export function saveTracking(data: Record<string, TrackingEntry>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(TRACKING_PATH, JSON.stringify(data, null, 2));
}

function trackingKey(title: string): string {
  return title.toLowerCase().trim();
}

function defaultEntry(title: string): TrackingEntry {
  return {
    title,
    read: false,
    rating: null,
    readDates: [],
    skip: false,
    heldDates: [],
  };
}

// ---------------------------------------------------------------------------
// Load bundled list
// ---------------------------------------------------------------------------

export function loadBundledBooks(): BundledBook[] {
  try {
    return JSON.parse(fs.readFileSync(BUNDLED_PATH, "utf8")) as BundledBook[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Merged view
// ---------------------------------------------------------------------------

export function getMergedBooks(
  bundled?: BundledBook[],
  tracking?: Record<string, TrackingEntry>,
): BookRecord[] {
  const books = bundled ?? loadBundledBooks();
  const track = tracking ?? loadTracking();

  return books.map((book) => {
    const key = trackingKey(book.title);
    const entry = track[key] ?? defaultEntry(book.title);
    return { ...book, ...entry, title: book.title };
  });
}

// ---------------------------------------------------------------------------
// Mark read / skip
// ---------------------------------------------------------------------------

/** Fuzzy-match title from tracking by substring (case-insensitive). */
export function findBook(
  searchTerm: string,
  bundled?: BundledBook[],
): BundledBook | undefined {
  const books = bundled ?? loadBundledBooks();
  const term = searchTerm.toLowerCase();
  // Exact match first
  let match = books.find((b) => b.title.toLowerCase() === term);
  if (!match) {
    // Substring match
    match = books.find((b) => b.title.toLowerCase().includes(term));
  }
  return match;
}

export function markRead(
  title: string,
  rating?: number,
  tracking?: Record<string, TrackingEntry>,
): Record<string, TrackingEntry> {
  const track = tracking ?? loadTracking();
  const key = trackingKey(title);
  const entry = track[key] ?? defaultEntry(title);
  entry.read = true;
  entry.readDates = [...entry.readDates, today()];
  if (rating != null) entry.rating = rating;
  track[key] = entry;
  saveTracking(track);
  return track;
}

export function markSkip(
  title: string,
  tracking?: Record<string, TrackingEntry>,
): Record<string, TrackingEntry> {
  const track = tracking ?? loadTracking();
  const key = trackingKey(title);
  const entry = track[key] ?? defaultEntry(title);
  entry.skip = true;
  track[key] = entry;
  saveTracking(track);
  return track;
}

export function recordHeld(
  title: string,
  tracking?: Record<string, TrackingEntry>,
): Record<string, TrackingEntry> {
  const track = tracking ?? loadTracking();
  const key = trackingKey(title);
  const entry = track[key] ?? defaultEntry(title);
  entry.heldDates = [...entry.heldDates, today()];
  track[key] = entry;
  saveTracking(track);
  return track;
}

// ---------------------------------------------------------------------------
// Topup candidate selection
// ---------------------------------------------------------------------------

/** Award tier ordering for topup priority. Lower = higher priority. */
function awardTier(book: BundledBook): number {
  if (book.lists.includes("caldecott_medal")) return 0;
  if (book.lists.includes("caldecott_honor")) return 1;
  return 2;
}

/**
 * Return books eligible for auto-requesting by topup:
 * - Not read
 * - Not skipped
 * - Not already on hold (caller should pass current hold titles to filter)
 *
 * Order: Medal > Honor > other; within a tier, watched authors first;
 * within a series respect seriesOrder (earliest first); then year.
 */
export function topupCandidates(
  alreadyOnHold: Set<string>,
  bundled?: BundledBook[],
  tracking?: Record<string, TrackingEntry>,
  watchedAuthors?: Set<string>,
): BundledBook[] {
  const merged = getMergedBooks(bundled, tracking);

  const eligible = merged.filter((b) => {
    if (b.read) return false;
    if (b.skip) return false;
    if (alreadyOnHold.has(b.title.toLowerCase())) return false;
    return true;
  });

  eligible.sort((a, b) => {
    // Primary: award tier
    const tierDiff = awardTier(a) - awardTier(b);
    if (tierDiff !== 0) return tierDiff;

    // Secondary: watched authors first within the same tier
    if (watchedAuthors?.size) {
      const aW = watchedAuthors.has(a.author.toLowerCase()) ? 0 : 1;
      const bW = watchedAuthors.has(b.author.toLowerCase()) ? 0 : 1;
      if (aW !== bW) return aW - bW;
    }

    // Tertiary: series ordering (earlier books in a series first)
    if (a.series && b.series && a.series === b.series) {
      return (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0);
    }

    // Quaternary: year (older first — work through classics in order)
    return a.year - b.year;
  });

  return eligible;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
