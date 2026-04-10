"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { BookCard } from "@/components/BookCard";
import { apiFetch, type BookItem, type WatchedAuthorsResponse } from "@/lib/api";

type Tab = "all" | "unread" | "read" | "skipped";
type AwardFilter = "all" | "medal" | "honor";
type SortKey = "tier" | "year" | "title" | "series";

const TABS: Tab[] = ["all", "unread", "read", "skipped"];
const PAGE_SIZE = 60;

function awardTier(lists: string[]): number {
  if (lists.includes("caldecott_medal")) return 0;
  if (lists.includes("caldecott_honor")) return 1;
  return 2;
}

export default function BooksPage() {
  const [books, setBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("unread");
  const [awardFilter, setAwardFilter] = useState<AwardFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("tier");
  const [page, setPage] = useState(0);
  const [showWatchPanel, setShowWatchPanel] = useState(false);
  const [watchInput, setWatchInput] = useState("");

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<BookItem[]>("/api/books");
      setBooks(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  // Reset to first page whenever filters/sort change
  useEffect(() => { setPage(0); }, [tab, awardFilter, search, sort]);

  const filtered = useMemo(() => {
    let result = books;

    if (tab === "unread") result = result.filter((b) => !b.read && !b.skip);
    else if (tab === "read") result = result.filter((b) => b.read);
    else if (tab === "skipped") result = result.filter((b) => b.skip);

    if (awardFilter === "medal")
      result = result.filter((b) => b.lists.includes("caldecott_medal"));
    else if (awardFilter === "honor")
      result = result.filter((b) => b.lists.includes("caldecott_honor"));

    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(term) ||
          b.author.toLowerCase().includes(term),
      );
    }

    if (sort === "series") return result; // series sort handled in render

    return [...result].sort((a, b) => {
      if (sort === "year") return a.year - b.year;
      if (sort === "title") return a.title.localeCompare(b.title);
      // Default: award tier, then year
      const tierDiff = awardTier(a.lists) - awardTier(b.lists);
      return tierDiff !== 0 ? tierDiff : a.year - b.year;
    });
  }, [books, tab, awardFilter, search, sort]);

  // For series grouping view
  const seriesGroups = useMemo(() => {
    if (sort !== "series") return null;
    const groups = new Map<string, BookItem[]>();
    const standalone: BookItem[] = [];
    for (const b of filtered) {
      if (b.series) {
        const group = groups.get(b.series) ?? [];
        group.push(b);
        groups.set(b.series, group);
      } else {
        standalone.push(b);
      }
    }
    // Sort within each series by seriesOrder
    for (const [, group] of groups) {
      group.sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
    }
    // Sort series groups alphabetically
    const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    // Sort standalones by tier/year
    standalone.sort((a, b) => {
      const tierDiff = awardTier(a.lists) - awardTier(b.lists);
      return tierDiff !== 0 ? tierDiff : a.year - b.year;
    });
    return { groups: sorted, standalone };
  }, [filtered, sort]);

  const watchedAuthors = useMemo(
    () => books.filter((b) => b.watchedAuthor).map((b) => b.author),
    [books],
  );
  const uniqueWatched = useMemo(
    () => [...new Set(watchedAuthors)],
    [watchedAuthors],
  );

  const handleMarkRead = async (title: string, rating?: number) => {
    try {
      await apiFetch(`/api/books/${encodeURIComponent(title)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true, ...(rating != null && { rating }) }),
      });
      await loadBooks();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update book");
    }
  };

  const handleSkip = async (title: string) => {
    try {
      await apiFetch(`/api/books/${encodeURIComponent(title)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip: true }),
      });
      await loadBooks();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to skip book");
    }
  };

  const handleRequest = async (title: string) => {
    try {
      const res = await apiFetch<{ placed: boolean; message: string }>(
        "/api/request",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        },
      );
      alert(res.message);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to place hold");
    }
  };

  const handleWatchToggle = async (author: string, watched: boolean) => {
    try {
      await apiFetch<WatchedAuthorsResponse>("/api/watch-authors", {
        method: watched ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author }),
      });
      await loadBooks();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update watch list");
    }
  };

  const handleAddWatch = async () => {
    if (!watchInput.trim()) return;
    await handleWatchToggle(watchInput.trim(), true);
    setWatchInput("");
  };

  const tabCls = (t: Tab) =>
    `px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
      tab === t
        ? "bg-slate-800 text-white"
        : "text-slate-600 hover:bg-slate-100"
    }`;

  const renderGrid = (items: BookItem[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {items.map((book) => (
        <BookCard
          key={book.title}
          book={book}
          onMarkRead={handleMarkRead}
          onSkip={handleSkip}
          onRequest={handleRequest}
          onWatchToggle={handleWatchToggle}
        />
      ))}
    </div>
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const Pagination = () =>
    totalPages > 1 ? (
      <div className="flex items-center justify-center gap-2 mt-6">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 text-sm rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Prev
        </button>
        <span className="text-sm text-slate-500">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page === totalPages - 1}
          className="px-3 py-1.5 text-sm rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    ) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Picture Books</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowWatchPanel((v) => !v)}
            className="text-sm text-slate-500 hover:text-amber-600 transition-colors flex items-center gap-1"
          >
            ★ Watched Authors{uniqueWatched.length > 0 ? ` (${uniqueWatched.length})` : ""}
          </button>
          <span className="text-sm text-slate-500">{filtered.length} books</span>
        </div>
      </div>

      {/* Watched authors panel */}
      {showWatchPanel ? (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h2 className="text-sm font-semibold text-amber-800 mb-2">
            Watched Authors — topup prioritizes their unread books
          </h2>
          {uniqueWatched.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {uniqueWatched.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 bg-white border border-amber-200 text-amber-800 text-sm px-2 py-1 rounded-full"
                >
                  {a}
                  <button
                    onClick={() => handleWatchToggle(a, false)}
                    className="text-amber-400 hover:text-amber-700 ml-0.5"
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-700 mb-3">
              No watched authors yet. Click the ★ next to any author, or add one below.
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Author name…"
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddWatch(); }}
              className="px-3 py-1.5 text-sm border border-amber-200 rounded-lg flex-1 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
            />
            <button
              onClick={handleAddWatch}
              className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={tabCls(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={awardFilter}
          onChange={(e) => setAwardFilter(e.target.value as AwardFilter)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
        >
          <option value="all">All Awards</option>
          <option value="medal">Medal Only</option>
          <option value="honor">Honor Only</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
        >
          <option value="tier">Sort: Award Tier</option>
          <option value="year">Sort: Year</option>
          <option value="title">Sort: Title</option>
          <option value="series">Sort: Series</option>
        </select>
        <input
          type="text"
          placeholder="Search title or author…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
      </div>

      {loading ? (
        <div className="text-slate-500 text-center py-12">Loading books…</div>
      ) : null}
      {error !== null ? (
        <div className="text-red-600 text-center py-12">{error}</div>
      ) : null}
      {!loading && filtered.length === 0 ? (
        <div className="text-slate-500 text-center py-12">
          No books match the current filter.
        </div>
      ) : null}

      {/* Series grouped view — no pagination (series are naturally small groups) */}
      {sort === "series" && seriesGroups !== null ? (
        <div className="space-y-8">
          {seriesGroups.groups.map(([seriesName, items]) => (
            <div key={seriesName}>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-100 pb-1">
                {seriesName} ({items.length})
              </h2>
              {renderGrid(items)}
            </div>
          ))}
          {seriesGroups.standalone.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-100 pb-1">
                Standalone ({seriesGroups.standalone.length})
              </h2>
              {renderGrid(seriesGroups.standalone)}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {renderGrid(paginated)}
          <Pagination />
        </>
      )}
    </div>
  );
}
