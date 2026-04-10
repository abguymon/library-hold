"use client";
import { useState, useEffect, useCallback } from "react";
import { HoldCard } from "@/components/HoldCard";
import { apiFetch, type HoldsResponse, type TopupResponse } from "@/lib/api";

export default function HomePage() {
  const [data, setData] = useState<HoldsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toppingUp, setToppingUp] = useState(false);
  const [topupMsg, setTopupMsg] = useState<string | null>(null);

  const loadHolds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<HoldsResponse>("/api/holds");
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHolds();
  }, [loadHolds]);

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this hold?")) return;
    try {
      await apiFetch(`/api/holds/${id}`, { method: "DELETE" });
      await loadHolds();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to cancel hold");
    }
  };

  const handleToggleFreeze = async (id: string, frozen: boolean) => {
    try {
      await apiFetch(`/api/holds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frozen: !frozen }),
      });
      await loadHolds();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update hold");
    }
  };

  const handleTopup = async () => {
    setToppingUp(true);
    setTopupMsg(null);
    try {
      const result = await apiFetch<TopupResponse>("/api/topup", {
        method: "POST",
      });
      setTopupMsg(result.message);
      await loadHolds();
    } catch (e) {
      setTopupMsg(e instanceof Error ? e.message : "Top up failed");
    } finally {
      setToppingUp(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800">My Holds</h1>
          {data !== null ? (
            <span className="text-sm bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
              {data.total}/{data.limit}
              {data.pictureBookCount > 0 ? (
                <span className="ml-1 text-amber-600">
                  · {data.pictureBookCount} picture books
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        <button
          onClick={handleTopup}
          disabled={toppingUp}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {toppingUp ? "Topping up…" : "Top Up Picture Books"}
        </button>
      </div>

      {topupMsg !== null ? (
        <div className="mb-4 p-3 bg-blue-50 text-blue-800 rounded-lg text-sm">
          {topupMsg}
        </div>
      ) : null}

      {loading ? (
        <div className="text-slate-500 text-center py-12">Loading holds…</div>
      ) : null}
      {error !== null ? (
        <div className="text-red-600 text-center py-12">{error}</div>
      ) : null}

      {!loading && data !== null && data.holds.length === 0 ? (
        <div className="text-slate-500 text-center py-12">
          No holds. Use Search to find books.
        </div>
      ) : null}

      {data !== null && data.holds.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {data.holds.map((hold) => (
            <HoldCard
              key={hold.id ?? hold.title}
              hold={hold}
              onCancel={() => {
                if (hold.id) handleCancel(hold.id);
              }}
              onToggleFreeze={() => {
                if (hold.id) handleToggleFreeze(hold.id, hold.frozen);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
