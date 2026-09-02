"use client";

import { useEffect, useRef, useState, FormEvent, KeyboardEvent } from "react";

type CartLine = {
  key: string;
  itemId: string;
  name: string;
  barcode: string;
  qty: number;
  // Distinguishes "still at the default 1 from a scan" (shows blank in the
  // qty field) from "user explicitly typed 1" (shows "1"). Scan-driven
  // increments (bumpToFront) never touch this.
  qtyEdited: boolean;
  maxQty: number;
};

type Suggestion = {
  id: string;
  name: string;
  barcode: string;
  quantity: number;
};

type LastSession = {
  transactionIds: string[];
  summary: string;
};

function bumpToFront<T extends { key: string; qty: number }>(
  prev: T[],
  key: string,
  deltaQty: number
): T[] {
  const idx = prev.findIndex((line) => line.key === key);
  if (idx === -1) return prev;
  const updated = { ...prev[idx], qty: prev[idx].qty + deltaQty };
  const rest = prev.filter((_, i) => i !== idx);
  return [updated, ...rest];
}

export default function InventoryOutPage() {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [message, setMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [lastSession, setLastSession] = useState<LastSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const seq = ++requestSeq.current;
    const timer = setTimeout(
      async () => {
        if (!trimmed) {
          if (seq === requestSeq.current) {
            setSuggestions([]);
            setHighlightedIndex(-1);
          }
          return;
        }
        try {
          const res = await fetch(`/api/items?search=${encodeURIComponent(trimmed)}`);
          const data = await res.json();
          if (seq !== requestSeq.current) return;
          setSuggestions(res.ok ? data.items.slice(0, 6) : []);
          setHighlightedIndex(-1);
        } catch {
          if (seq === requestSeq.current) setSuggestions([]);
        }
      },
      trimmed ? 200 : 0
    );
    return () => clearTimeout(timer);
  }, [query]);

  const totalQty = cart.reduce((sum, line) => sum + line.qty, 0);

  function selectSuggestion(item: Suggestion) {
    const existing = cart.find((line) => line.itemId === item.id);
    if (existing) {
      if (existing.qty + 1 > existing.maxQty) {
        setMessage({
          text: `Only ${existing.maxQty} ${existing.name} in stock — already have ${existing.qty} in the list.`,
          kind: "error",
        });
      } else {
        setCart((prev) => bumpToFront(prev, existing.key, 1));
      }
    } else if (item.quantity <= 0) {
      setMessage({ text: `${item.name} is already at 0 stock.`, kind: "error" });
    } else {
      setCart((prev) => [
        { key: item.id, itemId: item.id, name: item.name, barcode: item.barcode, qty: 1, qtyEdited: false, maxQty: item.quantity },
        ...prev,
      ]);
    }
    setQuery("");
    setSuggestions([]);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  }

  function handleScanKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setHighlightedIndex(-1);
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlightedIndex]);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = query.trim();
    if (!value || busy) return;

    const cartMatch = cart.find(
      (line) => line.barcode === value || line.name.toLowerCase() === value.toLowerCase()
    );
    if (cartMatch) {
      if (cartMatch.qty + 1 > cartMatch.maxQty) {
        setMessage({
          text: `Only ${cartMatch.maxQty} ${cartMatch.name} in stock — already have ${cartMatch.qty} in the list.`,
          kind: "error",
        });
        setQuery("");
        inputRef.current?.focus();
        return;
      }
      setCart((prev) => bumpToFront(prev, cartMatch.key, 1));
      setQuery("");
      inputRef.current?.focus();
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/items/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "Lookup failed", kind: "error" });
        return;
      }
      if (!data.item) {
        setMessage({ text: "Item not found.", kind: "error" });
        return;
      }
      if (data.item.quantity <= 0) {
        setMessage({ text: `${data.item.name} is already at 0 stock.`, kind: "error" });
        return;
      }
      setCart((prev) => [
        {
          key: data.item.id,
          itemId: data.item.id,
          name: data.item.name,
          barcode: data.item.barcode,
          qty: 1,
          qtyEdited: false,
          maxQty: data.item.quantity,
        },
        ...prev,
      ]);
      setQuery("");
    } catch {
      setMessage({ text: "Network error. Please try again.", kind: "error" });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function updateQty(key: string, value: string) {
    // Allow the field to go through an empty/0 state while the user is
    // actively editing it (e.g. selecting "1" and typing "5") — clamped
    // back to a minimum of 1 (and the max available) on blur, not on
    // every keystroke. Any keystroke here marks the line as manually
    // edited, so an explicitly typed "1" still displays as "1" instead of
    // the blank-for-default-1 treatment.
    if (value === "") {
      setCart((prev) =>
        prev.map((line) => (line.key === key ? { ...line, qty: 0, qtyEdited: true } : line))
      );
      return;
    }
    const qty = Number(value);
    if (!Number.isInteger(qty) || qty < 0) return;
    setCart((prev) =>
      prev.map((line) =>
        line.key === key ? { ...line, qty: Math.min(qty, line.maxQty), qtyEdited: true } : line
      )
    );
  }

  function normalizeQty(key: string) {
    setCart((prev) =>
      prev.map((line) =>
        line.key === key && line.qty < 1 ? { ...line, qty: 1, qtyEdited: false } : line
      )
    );
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((line) => line.key !== key));
  }

  async function handleComplete() {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const lines = cart.map((line) => ({ itemId: line.itemId, qty: Math.max(1, line.qty) }));
      const res = await fetch("/api/transactions/out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "Failed to complete transaction", kind: "error" });
        return;
      }
      const products = cart.length;
      setMessage({
        text: `Dispatched ${totalQty} item${totalQty === 1 ? "" : "s"} across ${products} product${products === 1 ? "" : "s"}.`,
        kind: "success",
      });
      setLastSession({
        transactionIds: data.results.map((r: { transaction: { id: string } }) => r.transaction.id),
        summary: `${products} product${products === 1 ? "" : "s"} (${totalQty} item${totalQty === 1 ? "" : "s"})`,
      });
      setCart([]);
      setQuery("");
    } catch {
      setMessage({ text: "Network error. Please try again.", kind: "error" });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function handleUndoSession() {
    if (!lastSession || busy) return;
    setBusy(true);
    try {
      let failed = 0;
      for (const id of lastSession.transactionIds) {
        const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
        if (!res.ok) failed++;
      }
      if (failed === 0) {
        setMessage({ text: `Undone: last session (${lastSession.summary}) reversed.`, kind: "success" });
      } else {
        setMessage({
          text: `Undone, but ${failed} item(s) could not be reversed (stock already changed).`,
          kind: "error",
        });
      }
      setLastSession(null);
    } catch {
      setMessage({ text: "Network error while undoing.", kind: "error" });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Inventory Out</h1>
        <button
          onClick={handleUndoSession}
          disabled={!lastSession || busy}
          className="rounded-lg border border-black/20 px-3 py-1.5 text-sm font-medium disabled:opacity-40 sm:px-4 sm:py-2 sm:text-base"
        >
          Undo last session {lastSession ? `(${lastSession.summary})` : ""}
        </button>
      </div>

      {message && (
        <p
          className={`mb-6 rounded-lg px-4 py-3 text-lg font-semibold ${
            message.kind === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      <form onSubmit={handleSubmit} className="relative mb-6 rounded-xl border border-black/10 bg-white p-4 sm:p-8">
        <label htmlFor="scan" className="mb-2 block text-base font-medium text-black/70 sm:text-lg">
          Scan barcode or type product name
        </label>
        <input
          id="scan"
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleScanKeyDown}
          disabled={busy}
          className="w-full rounded-lg border border-black/20 px-4 py-3 text-xl outline-none focus:border-black/60 disabled:opacity-50 sm:px-5 sm:py-4 sm:text-2xl"
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <ul className="absolute inset-x-4 top-[calc(100%-1rem)] z-10 overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg sm:inset-x-8">
            {suggestions.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSuggestion(item);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left text-base sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:px-5 sm:text-lg ${
                    index === highlightedIndex ? "bg-black/5" : ""
                  }`}
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-sm text-black/50 sm:text-base">
                    {item.barcode} &middot; {item.quantity} in stock
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="rounded-xl border border-black/10 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 px-4 py-4 sm:px-6">
          <h2 className="text-lg font-bold sm:text-xl">
            Current session {cart.length > 0 && <span className="text-black/50">({cart.length} product{cart.length === 1 ? "" : "s"}, {totalQty} item{totalQty === 1 ? "" : "s"})</span>}
          </h2>
        </div>

        {cart.length === 0 ? (
          <p className="px-4 py-8 text-center text-black/50 sm:px-6">
            Scan items to add them here, then complete the transaction.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-base sm:text-lg">
              <thead>
                <tr className="border-b border-black/10 text-sm uppercase tracking-wide text-black/60 sm:text-base">
                  <th className="px-4 py-3 font-semibold sm:px-6">Name</th>
                  <th className="px-4 py-3 font-semibold sm:px-6">Barcode</th>
                  <th className="px-4 py-3 font-semibold sm:px-6">Qty</th>
                  <th className="px-4 py-3 font-semibold sm:px-6"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((line) => (
                  <tr key={line.key} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-3 font-medium sm:px-6">{line.name}</td>
                    <td className="px-4 py-3 text-black/70 sm:px-6">{line.barcode}</td>
                    <td className="px-4 py-3 sm:px-6">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={line.maxQty}
                          value={line.qty === 0 || (line.qty === 1 && !line.qtyEdited) ? "" : line.qty}
                          onChange={(e) => updateQty(line.key, e.target.value)}
                          onBlur={() => normalizeQty(line.key)}
                          disabled={busy}
                          className="w-20 rounded-lg border border-black/20 px-3 py-1.5 text-lg outline-none focus:border-black/60"
                        />
                        <span className="text-sm text-black/40">/ {line.maxQty} available</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right sm:px-6">
                      <button
                        onClick={() => removeLine(line.key)}
                        disabled={busy}
                        className="text-black/40 hover:text-red-600"
                        title="Remove"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-black/10 px-4 py-4 sm:flex-row sm:px-6">
          <button
            onClick={handleComplete}
            disabled={cart.length === 0 || busy}
            className="w-full rounded-lg bg-black px-6 py-3 text-lg font-semibold text-white disabled:opacity-40 sm:w-auto"
          >
            Done &mdash; complete transaction
          </button>
          <button
            onClick={() => setCart([])}
            disabled={cart.length === 0 || busy}
            className="w-full rounded-lg border border-black/20 px-6 py-3 text-lg font-medium disabled:opacity-40 sm:w-auto"
          >
            Clear list
          </button>
        </div>
      </div>
    </div>
  );
}
