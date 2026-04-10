"use client";
import { useState, useEffect } from "react";
import { StarRating } from "@/components/StarRating";
import type { BookItem } from "@/lib/api";

interface Props {
  book: BookItem;
  onMarkRead: (title: string, rating?: number) => void;
  onSkip: (title: string) => void;
  onRequest: (title: string) => void;
  onWatchToggle?: (author: string, watched: boolean) => void;
}

export function BookCard({ book, onMarkRead, onSkip, onRequest, onWatchToggle }: Props) {
  const [coverUrl, setCoverUrl] = useState<string | null>(book.coverUrl ?? null);

  useEffect(() => {
    if (book.coverUrl !== undefined) return;
    const params = new URLSearchParams({ title: book.title, author: book.author });
    fetch(`/api/covers?${params.toString()}`)
      .then((r) => r.json())
      .then((d: { url: string | null }) => setCoverUrl(d.url))
      .catch(() => {});
  }, [book.title, book.author, book.coverUrl]);

  const isMedal = book.lists.includes("caldecott_medal");
  const isHonor = book.lists.includes("caldecott_honor");

  return (
    <div
      className={`bg-white rounded-lg overflow-hidden flex flex-col border ${
        book.skip ? "opacity-50 border-slate-100" : book.read ? "border-green-200" : "border-slate-200"
      }`}
    >
      {/* Cover */}
      <div className="aspect-[2/3] bg-slate-100 relative">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs text-center p-2">
            {book.title}
          </div>
        )}
        {isMedal ? (
          <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded">
            Medal
          </div>
        ) : isHonor ? (
          <div className="absolute top-2 left-2 bg-amber-200 text-amber-800 text-xs font-bold px-1.5 py-0.5 rounded">
            Honor
          </div>
        ) : null}
        {book.read ? (
          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded">
            Read
          </div>
        ) : null}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <h3 className="text-sm font-medium text-slate-800 line-clamp-2">
          {book.title}
        </h3>
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <span className="truncate">{book.author} · {book.year}</span>
          {onWatchToggle ? (
            <button
              onClick={() => onWatchToggle(book.author, !book.watchedAuthor)}
              title={book.watchedAuthor ? "Unwatch author" : "Watch author"}
              className={`shrink-0 text-xs transition-colors ${
                book.watchedAuthor ? "text-amber-500 hover:text-slate-400" : "text-slate-300 hover:text-amber-400"
              }`}
            >
              ★
            </button>
          ) : null}
        </p>
        {book.series ? (
          <p className="text-xs text-slate-400 italic">
            {book.series}
            {book.seriesOrder !== null ? ` #${book.seriesOrder}` : ""}
          </p>
        ) : null}
        <StarRating
          value={book.rating}
          onChange={(r) => onMarkRead(book.title, r)}
          readonly={!book.read}
        />

        {/* Actions */}
        <div className="flex gap-1.5 mt-auto pt-1">
          {!book.read && !book.skip ? (
            <button
              onClick={() => onMarkRead(book.title)}
              className="flex-1 text-xs px-2 py-1.5 rounded bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
            >
              Mark Read
            </button>
          ) : null}
          {book.read ? (
            <button
              onClick={() => onRequest(book.title)}
              className="flex-1 text-xs px-2 py-1.5 rounded bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              Request Again
            </button>
          ) : null}
          {!book.skip ? (
            <button
              onClick={() => onSkip(book.title)}
              className="text-xs px-2 py-1.5 rounded border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Skip
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
