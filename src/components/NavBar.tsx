"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/overview", label: "Overview" },
  { href: "/in", label: "Inventory In" },
  { href: "/out", label: "Inventory Out" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-y-2 border-b border-black/10 bg-white px-4 py-3 sm:h-16 sm:px-8 sm:py-0">
      <div className="flex flex-wrap items-center gap-3 sm:gap-8">
        <span className="text-lg font-bold">Inventory</span>
        <div className="flex flex-wrap gap-1 sm:gap-2">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:px-4 sm:py-2 sm:text-base ${
                  active
                    ? "bg-black text-white"
                    : "text-black/70 hover:bg-black/5"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="rounded-lg border border-black/20 px-3 py-1.5 text-sm font-medium text-black/70 transition-colors hover:bg-black/5 sm:px-4 sm:py-2 sm:text-base"
      >
        Log out
      </button>
    </nav>
  );
}
