import axios from "axios";
import type {
  Candle,
  MarketDataProvider,
  MarketQuote,
} from "@/lib/market-data";

const BINANCE_API_URL = "https://api.binance.com";

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

interface BinanceKline {
  0: number;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: number;
}

export class BinanceMarketDataProvider implements MarketDataProvider {
  private resolveSymbol(symbol: string): string {
    const binanceSymbol = symbolMap[symbol];

    if (!binanceSymbol) {
      throw new Error(`Unsupported market symbol: ${symbol}`);
    }

    return binanceSymbol;
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const binanceSymbol = this.resolveSymbol(symbol);

    const response = await axios.get<BinanceTickerResponse>(
      `${BINANCE_API_URL}/api/v3/ticker/24hr`,
      {
        params: {
          symbol: binanceSymbol,
        },
      },
    );

    const data = response.data;

    return {
      symbol,
      price: Number(data.lastPrice),
      change24h: Number(data.priceChangePercent),
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
    const binanceSymbol = this.resolveSymbol(symbol);

    const response = await axios.get<BinanceKline[]>(
      `${BINANCE_API_URL}/api/v3/klines`,
      {
        params: {
          symbol: binanceSymbol,
          interval,
          limit,
        },
      },
    );

    return response.data.map((kline) => ({
      time: Math.floor(kline[0] / 1000),
      open: Number(kline[1]),
      high: Number(kline[2]),
      low: Number(kline[3]),
      close: Number(kline[4]),
      volume: Number(kline[5]),
    }));
  }
}
