"use client";

import { useEffect, useMemo, useState } from "react";
import { assets } from "@/lib/market";
import type { MarketQuote } from "@/lib/market-data";

interface MarketTickerProps {
  quotes: Record<string, MarketQuote>;
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
}

export default function MarketTicker({
  quotes,
  selectedSymbol,
  onSelect,
}: MarketTickerProps) {
  const [offset, setOffset] = useState(0);

  const tickerAssets = useMemo(
    () => [...assets, ...assets, ...assets],
    [],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setOffset((current) => current + 1);
    }, 45);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="relative mb-6 overflow-hidden border-y border-red-950/80 bg-black shadow-[0_0_30px_rgba(127,29,29,0.15)]">
      <div className="absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-black to-transparent" />
      <div className="absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-black to-transparent" />

      <div className="flex h-16 items-center overflow-hidden">
        <div
          className="flex min-w-max items-center"
          style={{
            transform: `translateX(-${offset}px)`,
          }}
        >
          {tickerAssets.map((asset, index) => {
            const quote = quotes[asset.symbol];
            const isSelected =
              asset.symbol === selectedSymbol;

            return (
              <button
                key={`${asset.symbol}-${index}`}
                type="button"
                onClick={() => onSelect(asset.symbol)}
                className={`group flex h-12 items-center border-r border-red-950/70 px-6 text-left transition ${
                  isSelected
                    ? "bg-red-950/20"
                    : "hover:bg-red-950/10"
                }`}
              >
                <div className="flex items-center gap-4 whitespace-nowrap">
                  <span
                    className={`font-mono text-sm font-bold tracking-widest ${
                      isSelected
                        ? "text-red-300"
                        : "text-red-500"
                    }`}
                  >
                    {asset.symbol}
                  </span>

                  <span className="font-mono text-lg font-bold tracking-wider text-red-400 [text-shadow:0_0_8px_rgba(248,113,113,0.45)]">
                    {quote
                      ? `$${quote.price.toLocaleString(
                          undefined,
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          },
                        )}`
                      : "—"}
                  </span>

                  <span
                    className={`font-mono text-xs font-bold ${
                      quote
                        ? quote.change24h >= 0
                          ? "text-emerald-500"
                          : "text-red-600"
                        : "text-red-900"
                    }`}
                  >
                    {quote
                      ? `${quote.change24h >= 0 ? "+" : ""}${quote.change24h.toFixed(2)}%`
                      : "—"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-red-700/30 shadow-[0_0_8px_rgba(185,28,28,0.7)]" />
    </div>
  );
}
