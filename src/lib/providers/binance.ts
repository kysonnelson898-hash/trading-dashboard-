import type {
  Candle,
  MarketDataProvider,
  MarketQuote,
} from "@/lib/market-data";

const BINANCE_SPOT_API_URL =
  "https://data-api.binance.vision/api/v3";

const BINANCE_FUTURES_STREAM_URL =
  "wss://fstream.binance.com/market";

const symbolMap: Record<string, string> = {
  "BTC/USD": "BTCUSDT",
  "ETH/USD": "ETHUSDT",
  "SOL/USD": "SOLUSDT",
};

interface BinanceTickerResponse {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  closeTime: number;
}

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

export interface BinanceOrderBookLevel {
  price: number;
  quantity: number;
}

export interface BinanceOrderBook {
  symbol: string;
  bids: BinanceOrderBookLevel[];
  asks: BinanceOrderBookLevel[];
  timestamp: number;
}

export interface BinanceLiquidation {
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  averagePrice: number;
  timestamp: number;
}

export class BinanceMarketDataProvider
  implements MarketDataProvider
{
  private resolveSymbol(symbol: string): string {
    const binanceSymbol = symbolMap[symbol];

    if (!binanceSymbol) {
      throw new Error(
        `Unsupported market symbol: ${symbol}`,
      );
    }

    return binanceSymbol;
  }

  async getQuote(
    symbol: string,
  ): Promise<MarketQuote> {
    const binanceSymbol =
      this.resolveSymbol(symbol);

    const response =
      await fetch(
        `${BINANCE_SPOT_API_URL}/ticker/24hr?symbol=${binanceSymbol}`,
        {
          cache: "no-store",
        },
      );

    if (!response.ok) {
      throw new Error(
        `Binance quote request failed: ${response.status}`,
      );
    }

    const data: BinanceTickerResponse =
      await response.json();

    return {
      symbol,
      price: Number(data.lastPrice),
      change24h: Number(
        data.priceChangePercent,
      ),
      high24h: Number(data.highPrice),
      low24h: Number(data.lowPrice),
      volume24h: Number(data.volume),
      timestamp: data.closeTime,
    };
  }

  async getCandles(
    symbol: string,
    interval: string,
    limit = 100,
  ): Promise<Candle[]> {
    const binanceSymbol =
      this.resolveSymbol(symbol);

    const binanceInterval =
      this.resolveInterval(interval);

    const response =
      await fetch(
        `${BINANCE_SPOT_API_URL}/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&limit=${limit}`,
        {
          cache: "no-store",
        },
      );

    if (!response.ok) {
      throw new Error(
        `Binance candle request failed: ${response.status}`,
      );
    }

    const data: BinanceKline[] =
      await response.json();

    const candles = data.map(
      (kline) => ({
        time: Math.floor(kline[0] / 1000),
        open: Number(kline[1]),
        high: Number(kline[2]),
        low: Number(kline[3]),
        close: Number(kline[4]),
        volume: Number(kline[5]),
      }),
    );

    if (candles.length === 0) {
      throw new Error(
        `No candle data returned for ${symbol}`,
      );
    }

    return candles;
  }

  async getOrderBook(
    symbol: string,
    limit = 20,
  ): Promise<BinanceOrderBook> {
    const binanceSymbol =
      this.resolveSymbol(symbol);

    const response =
      await fetch(
        `${BINANCE_SPOT_API_URL}/depth?symbol=${binanceSymbol}&limit=${limit}`,
        {
          cache: "no-store",
        },
      );

    if (!response.ok) {
      throw new Error(
        `Binance order book request failed: ${response.status}`,
      );
    }

    const data: {
      bids: [string, string][];
      asks: [string, string][];
    } = await response.json();

    return {
      symbol,
      bids: data.bids.map(
        ([price, quantity]) => ({
          price: Number(price),
          quantity: Number(quantity),
        }),
      ),
      asks: data.asks.map(
        ([price, quantity]) => ({
          price: Number(price),
          quantity: Number(quantity),
        }),
      ),
      timestamp: Date.now(),
    };
  }

  getLiquidationStreamUrl(
    symbol: string,
  ): string {
    const binanceSymbol =
      this.resolveSymbol(symbol).toLowerCase();

    return `${BINANCE_FUTURES_STREAM_URL}/stream?streams=${binanceSymbol}@forceOrder`;
  }

  parseLiquidationMessage(
    message: unknown,
  ): BinanceLiquidation | null {
    if (
      typeof message !== "object" ||
      message === null
    ) {
      return null;
    }

    const payload =
      message as {
        data?: {
          e?: string;
          E?: number;
          o?: {
            s?: string;
            S?: "BUY" | "SELL";
            p?: string;
            q?: string;
            ap?: string;
            T?: number;
          };
        };
      };

    const order =
      payload.data?.o;

    if (
      payload.data?.e !== "forceOrder" ||
      !order ||
      !order.S ||
      !order.p ||
      !order.q ||
      !order.ap ||
      !order.T
    ) {
      return null;
    }

    return {
      symbol: order.s ?? "",
      side: order.S,
      price: Number(order.p),
      quantity: Number(order.q),
      averagePrice: Number(order.ap),
      timestamp: order.T,
    };
  }

  private resolveInterval(
    interval: string,
  ): string {
    const intervalMap: Record<
      string,
      string
    > = {
      "1m": "1m",
      "30m": "30m",
      "1H": "1h",
      "4H": "4h",
      "1D": "1d",
    };

    const resolved =
      intervalMap[interval];

    if (!resolved) {
      throw new Error(
        `Binance does not currently support the ${interval} interval`,
      );
    }

    return resolved;
  }
}
