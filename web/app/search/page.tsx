"use client";
import { useState } from "react";
import { apiFetch, type SearchItem, type SearchResponse } from "@/lib/api";

const FORMAT_OPTIONS = [
  { value: "", label: "All Formats" },
  { value: "book", label: "Book" },
  { value: "dvd", label: "DVD" },
  { value: "bluray", label: "Blu-ray" },
  { value: "game", label: "Game" },
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdsCount, setHoldsCount] = useState<number | null>(null);
  const [holdsLimit, setHoldsLimit] = useState(15);
  const [placing, setPlacing] = useState<Set<string>>(new Set());
  const [placed, setPlaced] = useState<Set<string>>(new Set());

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setPlaced(new Set());
    try {
      const params = new URLSearchParams({ q: query });
      if (format) params.set("format", format);
      const data = await apiFetch<SearchResponse>(`/api/search?${params.toString()}`);
      setResults(data.results);
      setHoldsCount(data.holdsCount);
      setHoldsLimit(data.holdsLimit);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceHold = async (item: SearchItem) => {
    setPlacing((prev) => new Set(prev).add(item.id));
    try {
      await apiFetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formatGroupId: item.id, title: item.title }),
      });
      setPlaced((prev) => new Set(prev).add(item.id));
      setHoldsCount((prev) => (prev !== null ? prev + 1 : null));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to place hold");
    } finally {
      setPlacing((prev) => {
        const s = new Set(prev);
        s.delete(item.id);
        return s;
      });
    }
  };

  const atLimit = holdsCount !== null && holdsCount >= holdsLimit;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Search Catalog</h1>

      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, author, keyword…"
          className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
        >
          {FORMAT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {holdsCount !== null ? (
        <div
          className={`mb-4 text-sm ${atLimit ? "text-red-600 font-medium" : "text-slate-500"}`}
        >
          Holds: {holdsCount}/{holdsLimit}
          {atLimit ? " — Hold limit reached" : ""}
        </div>
      ) : null}

      {error !== null ? <div className="text-red-600 mb-4">{error}</div> : null}

      {results.length > 0 ? (
        <div className="space-y-3">
          {results.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200 rounded-lg p-4 flex items-start gap-4"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-slate-800">{item.title}</h3>
                {item.author ? (
                  <p className="text-sm text-slate-500 mt-0.5">{item.author}</p>
                ) : null}
                <div className="flex gap-3 mt-1 text-xs text-slate-400">
                  {item.year ? <span>{item.year}</span> : null}
                  {item.materialType ? <span>{item.materialType}</span> : null}
                  {item.availability ? <span>{item.availability}</span> : null}
                </div>
              </div>
              <button
                onClick={() => handlePlaceHold(item)}
                disabled={placing.has(item.id) || placed.has(item.id) || atLimit}
                title={atLimit ? "Hold limit reached" : undefined}
                className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  placed.has(item.id)
                    ? "bg-green-100 text-green-700 cursor-default"
                    : atLimit
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
                }`}
              >
                {placed.has(item.id)
                  ? "Placed"
                  : placing.has(item.id)
                    ? "Placing…"
                    : "Place Hold"}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && results.length === 0 && query && error === null ? (
        <div className="text-slate-500 text-center py-12">No results found.</div>
      ) : null}
    </div>
  );
}
