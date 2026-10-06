"use client";

import { useEffect, useState } from "react";
import PriceChart from "@/components/PriceChart";
import { assets } from "@/lib/market";
import type { MarketQuote } from "@/lib/market-data";

const timeframes = ["1m", "30m", "1H", "4H"];

export default function Home() {
  const [selectedSymbol, setSelectedSymbol] = useState(
    assets[0].symbol,
  );

  const [quotes, setQuotes] = useState<
    Record<string, MarketQuote>
  >({});

  const [error, setError] = useState<string | null>(null);

  const [selectedTimeframe, setSelectedTimeframe] =
    useState("4H");

  const selectedAsset =
    assets.find((asset) => asset.symbol === selectedSymbol) ??
    assets[0];

  const selectedQuote = quotes[selectedAsset.symbol] ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadQuotes() {
      try {
        const results = await Promise.all(
          assets.map(async (asset) => {
            const response = await fetch(
              `/api/market/quote?symbol=${encodeURIComponent(
                asset.symbol,
              )}`,
            );

            if (!response.ok) {
              throw new Error(
                `Unable to load ${asset.symbol}`,
              );
            }

            const quote: MarketQuote = await response.json();

            return quote;
          }),
        );

        if (!cancelled) {
          const nextQuotes: Record<string, MarketQuote> = {};

          for (const quote of results) {
            nextQuotes[quote.symbol] = quote;
          }

          setQuotes(nextQuotes);
          setError(null);
        }
      } catch (loadError) {
        console.error("Market quote error:", loadError);

        if (!cancelled) {
          setError("Some market data is unavailable");
        }
      }
    }

    loadQuotes();

    const interval = window.setInterval(
      loadQuotes,
      60_000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1600px] p-6">
        <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              TradeFlow
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Multi-asset market dashboard
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
            <p className="text-xs text-slate-500">
              Portfolio Value
            </p>

            <p className="mt-1 text-lg font-semibold">$—</p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Watchlist
              </h2>

              <button
                type="button"
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
              >
                +
              </button>
            </div>

            <div className="space-y-2">
              {assets.map((asset) => {
                const isSelected =
                  asset.symbol === selectedAsset.symbol;

                const assetQuote = quotes[asset.symbol];

                return (
                  <button
                    key={asset.symbol}
                    type="button"
                    onClick={() =>
                      setSelectedSymbol(asset.symbol)
                    }
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      isSelected
                        ? "border-slate-600 bg-slate-800"
                        : "border-transparent hover:border-slate-800 hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {asset.symbol}
                      </span>

                      <span className="text-xs uppercase text-slate-500">
                        {asset.type}
                      </span>
                    </div>

                    <div className="mt-1 text-xs text-slate-400">
                      {asset.name}
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-slate-300">
                        {assetQuote
                          ? `$${assetQuote.price.toLocaleString()}`
                          : "—"}
                      </span>

                      <span
                        className={`text-xs ${
                          assetQuote
                            ? assetQuote.change24h >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                            : "text-slate-500"
                        }`}
                      >
                        {assetQuote
                          ? `${assetQuote.change24h >= 0 ? "+" : ""}${assetQuote.change24h.toFixed(2)}%`
                          : "—"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0">
            <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="text-sm text-slate-500">
                  Selected Asset
                </p>

                <div className="mt-1 flex items-baseline gap-3">
                  <h2 className="text-2xl font-bold">
                    {selectedAsset.symbol}
                  </h2>

                  <span className="text-sm text-slate-400">
                    {selectedAsset.name}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {timeframes.map((timeframe) => (
                  <button
                    key={timeframe}
                    type="button"
                    onClick={() =>
                      setSelectedTimeframe(timeframe)
                    }
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      selectedTimeframe === timeframe
                        ? "bg-slate-100 text-slate-950"
                        : "border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {timeframe}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs text-slate-500">
                  Price
                </p>

                <p className="mt-2 text-xl font-semibold">
                  {selectedQuote
                    ? `$${selectedQuote.price.toLocaleString()}`
                    : "—"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs text-slate-500">
                  24h Change
                </p>

                <p
                  className={`mt-2 text-xl font-semibold ${
                    selectedQuote
                      ? selectedQuote.change24h >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                      : "text-slate-300"
                  }`}
                >
                  {selectedQuote
                    ? `${selectedQuote.change24h >= 0 ? "+" : ""}${selectedQuote.change24h.toFixed(2)}%`
                    : "—"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs text-slate-500">
                  24h High
                </p>

                <p className="mt-2 text-xl font-semibold">
                  {selectedQuote
                    ? `$${selectedQuote.high24h.toLocaleString()}`
                    : "—"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs text-slate-500">
                  24h Low
                </p>

                <p className="mt-2 text-xl font-semibold">
                  {selectedQuote
                    ? `$${selectedQuote.low24h.toLocaleString()}`
                    : "—"}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2">
              <PriceChart
                symbol={selectedAsset.symbol}
                timeframe={selectedTimeframe}
              />
            </div>

            <div className="mt-6">
              <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <h3 className="font-semibold">
                  Market Statistics
                </h3>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-sm text-slate-400">
                      Volume
                    </span>

                    <span className="text-sm font-medium">
                      {selectedQuote
                        ? `$${selectedQuote.volume24h.toLocaleString()}`
                        : "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-sm text-slate-400">
                      24h Range
                    </span>

                    <span className="text-sm font-medium">
                      {selectedQuote
                        ? `$${selectedQuote.low24h.toLocaleString()} – $${selectedQuote.high24h.toLocaleString()}`
                        : "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">
                      Data Status
                    </span>

                    <span className="text-sm text-emerald-400">
                      Live
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
