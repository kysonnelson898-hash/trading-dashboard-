"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceChartProps {
  symbol: string;
  livePrice?: number | null;
  timeframe: string;
  showStructure: boolean;
  showStructureEvents?: boolean;
  showBollingerBands?: boolean;
}

interface SwingPoint {
  time: number;
  price: number;
  type: "high" | "low";
  index: number;
}

interface StructureEvent {
  time: number;
  price: number;
  type: "BOS" | "CHOCH";
  direction: "bullish" | "bearish";
  startTime: number;
}

function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (price >= 1) {
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  return price.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 8,
  });
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(2)}B`;
  }

  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(2)}M`;
  }

  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(2)}K`;
  }

  return volume.toFixed(0);
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

function determineTrend(
  swings: SwingPoint[],
): string {
  const highs = swings.filter(
    (swing) => swing.type === "high",
  );

  const lows = swings.filter(
    (swing) => swing.type === "low",
  );

  if (highs.length < 2 || lows.length < 2) {
    return "Neutral";
  }

  const previousHigh =
    highs[highs.length - 2];

  const latestHigh =
    highs[highs.length - 1];

  const previousLow =
    lows[lows.length - 2];

  const latestLow =
    lows[lows.length - 1];

  const higherHigh =
    latestHigh.price >
    previousHigh.price;

  const higherLow =
    latestLow.price >
    previousLow.price;

  const lowerHigh =
    latestHigh.price <
    previousHigh.price;

  const lowerLow =
    latestLow.price <
    previousLow.price;

  if (higherHigh && higherLow) {
    return "Bullish";
  }

  if (lowerHigh && lowerLow) {
    return "Bearish";
  }

  if (
    (higherHigh && lowerLow) ||
    (lowerHigh && higherLow)
  ) {
    return "Mixed";
  }

  return "Neutral";
}

function calculateStructureEvents(
  candles: Candle[],
  swings: SwingPoint[],
): StructureEvent[] {
  const events: StructureEvent[] = [];

  if (
    candles.length === 0 ||
    swings.length === 0
  ) {
    return events;
  }

  let brokenHighIndex = -1;
  let brokenLowIndex = -1;

  let previousTrend:
    | "bullish"
    | "bearish"
    | null = null;

  for (
    let candleIndex = 0;
    candleIndex < candles.length;
    candleIndex += 1
  ) {
    const candle = candles[candleIndex];

    const availableHighs =
      swings.filter(
        (swing) =>
          swing.type === "high" &&
          swing.index < candleIndex,
      );

    const availableLows =
      swings.filter(
        (swing) =>
          swing.type === "low" &&
          swing.index < candleIndex,
      );

    const latestHigh =
      availableHighs.at(-1);

    const latestLow =
      availableLows.at(-1);

    if (
      latestHigh &&
      latestHigh.index !== brokenHighIndex &&
      candle.close > latestHigh.price
    ) {
      const direction = "bullish";

      const eventType =
        previousTrend === "bearish"
          ? "CHOCH"
          : "BOS";

      events.push({
        time: candle.time,
        price: latestHigh.price,
        type: eventType,
        direction,
        startTime: latestHigh.time,
      });

      brokenHighIndex =
        latestHigh.index;

      previousTrend = direction;
    }

    if (
      latestLow &&
      latestLow.index !== brokenLowIndex &&
      candle.close < latestLow.price
    ) {
      const direction = "bearish";

      const eventType =
        previousTrend === "bullish"
          ? "CHOCH"
          : "BOS";

      events.push({
        time: candle.time,
        price: latestLow.price,
        type: eventType,
        direction,
        startTime: latestLow.time,
      });

      brokenLowIndex =
        latestLow.index;

      previousTrend = direction;
    }
  }

  return events;
}

function getDailyRanges(
  candles: Candle[],
) {
  const ranges: Array<{
    start: number;
    end: number;
    high: number;
    low: number;
  }> = [];

  if (candles.length === 0) {
    return ranges;
  }

  let currentDay =
    Math.floor(
      candles[0].time / 86400,
    );

  let dayStart =
    candles[0].time;

  let high =
    candles[0].high;

  let low =
    candles[0].low;

  for (
    let index = 1;
    index < candles.length;
    index += 1
  ) {
    const candle = candles[index];

    const candleDay =
      Math.floor(
        candle.time / 86400,
      );

    if (candleDay !== currentDay) {
      ranges.push({
        start: dayStart,
        end: candles[index - 1].time,
        high,
        low,
      });

      currentDay = candleDay;
      dayStart = candle.time;
      high = candle.high;
      low = candle.low;

      continue;
    }

    high = Math.max(
      high,
      candle.high,
    );

    low = Math.min(
      low,
      candle.low,
    );
  }

  ranges.push({
    start: dayStart,
    end: candles.at(-1)!.time,
    high,
    low,
  });

  return ranges;
}

function getVolumeBaseline(
  candles: Candle[],
  index: number,
  lookback = 20,
): number {
  const start = Math.max(
    0,
    index - lookback,
  );

  const values = candles
    .slice(start, index)
    .map((candle) => candle.volume)
    .filter(
      (volume) =>
        Number.isFinite(volume) &&
        volume >= 0,
    );

  if (values.length === 0) {
    return 0;
  }

  return (
    values.reduce(
      (sum, value) => sum + value,
      0,
    ) / values.length
  );
}

export default function PriceChart({
  symbol,
  livePrice = null,
  timeframe,
  showStructure,
  showStructureEvents = false,
  showBollingerBands = false,
}: PriceChartProps) {
  const containerRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const chartRef =
    useRef<IChartApi | null>(null);

  const hasInitialFitRef = useRef(false);

  const refreshInProgressRef = useRef(false);

  const candleSeriesRef =
    useRef<ISeriesApi<"Candlestick"> | null>(
      null,
    );

  const livePriceLineRef =
    useRef<ReturnType<
      ISeriesApi<"Candlestick">["createPriceLine"]
    > | null>(null);

  const volumeSeriesRef =
    useRef<ISeriesApi<"Histogram"> | null>(
      null,
    );

  const structureSeriesRef =
    useRef<ISeriesApi<"Line">[]>([]);

  const structureEventSeriesRef =
    useRef<ISeriesApi<"Line">[]>([]);

  const bollingerSeriesRef =
    useRef<ISeriesApi<"Line">[]>([]);

  const [candles, setCandles] =
    useState<Candle[]>([]);

  const [error, setError] =
    useState<string | null>(null);

  const [trend, setTrend] =
    useState("Neutral");

  const [loading, setLoading] =
    useState(true);

  const [candleCountdown, setCandleCountdown] =
    useState("--:--:--");

  const [localTime, setLocalTime] =
    useState("--:--:--");

  const [sessionStatus, setSessionStatus] =
    useState({
      Sydney: false,
      Tokyo: false,
      London: false,
      "New York": false,
    });

  useEffect(() => {
    const sessions = [
      {
        name: "Sydney",
        timeZone: "Australia/Sydney",
        open: 8,
        close: 17,
      },
      {
        name: "Tokyo",
        timeZone: "Asia/Tokyo",
        open: 9,
        close: 18,
      },
      {
        name: "London",
        timeZone: "Europe/London",
        open: 8,
        close: 17,
      },
      {
        name: "New York",
        timeZone: "America/New_York",
        open: 8,
        close: 17,
      },
    ] as const;

    const updateMarketClock = () => {
      const now = new Date();

      setLocalTime(
        new Intl.DateTimeFormat(
          undefined,
          {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          },
        ).format(now),
      );

      const nextStatus = {
        Sydney: false,
        Tokyo: false,
        London: false,
        "New York": false,
      };

      for (const session of sessions) {
        const parts = new Intl.DateTimeFormat(
          "en-US",
          {
            timeZone: session.timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          },
        ).formatToParts(now);

        const hour = Number(
          parts.find(
            (part) => part.type === "hour",
          )?.value ?? 0,
        );

        const minute = Number(
          parts.find(
            (part) => part.type === "minute",
          )?.value ?? 0,
        );

        const currentMinutes =
          hour * 60 + minute;

        nextStatus[session.name] =
          currentMinutes >= session.open * 60 &&
          currentMinutes < session.close * 60;
      }

      setSessionStatus(nextStatus);
    };

    updateMarketClock();

    const interval =
      window.setInterval(
        updateMarketClock,
        1000,
      );

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCandles() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/market/candles?symbol=${encodeURIComponent(
            symbol,
          )}&interval=${encodeURIComponent(
            timeframe,
          )}&limit=200`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            "Unable to load chart data",
          );
        }

        const data: Candle[] =
          await response.json();

        if (cancelled) {
          return;
        }

        if (
          !Array.isArray(data) ||
          data.length === 0
        ) {
          throw new Error(
            "No chart data returned",
          );
        }

        const sorted =
          data
            .filter(
              (candle) =>
                Number.isFinite(
                  candle.time,
                ) &&
                Number.isFinite(
                  candle.open,
                ) &&
                Number.isFinite(
                  candle.high,
                ) &&
                Number.isFinite(
                  candle.low,
                ) &&
                Number.isFinite(
                  candle.close,
                ) &&
                Number.isFinite(
                  candle.volume,
                ) &&
                candle.volume >= 0,
            )
            .sort(
              (a, b) =>
                a.time - b.time,
            );

        if (sorted.length === 0) {
          throw new Error(
            "No valid chart data returned",
          );
        }

        setCandles(sorted);

        const swings =
          getSwingPoints(sorted);

        setTrend(
          determineTrend(swings),
        );
      } catch (loadError) {
        console.error(
          "Price chart error:",
          loadError,
        );

        if (!cancelled) {
          setError(
            "Chart data unavailable",
          );

          setCandles([]);
          setTrend("Neutral");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCandles();

    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  /*
   * Create the chart once.
   *
   * Pane 0:
   *   Price + M1 + M2
   *
   * Pane 1:
   *   Dedicated volume
   */

  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) {
      return;
    }

    const chart = createChart(
      container,
      {
        width: container.clientWidth,
        height: 700,

        layout: {
          background: {
            type: ColorType.Solid,
            color: "#000000",
          },

          textColor: "#ffffff",

          panes: {
            separatorColor:
              "rgba(255,0,0,0.22)",
            separatorHoverColor:
              "rgba(255,0,0,0.38)",
            enableResize: true,
          },
        },

        grid: {
          vertLines: {
            color:
              "rgba(255,255,255,0.035)",
          },

          horzLines: {
            color:
              "rgba(255,255,255,0.035)",
          },
        },

        crosshair: {
          vertLine: {
            color:
              "rgba(255,0,0,0.35)",
            width: 1,
            style: 2,
            labelBackgroundColor:
              "#700000",
          },

          horzLine: {
            color:
              "rgba(255,0,0,0.35)",
            width: 1,
            style: 2,
            labelBackgroundColor:
              "#700000",
          },
        },

        rightPriceScale: {
          borderColor:
            "rgba(255,0,0,0.35)",
          textColor: "#ffffff",
        },

        timeScale: {
          borderColor:
            "rgba(255,0,0,0.35)",
          timeVisible: true,
          secondsVisible: false,
        },

        localization: {
          priceFormatter: (
            price: number,
          ) => formatPrice(price),
        },
      },
    );

    const candleSeries =
      chart.addSeries(
        CandlestickSeries,
        {
          upColor: "#ffffff",
          downColor: "#b00000",
          borderUpColor: "#ffffff",
          borderDownColor: "#b00000",
          wickUpColor: "#ffffff",
          wickDownColor: "#b00000",
          priceLineVisible: true,
          lastValueVisible: true,
        },
        0,
      );

    const volumeSeries =
      chart.addSeries(
        HistogramSeries,
        {
          priceFormat: {
            type: "volume",
          },

          priceScaleId: "volume",

          base: 0,

          lastValueVisible: false,
          priceLineVisible: false,
        },
        1,
      );

    volumeSeries
      .priceScale()
      .applyOptions({
        scaleMargins: {
          top: 0.08,
          bottom: 0.02,
        },
      });

    chartRef.current = chart;

    candleSeriesRef.current =
      candleSeries;

    volumeSeriesRef.current =
      volumeSeries;

    const panes =
      chart.panes();

    if (panes[0]) {
      panes[0].setHeight(540);
    }

    if (panes[1]) {
      panes[1].setHeight(150);
    }

    const resizeObserver =
      new ResizeObserver(() => {
        const currentContainer =
          containerRef.current;

        if (!currentContainer) {
          return;
        }

        chart.applyOptions({
          width:
            currentContainer.clientWidth,
        });
      });

    resizeObserver.observe(
      container,
    );

    return () => {
      resizeObserver.disconnect();

      chart.remove();

      chartRef.current = null;

      candleSeriesRef.current =
        null;

      volumeSeriesRef.current =
        null;

      structureSeriesRef.current = [];

      structureEventSeriesRef.current =
        [];
    };
  }, []);

  /*
   * Keep a horizontal live-price line on forex and index charts.
   * Replace only the price line when a new tick arrives.
   */
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;

    if (!candleSeries) {
      return;
    }

    const isCrypto = symbol.includes("/");

    if (
      isCrypto ||
      typeof livePrice !== "number" ||
      !Number.isFinite(livePrice) ||
      livePrice <= 0
    ) {
      if (livePriceLineRef.current) {
        candleSeries.removePriceLine(
          livePriceLineRef.current,
        );
        livePriceLineRef.current = null;
      }

      return;
    }

    if (livePriceLineRef.current) {
      candleSeries.removePriceLine(
        livePriceLineRef.current,
      );
      livePriceLineRef.current = null;
    }

    livePriceLineRef.current =
      candleSeries.createPriceLine({
        price: livePrice,
        color: "#00d084",
        lineWidth: 1,
        axisLabelVisible: true,
        title: "LIVE",
      });
  }, [livePrice, symbol]);

  /*
   * Update price candles and volume.
   */

  /*
   * Candle countdown.
   *
   * The latest candle timestamp represents
   * the candle's opening time. The countdown
   * runs until that candle's timeframe closes.
   */
  useEffect(() => {
    if (candles.length === 0) {
      setCandleCountdown("--:--:--");
      return;
    }

    const timeframeSeconds: Record<
      string,
      number
    > = {
      "1m": 60,
      "30m": 30 * 60,
      "1H": 60 * 60,
      "4H": 4 * 60 * 60,
    };

    const duration =
      timeframeSeconds[timeframe];

    if (!duration) {
      setCandleCountdown("--:--:--");
      return;
    }

    const refreshCandles = async () => {
      if (refreshInProgressRef.current) {
        return;
      }

      refreshInProgressRef.current = true;

      try {
        const response = await fetch(
          `/api/market/candles?symbol=${encodeURIComponent(
            symbol,
          )}&interval=${encodeURIComponent(
            timeframe,
          )}&limit=200`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            "Unable to refresh chart data",
          );
        }

        const data: Candle[] =
          await response.json();

        const sorted =
          data
            .filter(
              (candle) =>
                Number.isFinite(
                  candle.time,
                ) &&
                Number.isFinite(
                  candle.open,
                ) &&
                Number.isFinite(
                  candle.high,
                ) &&
                Number.isFinite(
                  candle.low,
                ) &&
                Number.isFinite(
                  candle.close,
                ) &&
                Number.isFinite(
                  candle.volume,
                ) &&
                candle.volume >= 0,
            )
            .sort(
              (a, b) =>
                a.time - b.time,
            );

        if (sorted.length > 0) {
          const candlesChanged =
            sorted.length !== candles.length ||
            sorted.some((candle, index) => {
              const previous = candles[index];

              return (
                !previous ||
                candle.time !== previous.time ||
                candle.open !== previous.open ||
                candle.high !== previous.high ||
                candle.low !== previous.low ||
                candle.close !== previous.close ||
                candle.volume !== previous.volume
              );
            });

          if (candlesChanged) {
            setCandles(sorted);

            const swings =
              getSwingPoints(sorted);

            setTrend(
              determineTrend(swings),
            );
          }
        }
      } catch (refreshError) {
        console.error(
          "Candle refresh error:",
          refreshError,
        );
      } finally {
        refreshInProgressRef.current = false;
      }
    };

    const updateCountdown = () => {
      const latestCandleTime =
        Number(candles.at(-1)!.time);

      const candleCloseTime =
        latestCandleTime + duration;

      const remaining =
        candleCloseTime -
        Math.floor(Date.now() / 1000);

      if (remaining <= 0) {
        setCandleCountdown(
          "00:00:00",
        );

        void refreshCandles();

        return;
      }

      const hours = Math.floor(
        remaining / 3600,
      );

      const minutes = Math.floor(
        (remaining % 3600) / 60,
      );

      const seconds =
        remaining % 60;

      setCandleCountdown(
        [
          String(hours).padStart(2, "0"),
          String(minutes).padStart(2, "0"),
          String(seconds).padStart(2, "0"),
        ].join(":"),
      );
    };

    updateCountdown();

    const interval = window.setInterval(
      updateCountdown,
      1000,
    );

    const refreshInterval = window.setInterval(
      () => {
        void refreshCandles();
      },
      5000,
    );

    return () => {
      window.clearInterval(interval);
      window.clearInterval(refreshInterval);
    };
  }, [
    candles,
    timeframe,
    symbol,
  ]);

  useEffect(() => {
    const chart =
      chartRef.current;

    const candleSeries =
      candleSeriesRef.current;

    const volumeSeries =
      volumeSeriesRef.current;

    if (
      !chart ||
      !candleSeries ||
      !volumeSeries ||
      candles.length === 0
    ) {
      return;
    }

    candleSeries.setData(
      candles.map((candle) => ({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );

    /*
     * M3 Bollinger Bands:
     *
     * - 20-period moving average
     * - Upper band = average + 2 standard deviations
     * - Lower band = average - 2 standard deviations
     * - Only displayed on the 3-minute timeframe
     */

    bollingerSeriesRef.current.forEach(
      (series) => {
        try {
          chart.removeSeries(series);
        } catch {
          // Already removed
        }
      },
    );

    bollingerSeriesRef.current = [];

    if (
      showBollingerBands === true &&
      candles.length >= 20
    ) {
      const period = 20;
      const multiplier = 2;

      const upperSeries =
        chart.addSeries(
          LineSeries,
          {
            color: "#39ff14",
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          0,
        );

      const middleSeries =
        chart.addSeries(
          LineSeries,
          {
            color:
              "rgba(255,255,255,0.65)",
            lineWidth: 1,
            lineStyle: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          0,
        );

      const lowerSeries =
        chart.addSeries(
          LineSeries,
          {
            color: "#ff1744",
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          0,
        );

      const upperData: Array<{
        time: Time;
        value: number;
      }> = [];

      const middleData: Array<{
        time: Time;
        value: number;
      }> = [];

      const lowerData: Array<{
        time: Time;
        value: number;
      }> = [];

      for (
        let index = period - 1;
        index < candles.length;
        index += 1
      ) {
        const window =
          candles.slice(
            index - period + 1,
            index + 1,
          );

        const mean =
          window.reduce(
            (sum, candle) =>
              sum + candle.close,
            0,
          ) / period;

        const variance =
          window.reduce(
            (sum, candle) =>
              sum +
              Math.pow(
                candle.close - mean,
                2,
              ),
            0,
          ) / period;

        const standardDeviation =
          Math.sqrt(variance);

        upperData.push({
          time:
            candles[index].time as Time,
          value:
            mean +
            multiplier *
              standardDeviation,
        });

        middleData.push({
          time:
            candles[index].time as Time,
          value: mean,
        });

        lowerData.push({
          time:
            candles[index].time as Time,
          value:
            mean -
            multiplier *
              standardDeviation,
        });
      }

      upperSeries.setData(
        upperData,
      );

      middleSeries.setData(
        middleData,
      );

      lowerSeries.setData(
        lowerData,
      );

      bollingerSeriesRef.current = [
        upperSeries,
        middleSeries,
        lowerSeries,
      ];
    }

    /*
     * Volume quality model:
     *
     * - White = bullish candle
     * - Red = bearish candle
     * - Stronger white/red = elevated volume
     * - Very strong white/red = volume spike
     *
     * The comparison is against the previous 20 candles,
     * so the current candle does not inflate its own baseline.
     */

    volumeSeries.setData(
      candles.map(
        (candle, index) => {
          const baseline =
            getVolumeBaseline(
              candles,
              index,
              20,
            );

          const ratio =
            baseline > 0
              ? candle.volume /
                baseline
              : 1;

          const bullish =
            candle.close >=
            candle.open;

          let color: string;

          if (bullish) {
            if (ratio >= 2) {
              color =
                "rgba(255,255,255,1)";
            } else if (ratio >= 1.35) {
              color =
                "rgba(255,255,255,0.88)";
            } else {
              color =
                "rgba(255,255,255,0.48)";
            }
          } else {
            if (ratio >= 2) {
              color =
                "rgba(255,0,0,1)";
            } else if (ratio >= 1.35) {
              color =
                "rgba(255,0,0,0.88)";
            } else {
              color =
                "rgba(176,0,0,0.52)";
            }
          }

          return {
            time:
              candle.time as Time,
            value: candle.volume,
            color,
          };
        },
      ),
    );

    if (!hasInitialFitRef.current) {
      chart.timeScale().fitContent();
      hasInitialFitRef.current = true;
    }
  }, [candles, timeframe, showBollingerBands]);

  /*
   * M1 + M2 overlay management.
   *
   * Every time candles or either toggle changes,
   * remove the old overlay series first.
   */

  useEffect(() => {
    const chart =
      chartRef.current;

    const candleSeries =
      candleSeriesRef.current;

    const chartContainer =
      containerRef.current;

    if (
      !chart ||
      !candleSeries ||
      !chartContainer
    ) {
      return;
    }

    /*
     * Remove every previous M1 series.
     */

    structureSeriesRef.current.forEach(
      (series) => {
        try {
          chart.removeSeries(
            series,
          );
        } catch {
          // Series may already have been removed
        }
      },
    );

    structureSeriesRef.current = [];

    /*
     * Remove every previous M2 series.
     */

    structureEventSeriesRef.current.forEach(
      (series) => {
        try {
          chart.removeSeries(
            series,
          );
        } catch {
          // Series may already have been removed
        }
      },
    );

    structureEventSeriesRef.current =
      [];

    /*
     * Remove all M2 HTML labels.
     */

    const oldOverlays =
      chartContainer.querySelectorAll(
        "[data-price-chart-overlay]",
      );

    oldOverlays.forEach(
      (element) =>
        element.remove(),
    );

    if (candles.length === 0) {
      return;
    }

    const swings =
      getSwingPoints(candles);

    setTrend(
      determineTrend(swings),
    );

    const lineOptions = {
      lineWidth: 1 as const,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    };

    /*
     * =====================================================
     * M1 — SUPPORT / RESISTANCE / DAILY BOXES
     * =====================================================
     */

    if (showStructure) {
      const dailyRanges =
        getDailyRanges(candles);

      /*
       * Daily high/low boxes.
       *
       * High = white
       * Low = red
       * Vertical edges = faint white
       */

      dailyRanges.forEach(
        (range) => {
          const leftVerticalEnd =
            range.start + 1;

          const rightVerticalStart =
            Math.max(
              range.end,
              range.start + 1,
            );

          const rightVerticalEnd =
            rightVerticalStart + 1;

          const horizontalEnd =
            rightVerticalStart;

          /*
           * Daily HIGH
           */

          const highSeries =
            chart.addSeries(
              LineSeries,
              {
                ...lineOptions,
                color:
                  "rgba(255,255,255,0.9)",
                lineStyle: 0,
              },
              0,
            );

          highSeries.setData([
            {
              time:
                range.start as Time,
              value: range.high,
            },
            {
              time:
                horizontalEnd as Time,
              value: range.high,
            },
          ]);

          structureSeriesRef.current.push(
            highSeries,
          );

          /*
           * Daily LOW
           */

          const lowSeries =
            chart.addSeries(
              LineSeries,
              {
                ...lineOptions,
                color:
                  "rgba(255,0,0,0.9)",
                lineStyle: 0,
              },
              0,
            );

          lowSeries.setData([
            {
              time:
                range.start as Time,
              value: range.low,
            },
            {
              time:
                horizontalEnd as Time,
              value: range.low,
            },
          ]);

          structureSeriesRef.current.push(
            lowSeries,
          );

          /*
           * LEFT EDGE
           */

          const leftSeries =
            chart.addSeries(
              LineSeries,
              {
                ...lineOptions,
                color:
                  "rgba(255,255,255,0.22)",
                lineStyle: 0,
              },
              0,
            );

          leftSeries.setData([
            {
              time:
                range.start as Time,
              value: range.low,
            },
            {
              time:
                leftVerticalEnd as Time,
              value: range.high,
            },
          ]);

          structureSeriesRef.current.push(
            leftSeries,
          );

          /*
           * RIGHT EDGE
           */

          const rightSeries =
            chart.addSeries(
              LineSeries,
              {
                ...lineOptions,
                color:
                  "rgba(255,255,255,0.22)",
                lineStyle: 0,
              },
              0,
            );

          rightSeries.setData([
            {
              time:
                rightVerticalStart as Time,
              value: range.low,
            },
            {
              time:
                rightVerticalEnd as Time,
              value: range.high,
            },
          ]);

          structureSeriesRef.current.push(
            rightSeries,
          );
        },
      );

      /*
       * Recent resistance levels.
       *
       * SOLID RED
       */

      const recentHighs =
        swings
          .filter(
            (swing) =>
              swing.type === "high",
          )
          .slice(-3);

      recentHighs.forEach(
        (swing) => {
          const lastCandle =
            candles.at(-1)!;

          const endTime =
            Math.max(
              lastCandle.time,
              swing.time + 1,
            );

          const resistanceSeries =
            chart.addSeries(
              LineSeries,
              {
                ...lineOptions,
                color:
                  "#ff0000",
                lineStyle: 0,
                lineWidth: 2,
              },
              0,
            );

          resistanceSeries.setData([
            {
              time:
                swing.time as Time,
              value: swing.price,
            },
            {
              time:
                endTime as Time,
              value: swing.price,
            },
          ]);

          structureSeriesRef.current.push(
            resistanceSeries,
          );
        },
      );

      /*
       * Recent support levels.
       *
       * SOLID BLUE
       */

      const recentLows =
        swings
          .filter(
            (swing) =>
              swing.type === "low",
          )
          .slice(-3);

      recentLows.forEach(
        (swing) => {
          const lastCandle =
            candles.at(-1)!;

          const endTime =
            Math.max(
              lastCandle.time,
              swing.time + 1,
            );

          const supportSeries =
            chart.addSeries(
              LineSeries,
              {
                ...lineOptions,
                color:
                  "#0066ff",
                lineStyle: 0,
                lineWidth: 2,
              },
              0,
            );

          supportSeries.setData([
            {
              time:
                swing.time as Time,
              value: swing.price,
            },
            {
              time:
                endTime as Time,
              value: swing.price,
            },
          ]);

          structureSeriesRef.current.push(
            supportSeries,
          );
        },
      );
    }

    /*
     * =====================================================
     * M2 — BOS / CHOCH
     * =====================================================
     */

    if (showStructureEvents) {
      const events =
        calculateStructureEvents(
          candles,
          swings,
        );

      events.forEach(
        (event) => {
          /*
           * BOS / CHOCH line.
           *
           * Thin.
           * Solid.
           * Gray.
           */

          const lineSeries =
            chart.addSeries(
              LineSeries,
              {
                ...lineOptions,
                color:
                  "rgba(155,155,155,0.85)",
                lineStyle: 0,
                lineWidth: 1,
              },
              0,
            );

          const endTime =
            Math.max(
              event.time,
              event.startTime + 1,
            );

          lineSeries.setData([
            {
              time:
                event.startTime as Time,
              value: event.price,
            },
            {
              time:
                endTime as Time,
              value: event.price,
            },
          ]);

          structureEventSeriesRef.current.push(
            lineSeries,
          );

          /*
           * BOS / CHOCH label.
           */

          const label =
            document.createElement(
              "div",
            );

          label.dataset.priceChartOverlay =
            "true";

          label.dataset.eventTime =
            String(event.time);

          label.dataset.eventPrice =
            String(event.price);

          label.textContent =
            event.type;

          label.style.position =
            "absolute";

          label.style.pointerEvents =
            "none";

          label.style.zIndex =
            "30";

          label.style.padding =
            "1px 5px";

          label.style.background =
            "#050505";

          label.style.border =
            "1px solid rgba(150,150,150,0.75)";

          label.style.color =
            "#b8b8b8";

          label.style.fontFamily =
            '"Courier New", monospace';

          label.style.fontSize =
            "9px";

          label.style.fontWeight =
            "700";

          label.style.lineHeight =
            "12px";

          label.style.letterSpacing =
            "0.12em";

          label.style.whiteSpace =
            "nowrap";

          label.style.transform =
            "translate(-50%, -100%)";

          chartContainer.appendChild(
            label,
          );
        },
      );
    }

    /*
     * Position M2 labels whenever the chart
     * is scrolled or resized.
     */

    const updateEventLabels =
      () => {
        const labels =
          chartContainer.querySelectorAll<HTMLElement>(
            "[data-price-chart-overlay]",
          );

        labels.forEach(
          (label) => {
            const eventTime =
              Number(
                label.dataset.eventTime,
              );

            const eventPrice =
              Number(
                label.dataset.eventPrice,
              );

            const timeCoordinate =
              chart
                .timeScale()
                .timeToCoordinate(
                  eventTime as Time,
                );

            const priceCoordinate =
              candleSeries.priceToCoordinate(
                eventPrice,
              );

            if (
              timeCoordinate === null ||
              priceCoordinate === null
            ) {
              label.style.display =
                "none";

              return;
            }

            label.style.display =
              "block";

            label.style.left =
              `${timeCoordinate}px`;

            label.style.top =
              `${priceCoordinate}px`;
          },
        );
      };

    updateEventLabels();

    chart
      .timeScale()
      .subscribeVisibleTimeRangeChange(
        updateEventLabels,
      );

    return () => {
      chart
        .timeScale()
        .unsubscribeVisibleTimeRangeChange(
          updateEventLabels,
        );

      structureSeriesRef.current.forEach(
        (series) => {
          try {
            chart.removeSeries(
              series,
            );
          } catch {
            // Already removed
          }
        },
      );

      structureSeriesRef.current = [];

      structureEventSeriesRef.current.forEach(
        (series) => {
          try {
            chart.removeSeries(
              series,
            );
          } catch {
            // Already removed
          }
        },
      );

      structureEventSeriesRef.current =
        [];

      const overlays =
        chartContainer.querySelectorAll(
          "[data-price-chart-overlay]",
        );

      overlays.forEach(
        (element) =>
          element.remove(),
      );
    };
  }, [
    candles,
    showStructure,
    showStructureEvents,
  ]);

  const stochasticData = (() => {
    const period = 14;
    const smooth = 3;

    if (candles.length < period) {
      return {
        k: [],
        d: [],
        currentK: null,
        currentD: null,
      };
    }

    const kValues: Array<{
      time: number;
      value: number;
    }> = [];

    for (
      let index = period - 1;
      index < candles.length;
      index += 1
    ) {
      const window = candles.slice(
        index - period + 1,
        index + 1,
      );

      const highestHigh = Math.max(
        ...window.map(
          (candle) => candle.high,
        ),
      );

      const lowestLow = Math.min(
        ...window.map(
          (candle) => candle.low,
        ),
      );

      const range =
        highestHigh - lowestLow;

      const value =
        range === 0
          ? 50
          : ((candles[index].close -
              lowestLow) /
              range) *
            100;

      kValues.push({
        time: candles[index].time,
        value: Math.max(
          0,
          Math.min(100, value),
        ),
      });
    }

    const dValues: Array<{
      time: number;
      value: number;
    }> = [];

    for (
      let index = smooth - 1;
      index < kValues.length;
      index += 1
    ) {
      const window = kValues.slice(
        index - smooth + 1,
        index + 1,
      );

      const average =
        window.reduce(
          (sum, item) =>
            sum + item.value,
          0,
        ) / window.length;

      dValues.push({
        time: kValues[index].time,
        value: average,
      });
    }

    const visibleK = kValues.slice(-60);
    const visibleD = dValues.slice(-60);

    return {
      k: visibleK,
      d: visibleD,
      currentK:
        kValues.at(-1)?.value ?? null,
      currentD:
        dValues.at(-1)?.value ?? null,
    };
  })();

  const stochasticBullish =
    stochasticData.currentK !== null &&
    stochasticData.currentD !== null &&
    stochasticData.currentK >
      stochasticData.currentD;

  const stochasticStatus =
    stochasticData.currentK === null
      ? "WAITING"
      : stochasticBullish
        ? "BULLISH"
        : "BEARISH";

  const stochasticPoints = (
    values: Array<{
      time: number;
      value: number;
    }>,
  ) => {
    if (values.length === 0) {
      return "";
    }

    const firstTime =
      values[0].time;

    const lastTime =
      values.at(-1)!.time;

    const timeRange =
      lastTime - firstTime || 1;

    return values
      .map((item) => {
        const x =
          ((item.time - firstTime) /
            timeRange) *
          100;

        const y =
          100 -
          item.value;

        return `${x},${y}`;
      })
      .join(" ");
  };

  return (
    <section className="border border-red-900/60 bg-black">
      <div className="flex items-center justify-between border-b border-red-900/60 bg-black px-5 py-3">
        <div>
          <h3 className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-white">
            Price Chart
          </h3>

          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-red-700">
            {symbol} / {timeframe}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(
              [
                ["Sydney", sessionStatus.Sydney],
                ["Tokyo", sessionStatus.Tokyo],
                ["London", sessionStatus.London],
                ["New York", sessionStatus["New York"]],
              ] as const
            ).map(([name, live]) => (
              <span
                key={name}
                className={`flex items-center gap-1.5 border px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.1em] ${
                  live
                    ? "border-[#39ff14]/40 bg-[#39ff14]/5 text-[#39ff14]"
                    : "border-red-950 bg-black text-red-800"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 ${
                    live
                      ? "bg-[#39ff14] shadow-[0_0_7px_#39ff14]"
                      : "bg-red-950"
                  }`}
                />
                {name}
                {live ? " LIVE" : " CLOSED"}
              </span>
            ))}
          </div>

          <div className="hidden text-right md:block">
            <div className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-red-700">
              Local Time
            </div>
            <div className="font-mono text-sm font-bold tracking-[0.12em] text-[#39ff14]">
              {localTime}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-red-700">
                Candle Close
              </div>
              <div className="font-mono text-sm font-bold tracking-[0.12em] text-[#39ff14]">
                {candleCountdown}
              </div>
            </div>

            <div className="hidden items-center gap-3 md:flex">
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-blue-500">
              <span className="h-2 w-2 bg-blue-600" />
              Support
            </span>

            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-red-500">
              <span className="h-2 w-2 bg-red-600" />
              Resistance
            </span>

            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-gray-500">
              <span className="h-2 w-2 bg-gray-500" />
              BOS / CHOCH
            </span>
          </div>

          </div>

          <span
            className={`font-mono text-[9px] font-bold uppercase tracking-[0.15em] ${
              trend === "Bullish"
                ? "text-white"
                : trend === "Bearish"
                  ? "text-red-500"
                  : "text-gray-500"
            }`}
          >
            TREND: {trend}
          </span>
        </div>
      </div>

      <div className="relative bg-black">
        {loading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-red-700">
              Loading market data...
            </span>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-red-500">
              {error}
            </span>
          </div>
        )}

        <div
          ref={containerRef}
          className="h-[700px] w-full"
        />
      </div>

      <div className="border-t border-red-900/60 bg-black px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white">
              Stochastic
            </span>

            <span className="ml-2 font-mono text-[8px] uppercase tracking-[0.12em] text-red-800">
              14,3,3
            </span>
          </div>

          <div className="flex items-center gap-4 font-mono text-[8px] font-bold uppercase tracking-[0.12em]">
            <span
              className={
                stochasticStatus === "BULLISH"
                  ? "text-[#39ff14] shadow-[0_0_8px_rgba(57,255,20,0.45)]"
                  : stochasticStatus === "BEARISH"
                    ? "text-red-500"
                    : "text-gray-600"
              }
            >
              {stochasticStatus}
            </span>

            <span className="text-gray-500">
              K{" "}
              {stochasticData.currentK === null
                ? "--"
                : stochasticData.currentK.toFixed(1)}
            </span>

            <span className="text-gray-500">
              D{" "}
              {stochasticData.currentD === null
                ? "--"
                : stochasticData.currentD.toFixed(1)}
            </span>
          </div>
        </div>

        <div className="relative h-[150px] w-full overflow-hidden border border-red-950 bg-[#050505]">
          <div className="pointer-events-none absolute inset-x-0 top-[17%] border-t border-red-500/50" />
          <div className="pointer-events-none absolute inset-x-0 top-[80%] border-t border-[#39ff14]/40" />

          <div className="pointer-events-none absolute right-2 top-[12%] font-mono text-[8px] font-bold text-red-500">
            83
          </div>

          <div className="pointer-events-none absolute right-2 top-[75%] font-mono text-[8px] font-bold text-[#39ff14]">
            20
          </div>

          {stochasticData.k.length > 0 ? (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              aria-label="Stochastic oscillator"
            >
              <polyline
                points={stochasticPoints(
                  stochasticData.k,
                )}
                fill="none"
                stroke={
                  stochasticBullish
                    ? "#39ff14"
                    : "#ff1744"
                }
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />

              <polyline
                points={stochasticPoints(
                  stochasticData.d,
                )}
                fill="none"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth="0.8"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-[9px] uppercase tracking-[0.15em] text-red-800">
              Waiting for stochastic data...
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-red-900/60 bg-black">
        <div className="border-r border-red-900/60 px-4 py-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-red-800">
            Market
          </span>

          <div className="mt-1 font-mono text-xs text-white">
            {symbol}
          </div>
        </div>

        <div className="px-4 py-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-red-800">
            Structure
          </span>

          <div className="mt-1 font-mono text-xs text-white">
            {trend}
          </div>
        </div>
      </div>
    </section>
  );
}
