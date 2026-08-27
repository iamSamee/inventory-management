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
    <nav className="flex h-16 items-center justify-between border-b border-black/10 bg-white px-8">
      <div className="flex items-center gap-8">
        <span className="text-lg font-bold">Inventory</span>
        <div className="flex gap-2">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-4 py-2 text-base font-medium transition-colors ${
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
        className="rounded-lg border border-black/20 px-4 py-2 text-base font-medium text-black/70 transition-colors hover:bg-black/5"
      >
        Log out
      </button>
    </nav>
  );
}
