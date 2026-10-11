import { NextResponse } from "next/server";
import { BitstampMarketDataProvider } from "@/lib/providers/bitstamp";
import type { Candle } from "@/lib/market-data";

const bitstamp = new BitstampMarketDataProvider();
const CACHE_TTL_MS = 10_000;

type CacheEntry = {
  expiresAt: number;
  candles: Candle[];
};

type BiQuoteBar = {
  openTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  tickVolume?: number;
};

type BiQuoteResponse = {
  symbol: string;
  interval: string;
  bars: BiQuoteBar[];
};

const candleCache = new Map<string, CacheEntry>();

function isCryptoSymbol(symbol: string): boolean {
  return ["BTC/USD", "ETH/USD", "SOL/USD"].includes(symbol.toUpperCase());
}

function toBiQuoteInterval(interval: string): string {
  const intervals: Record<string, string> = {
    "1M": "1m",
    "5M": "5m",
    "15M": "15m",
    "30M": "30m",
    "1H": "1h",
    "4H": "4h",
    "1D": "1d",
    "1W": "1w",
  };

  const result = intervals[interval.toUpperCase()];
  if (!result) {
    throw new Error(`Unsupported candle interval: ${interval}`);
  }

  return result;
}

async function getBiQuoteCandles(
  symbol: string,
  interval: string,
  limit: number,
): Promise<Candle[]> {
  const biQuoteInterval = toBiQuoteInterval(interval);
  const url = new URL(
    `https://biquote.io/api/${encodeURIComponent(symbol)}/ohlc`,
  );

  url.searchParams.set("interval", biQuoteInterval);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `BiQuote OHLC request failed: HTTP ${response.status} for ${symbol}`,
    );
  }

  const data = (await response.json()) as BiQuoteResponse;

  if (!Array.isArray(data.bars)) {
    throw new Error(`BiQuote returned an invalid candle response for ${symbol}`);
  }

  return data.bars
    .filter(
      (bar) =>
        Number.isFinite(Date.parse(bar.openTime)) &&
        [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite),
    )
    .map((bar) => ({
      time: Math.floor(Date.parse(bar.openTime) / 1000),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.tickVolume ?? bar.volume ?? 0,
    }))
    .sort((a, b) => a.time - b.time)
    .slice(-limit);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim();
  const interval = searchParams.get("interval") ?? "4H";
  const limit = Number(searchParams.get("limit") ?? "100");

  if (!symbol) {
    return NextResponse.json(
      { error: "Missing symbol parameter" },
      { status: 400 },
    );
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return NextResponse.json(
      { error: "Limit must be an integer between 1 and 500" },
      { status: 400 },
    );
  }

  const cacheKey = `${symbol.toUpperCase()}:${interval.toUpperCase()}:${limit}`;
  const cached = candleCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.candles, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const candles = isCryptoSymbol(symbol)
      ? await bitstamp.getCandles(symbol, interval, limit)
      : await getBiQuoteCandles(symbol, interval, limit);

    candleCache.set(cacheKey, {
      candles,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return NextResponse.json(candles, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Market candles error:", error);

    return NextResponse.json(
      { error: "Unable to retrieve market candles" },
      { status: 502 },
    );
  }
}
