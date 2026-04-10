"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Holds" },
  { href: "/books", label: "Books" },
  { href: "/search", label: "Search" },
  { href: "/log", label: "Log" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="bg-white border-b border-slate-200 px-4">
      <div className="max-w-6xl mx-auto flex items-center gap-1 h-14">
        <span className="font-semibold text-slate-800 mr-4">Library Hold</span>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname === l.href
                ? "bg-slate-100 text-slate-900"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
