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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditBarcode(item.barcode);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    const barcode = editBarcode.trim();
    if (!name || !barcode) {
      setError("Name and barcode are both required.");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, barcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update item");
        return;
      }
      setItems((prev) => prev.map((item) => (item.id === id ? data.item : item)));
      setEditingId(null);
      setError(null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(item: Item) {
    const confirmed = window.confirm(
      `Delete "${item.name}"? This also permanently removes its transaction history. This cannot be undone.`
    );
    if (!confirmed) return;
    setDeletingId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to delete item");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">
          Overview
          {!loading && (
            <span className="ml-3 align-middle text-base font-medium text-black/50 sm:text-lg">
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

      <div className="mb-6 flex flex-col flex-wrap gap-4 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="Search by name or barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-black/20 bg-white px-4 py-3 text-lg outline-none focus:border-black/60 sm:w-80"
        />
        <label className="flex items-center gap-2 text-lg font-medium">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="h-5 w-5 shrink-0"
          />
          Show only low-stock items
        </label>
        <label className="flex flex-col gap-1 text-lg font-medium sm:ml-auto sm:flex-row sm:items-center sm:gap-3">
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

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full min-w-[640px] text-left text-base sm:text-lg">
          <thead>
            <tr className="border-b border-black/10 bg-black/5 text-sm uppercase tracking-wide text-black/60 sm:text-base">
              <th className="px-3 py-3 font-semibold sm:px-6 sm:py-4">#</th>
              <th className="px-3 py-3 font-semibold sm:px-6 sm:py-4">Name</th>
              <th className="px-3 py-3 font-semibold sm:px-6 sm:py-4">Barcode</th>
              <th className="px-3 py-3 font-semibold sm:px-6 sm:py-4">Quantity</th>
              <th className="px-3 py-3 font-semibold sm:px-6 sm:py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-black/50 sm:px-6">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-black/50 sm:px-6">
                  No items found.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((item, index) => {
                const lowStock = item.quantity < threshold;
                const isEditing = editingId === item.id;
                const isDeleting = deletingId === item.id;
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-black/5 last:border-0 ${
                      lowStock && !isEditing ? "bg-red-50" : ""
                    }`}
                  >
                    <td className="px-3 py-3 text-black/50 sm:px-6 sm:py-4">{index + 1}</td>
                    {isEditing ? (
                      <>
                        <td className="px-3 py-3 sm:px-6 sm:py-4">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(item.id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            disabled={savingEdit}
                            autoFocus
                            className="w-full min-w-[120px] rounded-lg border border-black/30 px-3 py-1.5 text-base outline-none focus:border-black/60 disabled:opacity-50 sm:text-lg"
                          />
                        </td>
                        <td className="px-3 py-3 sm:px-6 sm:py-4">
                          <input
                            value={editBarcode}
                            onChange={(e) => setEditBarcode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(item.id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            disabled={savingEdit}
                            className="w-full min-w-[120px] rounded-lg border border-black/30 px-3 py-1.5 text-base outline-none focus:border-black/60 disabled:opacity-50 sm:text-lg"
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3 font-medium sm:px-6 sm:py-4">{item.name}</td>
                        <td className="px-3 py-3 text-black/70 sm:px-6 sm:py-4">{item.barcode}</td>
                      </>
                    )}
                    <td className={`px-3 py-3 font-semibold sm:px-6 sm:py-4 ${lowStock ? "text-red-700" : ""}`}>
                      {item.quantity}
                    </td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(item.id)}
                            disabled={savingEdit}
                            className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {savingEdit ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={savingEdit}
                            className="rounded-lg border border-black/20 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <button
                            onClick={() => startEdit(item)}
                            disabled={isDeleting}
                            className="text-sm font-medium text-black/60 hover:text-black disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            disabled={isDeleting}
                            className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      )}
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
