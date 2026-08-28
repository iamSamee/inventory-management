"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      router.push("/overview");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--background)] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-6 shadow-sm sm:p-10"
      >
        <h1 className="mb-8 text-2xl font-semibold">Inventory Login</h1>

        <label className="mb-1 block text-sm font-medium text-black/70" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          type="text"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-5 w-full rounded-lg border border-black/20 px-4 py-3 text-lg outline-none focus:border-black/60"
          autoComplete="username"
          required
        />

        <label className="mb-1 block text-sm font-medium text-black/70" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-lg border border-black/20 px-4 py-3 text-lg outline-none focus:border-black/60"
          autoComplete="current-password"
          required
        />

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-black py-3 text-lg font-semibold text-white transition-colors hover:bg-black/80 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
