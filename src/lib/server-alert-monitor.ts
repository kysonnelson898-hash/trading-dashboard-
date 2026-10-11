import { db } from "@/lib/db";
import { enqueueMarketAlert } from "@/lib/alert-queue";
import {
  detectMarketAlerts,
  type MarketAlert,
} from "@/lib/market-alerts";
import { getServerMarketCandles } from "@/lib/server-market-candles";
import type { Candle } from "@/lib/market-data";

const ALERT_CANDLE_LIMIT = 200;

const candleSecondsByTimeframe: Record<string, number> = {
  "30m": 1800,
  "1H": 3600,
  "4H": 14400,
  "1D": 86400,
};

interface MonitorSettings {
  symbols: string[];
  timeframes: string[];
  enabled: boolean;
}

function getLatestClosedCandleTime(
  candles: Candle[],
  timeframe: string,
): number | null {
  const stepSeconds = candleSecondsByTimeframe[timeframe];

  if (!stepSeconds) {
    throw new Error(`Unsupported alert timeframe: ${timeframe}`);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  const closedCandles = candles.filter(
    (candle) => candle.time + stepSeconds <= nowSeconds,
  );

  return closedCandles.at(-1)?.time ?? null;
}

function getTelegramMessage(
  alert: MarketAlert,
  timeframe: string,
): string {
  const typeLabels: Record<MarketAlert["type"], string> = {
    PREVIOUS_DAY_HIGH_BREAK: "PREVIOUS-DAY HIGH BREAK",
    PREVIOUS_DAY_LOW_BREAK: "PREVIOUS-DAY LOW BREAK",
    BULLISH_CHOCH: "BULLISH CHOCH",
    BEARISH_CHOCH: "BEARISH CHOCH",
  };

  const direction =
    alert.type === "PREVIOUS_DAY_LOW_BREAK" ||
    alert.type === "BEARISH_CHOCH"
      ? "🔴 BEARISH"
      : "⚪ BULLISH";

  return [
    "TRADEFLOW ALERT",
    "",
    `${direction} • ${typeLabels[alert.type]}`,
    "",
    `Symbol: ${alert.symbol}`,
    `Timeframe: ${timeframe}`,
    `Price: ${alert.price.toLocaleString()}`,
    `Level: ${alert.level.toLocaleString()}`,
    `Volume: ${alert.volume.toLocaleString()}`,
    `Average Volume: ${alert.averageVolume.toLocaleString()}`,
    `Volume Ratio: ${alert.volumeRatio.toFixed(2)}x`,
    "",
    alert.message,
  ].join("\n");
}

export async function checkServerMarketAlerts(): Promise<MarketAlert[]> {
  const settingsResult = await db.query<MonitorSettings>(
    `
      SELECT symbols, timeframes, enabled
      FROM public.alert_monitor_settings
      WHERE id = 1
    `,
  );

  const settings = settingsResult.rows[0];

  if (!settings) {
    throw new Error("Alert-monitor settings have not been initialized.");
  }

  if (!settings.enabled) {
    return [];
  }

  const triggeredAlerts: MarketAlert[] = [];

  for (const symbol of settings.symbols) {
    for (const timeframe of settings.timeframes) {
      try {
        const candles = await getServerMarketCandles(
          symbol,
          timeframe,
          ALERT_CANDLE_LIMIT,
        );

        const latestClosedCandleTime = getLatestClosedCandleTime(
          candles,
          timeframe,
        );

        if (latestClosedCandleTime === null) {
          continue;
        }

        const alerts = detectMarketAlerts(symbol, candles);

        const currentAlerts = alerts.filter(
          (alert) => alert.time === latestClosedCandleTime,
        );

        for (const alert of currentAlerts) {
          const inserted = await enqueueMarketAlert(
            alert,
            timeframe,
            getTelegramMessage(alert, timeframe),
          );

          if (inserted) {
            triggeredAlerts.push(alert);
          }
        }
      } catch (error) {
        console.error(
          `Server alert check failed for ${symbol} ${timeframe}:`,
          error,
        );
      }
    }
  }

  return triggeredAlerts;
}
