"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  name: string;
  barcode: string;
  quantity: number;
};

export default function OverviewPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [threshold, setThreshold] = useState(0);
  const [thresholdInput, setThresholdInput] = useState("0");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingThreshold, setSavingThreshold] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [itemsRes, settingsRes] = await Promise.all([
          fetch("/api/items"),
          fetch("/api/settings"),
        ]);
        const itemsData = await itemsRes.json();
        const settingsData = await settingsRes.json();
        if (!itemsRes.ok) {
          setError(itemsData.error ?? "Failed to load items");
          return;
        }
        if (!settingsRes.ok) {
          setError(settingsData.error ?? "Failed to load settings");
          return;
        }
        setItems(itemsData.items);
        setThreshold(settingsData.settings.lowStockThreshold);
        setThresholdInput(String(settingsData.settings.lowStockThreshold));
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !q || item.name.toLowerCase().includes(q) || item.barcode.toLowerCase().includes(q);
      const matchesLowStock = !lowStockOnly || item.quantity < threshold;
      return matchesSearch && matchesLowStock;
    });
  }, [items, search, lowStockOnly, threshold]);

  async function saveThreshold() {
    const value = Number(thresholdInput);
    if (!Number.isInteger(value) || value < 0) {
      setThresholdInput(String(threshold));
      return;
    }
    if (value === threshold) return;
    setSavingThreshold(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lowStockThreshold: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update threshold");
        setThresholdInput(String(threshold));
        return;
      }
      setThreshold(data.settings.lowStockThreshold);
      setThresholdInput(String(data.settings.lowStockThreshold));
    } catch {
      setError("Network error. Please try again.");
      setThresholdInput(String(threshold));
    } finally {
      setSavingThreshold(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          Overview
          {!loading && (
            <span className="ml-3 align-middle text-lg font-medium text-black/50">
              ({filtered.length} {filtered.length === 1 ? "item" : "items"})
            </span>
          )}
        </h1>
        <a
          href="/api/export/csv"
          className="rounded-lg border border-black/20 bg-white px-5 py-2.5 text-base font-medium hover:bg-black/5"
        >
          Export to CSV
        </a>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <input
          type="text"
          placeholder="Search by name or barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-80 rounded-lg border border-black/20 bg-white px-4 py-3 text-lg outline-none focus:border-black/60"
        />
        <label className="flex items-center gap-2 text-lg font-medium">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="h-5 w-5"
          />
          Show only low-stock items
        </label>
        <label className="ml-auto flex items-center gap-3 text-lg font-medium">
          Low-stock threshold (applies to all items)
          <input
            type="number"
            min={0}
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            onBlur={saveThreshold}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            disabled={savingThreshold}
            className="w-24 rounded-lg border border-black/20 bg-white px-3 py-2 text-lg outline-none focus:border-black/60 disabled:opacity-50"
          />
        </label>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-base font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
        <table className="w-full text-left text-lg">
          <thead>
            <tr className="border-b border-black/10 bg-black/5 text-base uppercase tracking-wide text-black/60">
              <th className="px-6 py-4 font-semibold">#</th>
              <th className="px-6 py-4 font-semibold">Name</th>
              <th className="px-6 py-4 font-semibold">Barcode</th>
              <th className="px-6 py-4 font-semibold">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-black/50">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-black/50">
                  No items found.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((item, index) => {
                const lowStock = item.quantity < threshold;
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-black/5 last:border-0 ${
                      lowStock ? "bg-red-50" : ""
                    }`}
                  >
                    <td className="px-6 py-4 text-black/50">{index + 1}</td>
                    <td className="px-6 py-4 font-medium">{item.name}</td>
                    <td className="px-6 py-4 text-black/70">{item.barcode}</td>
                    <td className={`px-6 py-4 font-semibold ${lowStock ? "text-red-700" : ""}`}>
                      {item.quantity}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
