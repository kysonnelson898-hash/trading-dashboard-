import { BitstampMarketDataProvider } from "@/lib/providers/bitstamp";
import type { Candle } from "@/lib/market-data";

const bitstamp = new BitstampMarketDataProvider();

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

const CRYPTO_SYMBOLS = new Set(["BTC/USD", "ETH/USD", "SOL/USD"]);

const BIQUOTE_INTERVALS: Record<string, string> = {
  "1M": "1m",
  "5M": "5m",
  "15M": "15m",
  "30M": "30m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
  "1W": "1w",
};

export async function getServerMarketCandles(
  symbol: string,
  interval: string,
  limit = 200,
): Promise<Candle[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const normalizedInterval = interval.trim().toUpperCase();

  if (!normalizedSymbol) {
    throw new Error("A market symbol is required.");
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Candle limit must be an integer between 1 and 500.");
  }

  if (CRYPTO_SYMBOLS.has(normalizedSymbol)) {
    return bitstamp.getCandles(normalizedSymbol, normalizedInterval, limit);
  }

  const biQuoteInterval = BIQUOTE_INTERVALS[normalizedInterval];

  if (!biQuoteInterval) {
    throw new Error(`Unsupported candle interval: ${interval}`);
  }

  const url = new URL(
    `https://biquote.io/api/${encodeURIComponent(normalizedSymbol)}/ohlc`,
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
      `BiQuote OHLC request failed: HTTP ${response.status} for ${normalizedSymbol}`,
    );
  }

  const data = (await response.json()) as BiQuoteResponse;

  if (!Array.isArray(data.bars)) {
    throw new Error(
      `BiQuote returned an invalid candle response for ${normalizedSymbol}`,
    );
  }

  return data.bars
    .filter(
      (bar) =>
        typeof bar.openTime === "string" &&
        Number.isFinite(Date.parse(bar.openTime)) &&
        [bar.open, bar.high, bar.low, bar.close].every(
          (value) => typeof value === "number" && Number.isFinite(value),
        ),
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
