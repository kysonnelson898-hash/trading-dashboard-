import axios from "axios";
import type {
  Candle,
  MarketDataProvider,
  MarketQuote,
} from "@/lib/market-data";

const BITSTAMP_API_URL = "https://www.bitstamp.net/api/v2";

const symbolMap: Record<string, string> = {
  "BTC/USD": "btcusd",
  "ETH/USD": "ethusd",
  "SOL/USD": "solusd",
};

interface BitstampOhlcEntry {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface BitstampOhlcResponse {
  data: {
    pair: string;
    ohlc: BitstampOhlcEntry[];
  };
}

export class BitstampMarketDataProvider
  implements MarketDataProvider
{
  private resolveSymbol(symbol: string): string {
    const pair = symbolMap[symbol];

    if (!pair) {
      throw new Error(`Unsupported market symbol: ${symbol}`);
    }

    return pair;
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const pair = this.resolveSymbol(symbol);

    const response = await axios.get<BitstampOhlcResponse>(
      `${BITSTAMP_API_URL}/ohlc/${pair}/`,
      {
        params: {
          step: 60,
          limit: 1,
        },
      },
    );

    const candle = response.data.data.ohlc.at(-1);

    if (!candle) {
      throw new Error(`No market data returned for ${symbol}`);
    }

    const price = Number(candle.close);

    return {
      symbol,
      price,
      change24h: 0,
      high24h: Number(candle.high),
      low24h: Number(candle.low),
      volume24h: Number(candle.volume),
      timestamp: Number(candle.timestamp) * 1000,
    };
  }

  async getCandles(
    symbol: string,
    interval: string,
    limit = 100,
  ): Promise<Candle[]> {
    const pair = this.resolveSymbol(symbol);
    const step = this.getStepForInterval(interval);

    const response = await axios.get<BitstampOhlcResponse>(
      `${BITSTAMP_API_URL}/ohlc/${pair}/`,
      {
        params: {
          step,
          limit,
        },
      },
    );

    const candles = response.data.data.ohlc.map(
      (candle) => ({
        time: Number(candle.timestamp),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: Number(candle.volume),
      }),
    );

    if (candles.length === 0) {
      throw new Error(`No candle data returned for ${symbol}`);
    }

    return candles;
  }

  private getStepForInterval(interval: string): number {
    const stepsByInterval: Record<string, number> = {
      "1m": 60,
      "30m": 1800,
      "1H": 3600,
      "4H": 14400,
      "1D": 86400,
    };

    const step = stepsByInterval[interval];

    if (!step) {
      throw new Error(
        `Bitstamp does not currently support the ${interval} interval`,
      );
    }

    return step;
  }
}
