"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

interface ApiCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceChartProps {
  symbol: string;
  timeframe: string;
}

interface DailyLevel {
  date: string;
  startTime: number;
  endTime: number;
  high: number;
  low: number;
}

function getDateKey(timestamp: number): string {
  return new Date(timestamp * 1000)
    .toISOString()
    .slice(0, 10);
}

function getEndOfDay(timestamp: number): number {
  const date = new Date(timestamp * 1000);

  date.setUTCHours(23, 59, 59, 0);

  return Math.floor(date.getTime() / 1000);
}

function calculateDailyLevels(
  candles: ApiCandle[],
): DailyLevel[] {
  const levels = new Map<
    string,
    {
      startTime: number;
      endTime: number;
      high: number;
      low: number;
    }
  >();

  for (const candle of candles) {
    const date = getDateKey(candle.time);
    const existing = levels.get(date);

    if (!existing) {
      levels.set(date, {
        startTime: candle.time,
        endTime: getEndOfDay(candle.time),
        high: candle.high,
        low: candle.low,
      });

      continue;
    }

    existing.startTime = Math.min(
      existing.startTime,
      candle.time,
    );

    existing.high = Math.max(
      existing.high,
      candle.high,
    );

    existing.low = Math.min(
      existing.low,
      candle.low,
    );
  }

  return Array.from(levels.entries()).map(
    ([date, values]) => ({
      date,
      startTime: values.startTime,
      endTime: values.endTime,
      high: values.high,
      low: values.low,
    }),
  );
}

export default function PriceChart({
  symbol,
  timeframe,
}: PriceChartProps) {
  const chartContainerRef =
    useRef<HTMLDivElement | null>(null);

  const chartRef =
    useRef<IChartApi | null>(null);

  const seriesRef =
    useRef<ISeriesApi<"Candlestick"> | null>(null);

  const highSeriesRef =
    useRef<ISeriesApi<"Line"> | null>(null);

  const lowSeriesRef =
    useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) {
      return;
    }

    const chart = createChart(
      chartContainerRef.current,
      {
        layout: {
          background: {
            type: ColorType.Solid,
            color: "#020617",
          },
          textColor: "#94a3b8",
        },

        grid: {
          vertLines: {
            color: "#1e293b",
          },
          horzLines: {
            color: "#1e293b",
          },
        },

        width:
          chartContainerRef.current.clientWidth,

        height: 450,

        rightPriceScale: {
          borderColor: "#334155",
        },

        timeScale: {
          borderColor: "#334155",
          timeVisible: true,
          secondsVisible: false,
        },
      },
    );

    const series = chart.addSeries(
      CandlestickSeries,
      {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      },
    );

    const highSeries = chart.addSeries(
      LineSeries,
      {
        color: "#22c55e",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
    );

    const lowSeries = chart.addSeries(
      LineSeries,
      {
        color: "#ef4444",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
    );

    chartRef.current = chart;
    seriesRef.current = series;
    highSeriesRef.current = highSeries;
    lowSeriesRef.current = lowSeries;

    async function loadCandles() {
      try {
        const response = await fetch(
          `/api/market/candles?symbol=${encodeURIComponent(
            symbol,
          )}&interval=${encodeURIComponent(
            timeframe,
          )}&limit=500`,
        );

        if (!response.ok) {
          throw new Error(
            "Unable to load candle data",
          );
        }

        const data: ApiCandle[] =
          await response.json();

        const candles: CandlestickData<Time>[] =
          data.map((candle) => ({
            time: candle.time as Time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          }));

        series.setData(candles);

        const dailyLevels =
          calculateDailyLevels(data);

        const highLineData = dailyLevels.flatMap(
          (level) => [
            {
              time: level.startTime as Time,
              value: level.high,
            },
            {
              time: level.endTime as Time,
              value: level.high,
            },
          ],
        );

        const lowLineData = dailyLevels.flatMap(
          (level) => [
            {
              time: level.startTime as Time,
              value: level.low,
            },
            {
              time: level.endTime as Time,
              value: level.low,
            },
          ],
        );

        highSeries.setData(highLineData);
        lowSeries.setData(lowLineData);

        chart.timeScale().fitContent();
      } catch (error) {
        console.error(
          "Chart data error:",
          error,
        );
      }
    }

    loadCandles();

    const resizeObserver =
      new ResizeObserver((entries) => {
        const width =
          entries[0]?.contentRect.width;

        if (width) {
          chart.applyOptions({
            width,
          });
        }
      });

    resizeObserver.observe(
      chartContainerRef.current,
    );

    return () => {
      resizeObserver.disconnect();

      chart.remove();

      chartRef.current = null;
      seriesRef.current = null;
      highSeriesRef.current = null;
      lowSeriesRef.current = null;
    };
  }, [symbol, timeframe]);

  return (
    <div
      ref={chartContainerRef}
      className="w-full overflow-hidden rounded-lg"
    />
  );
}
