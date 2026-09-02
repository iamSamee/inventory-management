"use client";

import { useEffect, useRef, useState, FormEvent, KeyboardEvent } from "react";

type CartLine = {
  key: string;
  itemId?: string;
  name: string;
  barcode: string;
  qty: number;
  isNew: boolean;
};

type Suggestion = {
  id: string;
  name: string;
  barcode: string;
  quantity: number;
};

type PendingNew = {
  barcode: string;
  name: string;
  qty: string;
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

export default function InventoryInPage() {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pendingNew, setPendingNew] = useState<PendingNew | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [lastSession, setLastSession] = useState<LastSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);

  const pendingNewOpen = pendingNew !== null;
  useEffect(() => {
    if (pendingNewOpen) {
      nameInputRef.current?.focus();
    } else {
      scanInputRef.current?.focus();
    }
    // Only refocus when the new-item form opens/closes, not on every
    // keystroke inside it (pendingNew gets a new object reference each edit).
  }, [pendingNewOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    const seq = ++requestSeq.current;
    const timer = setTimeout(
      async () => {
        if (!trimmed || pendingNew) {
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
      trimmed && !pendingNew ? 200 : 0
    );
    return () => clearTimeout(timer);
  }, [query, pendingNew]);

  const totalQty = cart.reduce((sum, line) => sum + line.qty, 0);

  function selectSuggestion(item: Suggestion) {
    setCart((prev) => {
      const existing = prev.find((line) => line.itemId === item.id);
      if (existing) {
        return bumpToFront(prev, existing.key, 1);
      }
      return [
        { key: item.id, itemId: item.id, name: item.name, barcode: item.barcode, qty: 1, isNew: false },
        ...prev,
      ];
    });
    setQuery("");
    setSuggestions([]);
    setHighlightedIndex(-1);
    scanInputRef.current?.focus();
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

  async function handleScanSubmit(e: FormEvent) {
    e.preventDefault();
    const value = query.trim();
    if (!value || busy || pendingNew) return;

    const cartMatch = cart.find(
      (line) => line.barcode === value || line.name.toLowerCase() === value.toLowerCase()
    );
    if (cartMatch) {
      setCart((prev) => bumpToFront(prev, cartMatch.key, 1));
      setQuery("");
      scanInputRef.current?.focus();
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
        scanInputRef.current?.focus();
        return;
      }
      if (data.item) {
        setCart((prev) => [
          {
            key: data.item.id,
            itemId: data.item.id,
            name: data.item.name,
            barcode: data.item.barcode,
            qty: 1,
            isNew: false,
          },
          ...prev,
        ]);
        setQuery("");
        scanInputRef.current?.focus();
      } else {
        // Heuristic: pure digits typed/scanned are almost certainly a barcode;
        // anything else is more likely a manually typed product name.
        if (/^\d+$/.test(value)) {
          setPendingNew({ barcode: value, name: "", qty: "1" });
        } else {
          setPendingNew({ barcode: "", name: value, qty: "1" });
        }
        setQuery("");
      }
    } catch {
      setMessage({ text: "Network error. Please try again.", kind: "error" });
      scanInputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function addPendingToCart(e: FormEvent) {
    e.preventDefault();
    if (!pendingNew || busy) return;
    const name = pendingNew.name.trim();
    const barcode = pendingNew.barcode.trim();
    const qty = Number(pendingNew.qty);
    if (!name || !barcode) {
      setMessage({ text: "Name and barcode are both required.", kind: "error" });
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setMessage({ text: "Enter a positive whole quantity.", kind: "error" });
      return;
    }

    // Already queued under this barcode in the current session?
    const cartDup = cart.find((line) => line.barcode === barcode);
    if (cartDup) {
      setCart((prev) => bumpToFront(prev, cartDup.key, qty));
      setPendingNew(null);
      setMessage(null);
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/items/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: barcode }),
      });
      const data = await res.json();
      if (res.ok && data.item) {
        setMessage({
          text: `Barcode ${barcode} already belongs to "${data.item.name}" — scan it directly to add stock instead, or fix the barcode.`,
          kind: "error",
        });
        return;
      }
      setCart((prev) => [{ key: barcode, name, barcode, qty, isNew: true }, ...prev]);
      setPendingNew(null);
    } catch {
      setMessage({ text: "Network error. Please try again.", kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  function updateQty(key: string, value: string) {
    // Allow the field to go through an empty/0 state while the user is
    // actively editing it (e.g. selecting "1" and typing "5") — clamped
    // back to a minimum of 1 on blur, not on every keystroke.
    if (value === "") {
      setCart((prev) => prev.map((line) => (line.key === key ? { ...line, qty: 0 } : line)));
      return;
    }
    const qty = Number(value);
    if (!Number.isInteger(qty) || qty < 0) return;
    setCart((prev) => prev.map((line) => (line.key === key ? { ...line, qty } : line)));
  }

  function normalizeQty(key: string) {
    setCart((prev) =>
      prev.map((line) => (line.key === key && line.qty < 1 ? { ...line, qty: 1 } : line))
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
      const lines = cart.map((line) => {
        const qty = Math.max(1, line.qty);
        return line.isNew
          ? { name: line.name, barcode: line.barcode, qty }
          : { itemId: line.itemId, qty };
      });
      const res = await fetch("/api/transactions/in", {
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
        text: `Received ${totalQty} item${totalQty === 1 ? "" : "s"} across ${products} product${products === 1 ? "" : "s"}.`,
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
      scanInputRef.current?.focus();
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
      scanInputRef.current?.focus();
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Inventory In</h1>
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
          className={`mb-6 rounded-lg px-4 py-3 text-base font-medium ${
            message.kind === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      <form onSubmit={handleScanSubmit} className="relative mb-6 rounded-xl border border-black/10 bg-white p-4 sm:p-8">
        <label htmlFor="scan" className="mb-2 block text-base font-medium text-black/70 sm:text-lg">
          Scan barcode or type product name
        </label>
        <input
          id="scan"
          ref={scanInputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleScanKeyDown}
          disabled={busy || !!pendingNew}
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

      {pendingNew && (
        <form
          onSubmit={addPendingToCart}
          className="mb-6 rounded-xl border border-black/10 bg-white p-4 sm:p-8"
        >
          <p className="mb-6 text-sm font-medium uppercase tracking-wide text-black/50">
            No match found &mdash; name this new item to add it to the list
          </p>
          <label htmlFor="newName" className="mb-2 block text-base font-medium text-black/70 sm:text-lg">
            Name
          </label>
          <input
            id="newName"
            ref={nameInputRef}
            value={pendingNew.name}
            onChange={(e) => setPendingNew({ ...pendingNew, name: e.target.value })}
            disabled={busy}
            className="mb-5 w-full rounded-lg border border-black/20 px-4 py-3 text-lg outline-none focus:border-black/60 disabled:opacity-50 sm:px-5 sm:py-4 sm:text-xl"
          />
          <label htmlFor="newBarcode" className="mb-2 block text-base font-medium text-black/70 sm:text-lg">
            Barcode
          </label>
          <input
            id="newBarcode"
            value={pendingNew.barcode}
            onChange={(e) => setPendingNew({ ...pendingNew, barcode: e.target.value })}
            disabled={busy}
            className="mb-5 w-full rounded-lg border border-black/20 px-4 py-3 text-lg outline-none focus:border-black/60 disabled:opacity-50 sm:px-5 sm:py-4 sm:text-xl"
          />
          <label htmlFor="newQty" className="mb-2 block text-base font-medium text-black/70 sm:text-lg">
            Quantity
          </label>
          <input
            id="newQty"
            type="number"
            min={1}
            value={pendingNew.qty}
            onChange={(e) => setPendingNew({ ...pendingNew, qty: e.target.value })}
            disabled={busy}
            className="mb-6 w-full rounded-lg border border-black/20 px-4 py-3 text-lg outline-none focus:border-black/60 disabled:opacity-50 sm:px-5 sm:py-4 sm:text-xl"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-black px-6 py-3 text-lg font-semibold text-white disabled:opacity-50 sm:w-auto"
            >
              {busy ? "Checking..." : "Add to list"}
            </button>
            <button
              type="button"
              onClick={() => setPendingNew(null)}
              disabled={busy}
              className="w-full rounded-lg border border-black/20 px-6 py-3 text-lg font-medium disabled:opacity-50 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

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
                    <td className="px-4 py-3 font-medium sm:px-6">
                      {line.name}
                      {line.isNew && (
                        <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                          New
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-black/70 sm:px-6">{line.barcode}</td>
                    <td className="px-4 py-3 sm:px-6">
                      <input
                        type="number"
                        min={1}
                        value={line.qty <= 1 ? "" : line.qty}
                        onChange={(e) => updateQty(line.key, e.target.value)}
                        onBlur={() => normalizeQty(line.key)}
                        disabled={busy}
                        className="w-20 rounded-lg border border-black/20 px-3 py-1.5 text-lg outline-none focus:border-black/60"
                      />
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
