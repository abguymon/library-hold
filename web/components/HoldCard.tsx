"use client";
import { useState, useEffect } from "react";
import type { HoldItem } from "@/lib/api";

interface Props {
  hold: HoldItem;
  onCancel: () => void;
  onToggleFreeze: () => void;
}

export function HoldCard({ hold, onCancel, onToggleFreeze }: Props) {
  const [coverUrl, setCoverUrl] = useState<string | null>(hold.coverUrl ?? null);

  useEffect(() => {
    if (hold.coverUrl !== undefined) return;
    fetch(`/api/covers?title=${encodeURIComponent(hold.title)}`)
      .then((r) => r.json())
      .then((d: { url: string | null }) => setCoverUrl(d.url))
      .catch(() => {});
  }, [hold.title, hold.coverUrl]);

  const isReady = hold.status === 1;
  const queueInfo =
    hold.priority != null && hold.priorityQueueLength != null
      ? `#${hold.priority} of ${hold.priorityQueueLength}`
      : hold.priority != null
        ? `#${hold.priority} in queue`
        : null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
      {/* Cover */}
      <div className="aspect-[2/3] bg-slate-100 relative">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={hold.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs text-center p-2">
            {hold.title}
          </div>
        )}
        {isReady ? (
          <div className="absolute top-2 left-2 bg-green-500 text-white text-xs font-semibold px-2 py-0.5 rounded">
            Ready!
          </div>
        ) : null}
        {hold.frozen ? (
          <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-semibold px-2 py-0.5 rounded">
            Frozen
          </div>
        ) : null}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <h3 className="text-sm font-medium text-slate-800 line-clamp-2">
          {hold.title}
        </h3>
        {!isReady && queueInfo ? (
          <p className="text-xs text-slate-500">{queueInfo}</p>
        ) : null}
        {hold.materialType ? (
          <p className="text-xs text-slate-400">{hold.materialType}</p>
        ) : null}

        {/* Actions */}
        <div className="flex gap-2 mt-auto pt-1">
          <button
            onClick={onToggleFreeze}
            className="flex-1 text-xs px-2 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {hold.frozen ? "Unfreeze" : "Freeze"}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 text-xs px-2 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
