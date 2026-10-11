import type { Candle } from "@/lib/market-data";

export type MarketAlertType =
  | "PREVIOUS_DAY_HIGH_BREAK"
  | "PREVIOUS_DAY_LOW_BREAK"
  | "BULLISH_CHOCH"
  | "BEARISH_CHOCH";

export interface MarketAlert {
  id: string;
  type: MarketAlertType;
  symbol: string;
  time: number;
  price: number;
  level: number;
  volume: number;
  averageVolume: number;
  volumeRatio: number;
  message: string;
}

interface SwingPoint {
  time: number;
  price: number;
  type: "high" | "low";
  index: number;
}

const VOLUME_LOOKBACK = 20;
const MIN_VOLUME_RATIO = 1.5;

function getVolumeBaseline(
  candles: Candle[],
  index: number,
): number {
  if (index < VOLUME_LOOKBACK) {
    return 0;
  }

  const values = candles
    .slice(
      index - VOLUME_LOOKBACK,
      index,
    )
    .map((candle) => candle.volume)
    .filter(
      (volume) =>
        Number.isFinite(volume) &&
        volume >= 0,
    );

  if (
    values.length !==
    VOLUME_LOOKBACK
  ) {
    return 0;
  }

  return (
    values.reduce(
      (sum, value) => sum + value,
      0,
    ) / VOLUME_LOOKBACK
  );
}

function hasStrongVolume(
  candles: Candle[],
  index: number,
): {
  confirmed: boolean;
  averageVolume: number;
  volumeRatio: number;
} {
  const candle = candles[index];

  if (!candle) {
    return {
      confirmed: false,
      averageVolume: 0,
      volumeRatio: 0,
    };
  }

  const averageVolume =
    getVolumeBaseline(
      candles,
      index,
    );

  if (averageVolume <= 0) {
    return {
      confirmed: false,
      averageVolume,
      volumeRatio: 0,
    };
  }

  const volumeRatio =
    candle.volume / averageVolume;

  return {
    confirmed:
      Number.isFinite(volumeRatio) &&
      volumeRatio >= MIN_VOLUME_RATIO,
    averageVolume,
    volumeRatio,
  };
}

function getSwingPoints(
  candles: Candle[],
): SwingPoint[] {
  const swings: SwingPoint[] = [];

  if (candles.length < 5) {
    return swings;
  }

  for (
    let index = 2;
    index < candles.length - 2;
    index += 1
  ) {
    const candle = candles[index];

    const isSwingHigh =
      candle.high > candles[index - 1].high &&
      candle.high > candles[index - 2].high &&
      candle.high >= candles[index + 1].high &&
      candle.high >= candles[index + 2].high;

    const isSwingLow =
      candle.low < candles[index - 1].low &&
      candle.low < candles[index - 2].low &&
      candle.low <= candles[index + 1].low &&
      candle.low <= candles[index + 2].low;

    if (isSwingHigh) {
      swings.push({
        time: candle.time,
        price: candle.high,
        type: "high",
        index,
      });
    }

    if (isSwingLow) {
      swings.push({
        time: candle.time,
        price: candle.low,
        type: "low",
        index,
      });
    }
  }

  return swings.sort(
    (a, b) => a.time - b.time,
  );
}

function getPreviousDayRange(
  candles: Candle[],
  candleIndex: number,
): {
  high: number;
  low: number;
} | null {
  const currentCandle =
    candles[candleIndex];

  if (!currentCandle) {
    return null;
  }

  const currentDay = Math.floor(
    currentCandle.time / 86400,
  );

  const previousDay =
    currentDay - 1;

  const previousDayCandles =
    candles.filter(
      (candle) =>
        Math.floor(
          candle.time / 86400,
        ) === previousDay,
    );

  if (previousDayCandles.length === 0) {
    return null;
  }

  return {
    high: Math.max(
      ...previousDayCandles.map(
        (candle) => candle.high,
      ),
    ),
    low: Math.min(
      ...previousDayCandles.map(
        (candle) => candle.low,
      ),
    ),
  };
}

function createAlertId(
  symbol: string,
  type: MarketAlertType,
  time: number,
): string {
  return `${symbol}:${type}:${time}`;
}

