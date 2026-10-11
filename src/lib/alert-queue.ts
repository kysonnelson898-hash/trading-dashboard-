import { db } from "@/lib/db";
import type { MarketAlert, MarketAlertType } from "@/lib/market-alerts";

export interface QueuedMarketAlert {
  id: string;
  type: MarketAlertType;
  symbol: string;
  timeframe: string;
  candleTime: number;
  price: number;
  level: number;
  volume: number;
  averageVolume: number;
  volumeRatio: number;
  message: string;
  attempts: number;
}

interface QueueInsertResult {
  id: string;
}

export async function enqueueMarketAlert(
  alert: MarketAlert,
  timeframe: string,
  telegramMessage: string,
): Promise<boolean> {
  const queueId = `${alert.id}:${timeframe}`;

  const result = await db.query<QueueInsertResult>(
    `
      INSERT INTO public.market_alerts (
        id,
        type,
        symbol,
        timeframe,
        candle_time,
        price,
        level,
        volume,
        average_volume,
        volume_ratio,
        message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      queueId,
      alert.type,
      alert.symbol,
      timeframe,
      alert.time,
      alert.price,
      alert.level,
      alert.volume,
      alert.averageVolume,
      alert.volumeRatio,
      telegramMessage,
    ],
  );

  return result.rowCount === 1;
}
