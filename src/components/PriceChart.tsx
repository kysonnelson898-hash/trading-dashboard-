"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
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

export default function PriceChart({
  symbol,
  timeframe,
}: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef =
    useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) {
      return;
    }

    const chart = createChart(chartContainerRef.current, {
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
      width: chartContainerRef.current.clientWidth,
      height: 450,
      rightPriceScale: {
        borderColor: "#334155",
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    async function loadCandles() {
      try {
        const response = await fetch(
          `/api/market/candles?symbol=${encodeURIComponent(
            symbol,
          )}&interval=${encodeURIComponent(
            timeframe,
          )}&limit=100`,
        );

        if (!response.ok) {
          throw new Error("Unable to load candle data");
        }

        const data: ApiCandle[] = await response.json();

        const candles: CandlestickData<Time>[] = data.map(
          (candle) => ({
            time: candle.time as Time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          }),
        );

        series.setData(candles);
        chart.timeScale().fitContent();
      } catch (error) {
        console.error("Chart data error:", error);
      }
    }

    loadCandles();

    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;

      if (width) {
        chart.applyOptions({
          width,
        });
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [symbol, timeframe]);

  return (
    <div
      ref={chartContainerRef}
      className="w-full overflow-hidden rounded-lg"
    />
  );
}
