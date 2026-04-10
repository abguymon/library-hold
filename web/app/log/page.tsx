"use client";
import { useState, useEffect, useMemo } from "react";
import { apiFetch, type BookItem } from "@/lib/api";
import { StarRating } from "@/components/StarRating";

interface LogEntry {
  date: string;
  title: string;
  author: string;
  year: number;
  rating: number | null;
  lists: string[];
}

function formatMonthYear(dateStr: string): string {
  const [year, month] = dateStr.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
}

export default function LogPage() {
  const [books, setBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<BookItem[]>("/api/books")
      .then(setBooks)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, []);

  const entries = useMemo<LogEntry[]>(() => {
    const result: LogEntry[] = [];
    for (const book of books) {
      for (const date of book.readDates) {
        result.push({
          date,
          title: book.title,
          author: book.author,
          year: book.year,
          rating: book.rating,
          lists: book.lists,
        });
      }
    }
    return result.sort((a, b) => b.date.localeCompare(a.date));
  }, [books]);

  const grouped = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    for (const entry of entries) {
      const key = entry.date.slice(0, 7); // YYYY-MM
      const group = map.get(key) ?? [];
      group.push(entry);
      map.set(key, group);
    }
    return [...map.entries()];
  }, [entries]);

  const totalRead = useMemo(
    () => new Set(books.filter((b) => b.read).map((b) => b.title)).size,
    [books],
  );

  if (loading) {
    return (
      <div className="text-slate-500 text-center py-12">Loading log…</div>
    );
  }
  if (error !== null) {
    return <div className="text-red-600 text-center py-12">{error}</div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Reading Log</h1>
        <span className="text-sm text-slate-500">
          {totalRead} book{totalRead !== 1 ? "s" : ""} read · {entries.length} session{entries.length !== 1 ? "s" : ""}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="text-slate-500 text-center py-12">
          No books marked as read yet. Use the Books page or{" "}
          <code className="bg-slate-100 px-1 rounded">library-hold read</code>{" "}
          to record reads.
        </div>
      ) : null}

      <div className="space-y-8">
        {grouped.map(([monthKey, monthEntries]) => (
          <div key={monthKey}>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
              {formatMonthYear(monthKey)}
            </h2>
            <div className="space-y-2">
              {monthEntries.map((entry, i) => {
                const isMedal = entry.lists.includes("caldecott_medal");
                const isHonor = entry.lists.includes("caldecott_honor");
                return (
                  <div
                    key={`${entry.title}-${entry.date}-${i}`}
                    className="flex items-center gap-3 py-2 border-b border-slate-100"
                  >
                    <span className="text-xs text-slate-400 w-16 shrink-0 tabular-nums">
                      {entry.date.slice(5).replace("-", "/")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-800">
                        {entry.title}
                      </span>
                      <span className="text-xs text-slate-500 ml-1.5">
                        — {entry.author}
                      </span>
                    </div>
                    {isMedal ? (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded shrink-0">
                        Medal
                      </span>
                    ) : isHonor ? (
                      <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded shrink-0">
                        Honor
                      </span>
                    ) : null}
                    <div className="shrink-0">
                      <StarRating value={entry.rating} readonly />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