export function detectMarketAlerts(
  symbol: string,
  candles: Candle[],
): MarketAlert[] {
  if (
    candles.length <
    VOLUME_LOOKBACK + 5
  ) {
    return [];
  }

  const sorted = [...candles].sort(
    (a, b) => a.time - b.time,
  );

  const swings =
    getSwingPoints(sorted);

  const alerts: MarketAlert[] = [];

  let previousTrend:
    | "bullish"
    | "bearish"
    | null = null;

  let brokenHighIndex = -1;
  let brokenLowIndex = -1;

  for (
    let index = 0;
    index < sorted.length;
    index += 1
  ) {
    const candle = sorted[index];

    /*
     * ---------------------------------------------------
     * PREVIOUS-DAY HIGH / LOW BREAK
     * ---------------------------------------------------
     */

    const previousDayRange =
      getPreviousDayRange(
        sorted,
        index,
      );

    if (previousDayRange) {
      const volume =
        hasStrongVolume(
          sorted,
          index,
        );

      if (
        volume.confirmed &&
        index > 0 &&
        sorted[index - 1].close <=
          previousDayRange.high &&
        candle.close >
          previousDayRange.high
      ) {
        alerts.push({
          id: createAlertId(
            symbol,
            "PREVIOUS_DAY_HIGH_BREAK",
            candle.time,
          ),
          type:
            "PREVIOUS_DAY_HIGH_BREAK",
          symbol,
          time: candle.time,
          price: candle.close,
          level:
            previousDayRange.high,
          volume: candle.volume,
          averageVolume:
            volume.averageVolume,
          volumeRatio:
            volume.volumeRatio,
          message:
            `${symbol} broke previous-day high with ${volume.volumeRatio.toFixed(2)}x average volume.`,
        });
      }

      if (
        volume.confirmed &&
        index > 0 &&
        sorted[index - 1].close >=
          previousDayRange.low &&
        candle.close <
          previousDayRange.low
      ) {
        alerts.push({
          id: createAlertId(
            symbol,
            "PREVIOUS_DAY_LOW_BREAK",
            candle.time,
          ),
          type:
            "PREVIOUS_DAY_LOW_BREAK",
          symbol,
          time: candle.time,
          price: candle.close,
          level:
            previousDayRange.low,
          volume: candle.volume,
          averageVolume:
            volume.averageVolume,
          volumeRatio:
            volume.volumeRatio,
          message:
            `${symbol} broke previous-day low with ${volume.volumeRatio.toFixed(2)}x average volume.`,
        });
      }
    }

    /*
     * ---------------------------------------------------
     * CHOCH
     * ---------------------------------------------------
     */

    const availableHighs =
      swings.filter(
        (swing) =>
          swing.type === "high" &&
          swing.index < index,
      );

    const availableLows =
      swings.filter(
        (swing) =>
          swing.type === "low" &&
          swing.index < index,
      );

    const latestHigh =
      availableHighs.at(-1);

    const latestLow =
      availableLows.at(-1);

    const volume =
      hasStrongVolume(
        sorted,
        index,
      );

    /*
     * ---------------------------------------------------
     * BULLISH STRUCTURE BREAK
     * ---------------------------------------------------
     */

    if (
      latestHigh &&
      latestHigh.index !==
        brokenHighIndex &&
      candle.close >
        latestHigh.price
    ) {
      const isChoch =
        previousTrend === "bearish";

      if (
        isChoch &&
        volume.confirmed
      ) {
        alerts.push({
          id: createAlertId(
            symbol,
            "BULLISH_CHOCH",
            candle.time,
          ),
          type: "BULLISH_CHOCH",
          symbol,
          time: candle.time,
          price: candle.close,
          level: latestHigh.price,
          volume: candle.volume,
          averageVolume:
            volume.averageVolume,
          volumeRatio:
            volume.volumeRatio,
          message:
            `${symbol} bullish CHOCH confirmed with ${volume.volumeRatio.toFixed(2)}x average volume.`,
        });
      }

      brokenHighIndex =
        latestHigh.index;

      previousTrend = "bullish";
    }

    /*
     * ---------------------------------------------------
     * BEARISH STRUCTURE BREAK
     * ---------------------------------------------------
     */

    if (
      latestLow &&
      latestLow.index !==
        brokenLowIndex &&
      candle.close <
        latestLow.price
    ) {
      const isChoch =
        previousTrend === "bullish";

      if (
        isChoch &&
        volume.confirmed
      ) {
        alerts.push({
          id: createAlertId(
            symbol,
            "BEARISH_CHOCH",
            candle.time,
          ),
          type: "BEARISH_CHOCH",
          symbol,
          time: candle.time,
          price: candle.close,
          level: latestLow.price,
          volume: candle.volume,
          averageVolume:
            volume.averageVolume,
          volumeRatio:
            volume.volumeRatio,
          message:
            `${symbol} bearish CHOCH confirmed with ${volume.volumeRatio.toFixed(2)}x average volume.`,
        });
      }

      brokenLowIndex =
        latestLow.index;

      previousTrend = "bearish";
    }
  }

  return alerts;
}
