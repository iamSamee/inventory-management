"use client";

import { useEffect, useRef, useState, FormEvent, KeyboardEvent } from "react";

type CartLine = {
  key: string;
  itemId: string;
  name: string;
  barcode: string;
  qty: number;
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
        setCart((prev) =>
          prev.map((line) => (line.itemId === item.id ? { ...line, qty: line.qty + 1 } : line))
        );
      }
    } else if (item.quantity <= 0) {
      setMessage({ text: `${item.name} is already at 0 stock.`, kind: "error" });
    } else {
      setCart((prev) => [
        ...prev,
        { key: item.id, itemId: item.id, name: item.name, barcode: item.barcode, qty: 1, maxQty: item.quantity },
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
      setCart((prev) =>
        prev.map((line) => (line.key === cartMatch.key ? { ...line, qty: line.qty + 1 } : line))
      );
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
        ...prev,
        {
          key: data.item.id,
          itemId: data.item.id,
          name: data.item.name,
          barcode: data.item.barcode,
          qty: 1,
          maxQty: data.item.quantity,
        },
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
    const qty = Number(value);
    setCart((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        if (!Number.isInteger(qty) || qty <= 0) return line;
        return { ...line, qty: Math.min(qty, line.maxQty) };
      })
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
      const lines = cart.map((line) => ({ itemId: line.itemId, qty: line.qty }));
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Inventory Out</h1>
        <button
          onClick={handleUndoSession}
          disabled={!lastSession || busy}
          className="rounded-lg border border-black/20 px-4 py-2 text-base font-medium disabled:opacity-40"
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

      <form onSubmit={handleSubmit} className="relative mb-6 rounded-xl border border-black/10 bg-white p-8">
        <label htmlFor="scan" className="mb-2 block text-lg font-medium text-black/70">
          Scan barcode or type product name
        </label>
        <input
          id="scan"
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleScanKeyDown}
          disabled={busy}
          className="w-full rounded-lg border border-black/20 px-5 py-4 text-2xl outline-none focus:border-black/60 disabled:opacity-50"
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <ul className="absolute inset-x-8 top-[calc(100%-1rem)] z-10 overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg">
            {suggestions.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSuggestion(item);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex w-full items-center justify-between px-5 py-3 text-left text-lg ${
                    index === highlightedIndex ? "bg-black/5" : ""
                  }`}
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-black/50">
                    {item.barcode} &middot; {item.quantity} in stock
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="rounded-xl border border-black/10 bg-white">
        <div className="flex items-center justify-between border-b border-black/10 px-6 py-4">
          <h2 className="text-xl font-bold">
            Current session {cart.length > 0 && <span className="text-black/50">({cart.length} product{cart.length === 1 ? "" : "s"}, {totalQty} item{totalQty === 1 ? "" : "s"})</span>}
          </h2>
        </div>

        {cart.length === 0 ? (
          <p className="px-6 py-8 text-center text-black/50">
            Scan items to add them here, then complete the transaction.
          </p>
        ) : (
          <table className="w-full text-left text-lg">
            <thead>
              <tr className="border-b border-black/10 text-base uppercase tracking-wide text-black/60">
                <th className="px-6 py-3 font-semibold">Name</th>
                <th className="px-6 py-3 font-semibold">Barcode</th>
                <th className="px-6 py-3 font-semibold">Qty</th>
                <th className="px-6 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.key} className="border-b border-black/5 last:border-0">
                  <td className="px-6 py-3 font-medium">{line.name}</td>
                  <td className="px-6 py-3 text-black/70">{line.barcode}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={line.maxQty}
                        value={line.qty}
                        onChange={(e) => updateQty(line.key, e.target.value)}
                        disabled={busy}
                        className="w-20 rounded-lg border border-black/20 px-3 py-1.5 text-lg outline-none focus:border-black/60"
                      />
                      <span className="text-sm text-black/40">/ {line.maxQty} available</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
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
        )}

        <div className="flex gap-3 border-t border-black/10 px-6 py-4">
          <button
            onClick={handleComplete}
            disabled={cart.length === 0 || busy}
            className="rounded-lg bg-black px-6 py-3 text-lg font-semibold text-white disabled:opacity-40"
          >
            Done &mdash; complete transaction
          </button>
          <button
            onClick={() => setCart([])}
            disabled={cart.length === 0 || busy}
            className="rounded-lg border border-black/20 px-6 py-3 text-lg font-medium disabled:opacity-40"
          >
            Clear list
          </button>
        </div>
      </div>
    </div>
  );
}
