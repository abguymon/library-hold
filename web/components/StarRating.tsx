"use client";

interface Props {
  value: number | null;
  onChange?: (rating: number) => void;
  readonly?: boolean;
}

export function StarRating({ value, onChange, readonly = false }: Props) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          className={`text-lg leading-none transition-transform ${
            readonly ? "cursor-default" : "cursor-pointer hover:scale-110"
          } ${value !== null && star <= value ? "text-amber-400" : "text-slate-300"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
