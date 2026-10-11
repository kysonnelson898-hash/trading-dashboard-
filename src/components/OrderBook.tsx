"use client";

import { useEffect, useState } from "react";

interface OrderBookLevel {
  price: number;
  quantity: number;
}

interface OrderBookResponse {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

interface OrderBookProps {
  symbol: string;
}

function formatPrice(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAmount(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatTotal(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export default function OrderBook({ symbol }: OrderBookProps) {
  const [book, setBook] = useState<OrderBookResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBook() {
      try {
        const response = await fetch(
          `/api/market/orderbook?symbol=${encodeURIComponent(symbol)}&limit=20`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error("Unable to load order book");
        }

        const data: OrderBookResponse = await response.json();

        if (!cancelled) {
          setBook(data);
          setError(null);
        }
      } catch (cause) {
        console.error("Order book error:", cause);
        if (!cancelled) {
          setError("Order book unavailable");
        }
      }
    }

    void loadBook();
    const timer = window.setInterval(loadBook, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbol]);

  const bids = book?.bids.slice(0, 10) ?? [];
  const asks = book?.asks.slice(0, 10) ?? [];

  const bidRows = bids.map((level, index, levels) => ({
    ...level,
    cumulative: levels
      .slice(0, index + 1)
      .reduce((sum, item) => sum + item.quantity, 0),
  }));

  const askRows = asks.map((level, index, levels) => ({
    ...level,
    cumulative: levels
      .slice(0, index + 1)
      .reduce((sum, item) => sum + item.quantity, 0),
  }));

  const maxBidTotal = Math.max(
    ...bidRows.map((level) => level.cumulative),
    1,
  );

  const maxAskTotal = Math.max(
    ...askRows.map((level) => level.cumulative),
    1,
  );

  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread =
    bestBid !== null && bestAsk !== null
      ? bestAsk - bestBid
      : null;

  const bidVolume = bids.reduce(
    (sum, level) => sum + level.quantity,
    0,
  );
  const askVolume = asks.reduce(
    (sum, level) => sum + level.quantity,
    0,
  );
  const volume = bidVolume + askVolume;
  const bidPercent = volume > 0 ? (bidVolume / volume) * 100 : 50;
  const askPercent = 100 - bidPercent;

  return (
    <section className="overflow-hidden border border-white/10 bg-[#07100f] text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0b1515] px-3 py-3 sm:px-4">
        <div className="flex items-center gap-3">
          <span className="border border-[#39ff14]/40 bg-[#39ff14]/10 px-2 py-1 font-mono text-[10px] font-bold tracking-widest text-[#39ff14]">
            L2
          </span>
          <div>
            <h2 className="font-mono text-sm font-bold tracking-widest">
              ORDER BOOK
            </h2>
            <p className="font-mono text-[10px] tracking-wider text-white/45">
              {symbol} · MARKET DEPTH
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-[#39ff14]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#39ff14]" />
          LIVE
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 border-b border-white/[0.07] px-3 py-3 sm:px-4">
        <div>
          <div className="mb-1 font-mono text-[10px] tracking-widest text-white/40">
            BEST BID
          </div>
          <div className="font-mono text-sm font-bold text-[#39ff14]">
            {bestBid !== null ? formatPrice(bestBid) : "--"}
          </div>
        </div>
        <div className="text-right">
          <div className="mb-1 font-mono text-[10px] tracking-widest text-white/40">
            BEST ASK
          </div>
          <div className="font-mono text-sm font-bold text-red-400">
            {bestAsk !== null ? formatPrice(bestAsk) : "--"}
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-between font-mono text-[10px] text-white/45">
          <span>SPREAD</span>
          <span className="text-white">
            {spread !== null ? formatPrice(spread) : "--"}
          </span>
        </div>
        <div className="col-span-2">
          <div className="mb-1 flex justify-between font-mono text-[9px] tracking-wider">
            <span className="text-[#39ff14]">BIDS {bidPercent.toFixed(1)}%</span>
            <span className="text-red-400">ASKS {askPercent.toFixed(1)}%</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-sm bg-white/5">
            <div
              className="bg-[#39ff14] transition-[width] duration-300"
              style={{ width: `${bidPercent}%` }}
            />
            <div
              className="bg-red-500 transition-[width] duration-300"
              style={{ width: `${askPercent}%` }}
            />
          </div>
        </div>
      </div>

      {error ? (
        <div className="px-4 py-8 text-center font-mono text-xs text-red-400">
          {error}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[540px]">
            <div className="grid grid-cols-6 border-b border-white/10 bg-white/[0.025] px-2 py-2 font-mono text-[9px] tracking-wider text-white/40">
              <span>AMOUNT</span>
              <span className="text-right">TOTAL</span>
              <span className="text-right text-[#39ff14]">BID PRICE</span>
              <span className="text-left text-red-400">ASK PRICE</span>
              <span className="text-right">TOTAL</span>
              <span className="text-right">AMOUNT</span>
            </div>

            {Array.from(
              { length: Math.max(bidRows.length, askRows.length) },
              (_, index) => {
                const bid = bidRows[index];
                const ask = askRows[index];

                const bidWidth = bid
                  ? (bid.cumulative / maxBidTotal) * 100
                  : 0;
                const askWidth = ask
                  ? (ask.cumulative / maxAskTotal) * 100
                  : 0;

                return (
                  <div
                    key={`depth-${index}`}
                    className="relative grid grid-cols-6 items-center border-b border-white/[0.035] px-2 py-1.5 font-mono text-[10px] sm:text-[11px]"
                  >
                    {bid && (
                      <div
                        className="absolute inset-y-0 left-0 bg-[#39ff14]/[0.09]"
                        style={{ width: `${bidWidth * 0.48}%` }}
                      />
                    )}
                    {ask && (
                      <div
                        className="absolute inset-y-0 right-0 bg-red-500/[0.09]"
                        style={{ width: `${askWidth * 0.48}%` }}
                      />
                    )}

                    <span className="relative z-10 truncate text-[#39ff14]">
                      {bid ? formatAmount(bid.quantity) : "--"}
                    </span>
                    <span className="relative z-10 truncate text-right text-white/65">
                      {bid ? formatTotal(bid.cumulative) : "--"}
                    </span>
                    <span className="relative z-10 truncate text-right font-semibold text-[#39ff14]">
                      {bid ? formatPrice(bid.price) : "--"}
                    </span>

                    <span className="relative z-10 truncate text-left font-semibold text-red-400">
                      {ask ? formatPrice(ask.price) : "--"}
                    </span>
                    <span className="relative z-10 truncate text-right text-white/65">
                      {ask ? formatTotal(ask.cumulative) : "--"}
                    </span>
                    <span className="relative z-10 truncate text-right text-red-400">
                      {ask ? formatAmount(ask.quantity) : "--"}
                    </span>
                  </div>
                );
              },
            )}

            <footer className="flex items-center justify-between px-3 py-2 font-mono text-[9px] tracking-wider text-white/35">
              <span>NEON GREEN · BIDS</span>
              <span>RED · ASKS</span>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
