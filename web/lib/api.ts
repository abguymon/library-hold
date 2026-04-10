export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Shared response shapes (mirrored from API routes)
// ---------------------------------------------------------------------------

export interface HoldItem {
  id?: string;
  title: string;
  materialType?: string;
  location?: string | number;
  frozen: boolean;
  status?: number;
  priority?: number;
  priorityQueueLength?: number;
  coverUrl?: string | null;
}

export interface HoldsResponse {
  holds: HoldItem[];
  total: number;
  limit: number;
  pictureBookCount: number;
}

export interface CheckoutItem {
  title: string;
  materialType?: string;
  dueDate?: string;
}

export interface SearchItem {
  id: string;
  title: string;
  author: string;
  year?: string;
  availability?: string;
  materialType?: string;
}

export interface SearchResponse {
  results: SearchItem[];
  holdsCount: number;
  holdsLimit: number;
}

export interface BookItem {
  title: string;
  author: string;
  year: number;
  lists: string[];
  series: string | null;
  seriesOrder: number | null;
  read: boolean;
  rating: number | null;
  readDates: string[];
  skip: boolean;
  heldDates: string[];
  coverUrl?: string | null;
  watchedAuthor?: boolean;
}

export interface WatchedAuthorsResponse {
  authors: string[];
}

export interface TopupResponse {
  placed: string[];
  notFound: string[];
  message: string;
  pictureBookHolds: number;
  target: number;
}
