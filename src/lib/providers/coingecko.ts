import axios from "axios";
import type {
  Candle,
  MarketDataProvider,
  MarketQuote,
} from "@/lib/market-data";

const COINGECKO_API_URL = "https://api.coingecko.com/api/v3";

const coinMap: Record<string, string> = {
  "BTC/USD": "bitcoin",
  "ETH/USD": "ethereum",
  "SOL/USD": "solana",
};

interface CoinGeckoMarketResponse {
  id: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  high_24h: number | null;
  low_24h: number | null;
  total_volume: number | null;
  last_updated: string;
}

type CoinGeckoOhlcResponse = [
  number,
  number,
  number,
  number,
  number,
][];

export class CoinGeckoMarketDataProvider implements MarketDataProvider {
  private getApiKey(): string {
    const apiKey = process.env.COINGECKO_API_KEY;

    if (!apiKey) {
      throw new Error("COINGECKO_API_KEY is not configured");
    }

    return apiKey;
  }

  private resolveCoin(symbol: string): string {
    const coinId = coinMap[symbol];

    if (!coinId) {
      throw new Error(`Unsupported market symbol: ${symbol}`);
    }

    return coinId;
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const coinId = this.resolveCoin(symbol);

    const response = await axios.get<CoinGeckoMarketResponse[]>(
      `${COINGECKO_API_URL}/coins/markets`,
      {
        params: {
          vs_currency: "usd",
          ids: coinId,
          price_change_percentage: "24h",
        },
        headers: {
          "x-cg-demo-api-key": this.getApiKey(),
        },
      },
    );

    const data = response.data[0];

    if (!data) {
      throw new Error(`No market data returned for ${symbol}`);
    }

    return {
      symbol,
      price: data.current_price,
      change24h: data.price_change_percentage_24h ?? 0,
      high24h: data.high_24h ?? 0,
      low24h: data.low_24h ?? 0,
      volume24h: data.total_volume ?? 0,
      timestamp: new Date(data.last_updated).getTime(),
    };
  }

  async getCandles(
    symbol: string,
    interval: string,
    limit = 100,
  ): Promise<Candle[]> {
    const coinId = this.resolveCoin(symbol);
    const days = this.getDaysForInterval(interval);

    const response = await axios.get<CoinGeckoOhlcResponse>(
      `${COINGECKO_API_URL}/coins/${coinId}/ohlc`,
      {
        params: {
          vs_currency: "usd",
          days,
        },
        headers: {
          "x-cg-demo-api-key": this.getApiKey(),
        },
      },
    );

    const candles = response.data.slice(-limit).map((ohlc) => {
      const [timestamp, open, high, low, close] = ohlc;

      return {
        time: Math.floor(timestamp / 1000),
        open,
        high,
        low,
        close,
        volume: 0,
      };
    });

    if (candles.length === 0) {
      throw new Error(`No candle data returned for ${symbol}`);
    }

    return candles;
  }

  private getDaysForInterval(interval: string): number {
    const daysByInterval: Record<string, number> = {
      "30m": 1,
      "4H": 7,
    };

    const days = daysByInterval[interval];

    if (!days) {
      throw new Error(
        `CoinGecko OHLC does not currently provide a reliable ${interval} interval`,
      );
    }

    return days;
  }
}
