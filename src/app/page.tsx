"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import MarketTicker from "@/components/MarketTicker";
import OrderBook from "@/components/OrderBook";
import PriceChart from "@/components/PriceChart";

import { assets } from "@/lib/market";
import { connectBiQuoteStream } from "@/lib/biquote-stream";
import type {
  BiQuoteConnectionState,
  BiQuoteMarketQuote,
} from "@/lib/biquote-market";

import type {
  Candle,
  MarketQuote,
} from "@/lib/market-data";

import {
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
  sendTradingNotification,
} from "@/lib/notifications";

import {
  detectMarketAlerts,
  type MarketAlert,
} from "@/lib/market-alerts";

const timeframes = [
  "1m",
  "30m",
  "1H",
  "4H",
];

const candleSecondsByTimeframe: Record<
  string,
  number
> = {
  "1m": 60,
  "3m": 180,
  "30m": 1800,
  "1H": 3600,
  "4H": 14400,
};

const ALERT_POLL_INTERVAL_MS = 60_000;

function getCandleStepSeconds(
  timeframe: string,
): number {
  return (
    candleSecondsByTimeframe[
      timeframe
    ] ?? 14_400
  );
}

function getLatestClosedCandle(
  candles: Candle[],
  timeframe: string,
): Candle | null {
  const stepSeconds =
    getCandleStepSeconds(timeframe);

  const nowSeconds =
    Math.floor(Date.now() / 1000);

  const closedCandles =
    candles.filter(
      (candle) =>
        Number.isFinite(candle.time) &&
        candle.time + stepSeconds <=
          nowSeconds,
    );

  if (closedCandles.length === 0) {
    return null;
  }

  return (
    closedCandles.at(-1) ?? null
  );
}

function getNotificationForAlert(
  alert: MarketAlert,
): {
  title: string;
  body: string;
  tag: string;
} {
  switch (alert.type) {
    case "PREVIOUS_DAY_HIGH_BREAK":
      return {
        title: `${alert.symbol} — Previous-Day High Break`,
        body: `${alert.message} Price: $${alert.price.toLocaleString()}.`,
        tag: alert.id,
      };

    case "PREVIOUS_DAY_LOW_BREAK":
      return {
        title: `${alert.symbol} — Previous-Day Low Break`,
        body: `${alert.message} Price: $${alert.price.toLocaleString()}.`,
        tag: alert.id,
      };

    case "BULLISH_CHOCH":
      return {
        title: `${alert.symbol} — Bullish CHOCH`,
        body: `${alert.message} Price: $${alert.price.toLocaleString()}.`,
        tag: alert.id,
      };

    case "BEARISH_CHOCH":
      return {
        title: `${alert.symbol} — Bearish CHOCH`,
        body: `${alert.message} Price: $${alert.price.toLocaleString()}.`,
        tag: alert.id,
      };
  }
}

function getTelegramMessage(
  alert: MarketAlert,
): string {
  const typeLabels: Record<
    MarketAlert["type"],
    string
  > = {
    PREVIOUS_DAY_HIGH_BREAK:
      "PREVIOUS-DAY HIGH BREAK",

    PREVIOUS_DAY_LOW_BREAK:
      "PREVIOUS-DAY LOW BREAK",

    BULLISH_CHOCH:
      "BULLISH CHOCH",

    BEARISH_CHOCH:
      "BEARISH CHOCH",
  };

  const direction =
    alert.type ===
      "PREVIOUS_DAY_LOW_BREAK" ||
    alert.type === "BEARISH_CHOCH"
      ? "🔴 BEARISH"
      : "⚪ BULLISH";

  return [
    "TRADEFLOW ALERT",
    "",
    `${direction} • ${typeLabels[alert.type]}`,
    "",
    `Symbol: ${alert.symbol}`,
    `Price: $${alert.price.toLocaleString()}`,
    `Level: $${alert.level.toLocaleString()}`,
    `Volume: ${alert.volume.toLocaleString()}`,
    `Average Volume: ${alert.averageVolume.toLocaleString()}`,
    `Volume Ratio: ${alert.volumeRatio.toFixed(2)}x`,
    "",
    alert.message,
  ].join("\n");
}

async function sendTelegramAlert(
  alert: MarketAlert,
): Promise<boolean> {
  try {
    const response =
      await fetch(
        "/api/alerts/telegram",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            message:
              getTelegramMessage(alert),
          }),
        },
      );

    if (!response.ok) {
      console.error(
        "Telegram alert request failed:",
        response.status,
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Telegram alert request error:",
      error,
    );

    return false;
  }
}

export default function Home() {
  const [
    selectedSymbol,
    setSelectedSymbol,
  ] = useState(assets[0].symbol);

  const [quotes, setQuotes] =
    useState<
      Record<string, MarketQuote>
    >({});

  const [dailyRanges, setDailyRanges] =
    useState<Record<string, { high: number; low: number }>>({});

  const [streamQuotes, setStreamQuotes] =
    useState<Record<string, BiQuoteMarketQuote>>({});

  const [biQuoteConnectionState, setBiQuoteConnectionState] =
    useState<BiQuoteConnectionState>("disconnected");

  const [error, setError] =
    useState<string | null>(null);

  const [
    selectedTimeframe,
    setSelectedTimeframe,
  ] = useState("4H");

  const [
    showStructure,
    setShowStructure,
  ] = useState(true);

  const [
    showStructureEvents,
    setShowStructureEvents,
  ] = useState(true);

  const [
    showBollingerBands,
    setShowBollingerBands,
  ] = useState(false);

  const [
    notificationState,
    setNotificationState,
  ] =
    useState<NotificationPermission>(
      "default",
    );

  const lastProcessedCandleRef =
    useRef<number | null>(null);

  const notifiedAlertIdsRef =
    useRef<Set<string>>(
      new Set(),
    );

  const pendingAlertsRef =
    useRef<Map<string, MarketAlert>>(
      new Map(),
    );

  const selectedAsset =
    assets.find(
      (asset) =>
        asset.symbol ===
        selectedSymbol,
    ) ?? assets[0];

  const selectedQuote =
    quotes[
      selectedAsset.symbol
    ] ?? null;

  const selectedDailyRange =
    dailyRanges[selectedAsset.symbol] ?? null;

  const dailyHigh =
    selectedAsset.type === "crypto"
      ? selectedQuote?.high24h ?? null
      : selectedDailyRange?.high ?? null;

  const dailyLow =
    selectedAsset.type === "crypto"
      ? selectedQuote?.low24h ?? null
      : selectedDailyRange?.low ?? null;

  const selectedStreamQuote =
    streamQuotes[selectedAsset.symbol] ?? null;

  const selectedLivePrice =
    selectedAsset.type === "crypto"
      ? selectedQuote?.price ?? null
      : selectedStreamQuote?.mid ?? null;

  const selectedDayChange =
    selectedAsset.type === "crypto"
      ? selectedQuote?.change24h ?? null
      : selectedStreamQuote?.dayDiffPercent ?? null;

  function formatAssetPrice(
    symbol: string,
    type: string,
    price: number,
  ): string {
    if (type === "crypto") {
      return `$${price.toLocaleString("en-US", {
        maximumFractionDigits: 8,
      })}`;
    }

    if (type === "forex") {
      const decimals = symbol.endsWith("JPY") ? 3 : 5;
      return price.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }

    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /*
   * ---------------------------------------------------
   * BROWSER NOTIFICATION PERMISSION
   * ---------------------------------------------------
   */

  useEffect(() => {
    setNotificationState(
      notificationPermission(),
    );
  }, []);

  async function handleNotificationPermission() {
    const permission =
      await requestNotificationPermission();

    setNotificationState(permission);
  }

  /*
   * ---------------------------------------------------
   * BIQUOTE FOREX / INDEX WEBSOCKET
   * ---------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;
    let disconnect: (() => void) | undefined;

    void connectBiQuoteStream({
      symbols: [
        "EURUSD",
        "GBPUSD",
        "USDJPY",
        "AUDUSD",
        "NZDUSD",
        "USDCAD",
        "USDCHF",
        "EURGBP",
        "EURJPY",
        "GBPJPY",
        "USTEC",
      ],

      onTick: (tick) => {
        if (cancelled) return;

        setStreamQuotes((previous) => {
          const existing = previous[tick.symbol];

          return {
            ...previous,
            [tick.symbol]: {
              ...tick,
              receivedAt: Date.now(),
              subscriptionState:
                existing?.subscriptionState ?? "unknown",
              quoteAgeSeconds:
                existing?.quoteAgeSeconds ?? null,
              seeded: existing?.seeded ?? true,
            },
          };
        });
      },

      onSubscriptionState: (states) => {
        if (cancelled) return;

        setStreamQuotes((previous) => {
          const next = { ...previous };

          for (const state of states) {
            const existing = next[state.symbol];

            if (existing) {
              next[state.symbol] = {
                ...existing,
                subscriptionState: state.state,
                quoteAgeSeconds: state.quoteAgeSeconds,
                seeded: state.seeded,
              };
            }
          }

          return next;
        });
      },

      onConnectionState: (state) => {
        if (!cancelled) {
          setBiQuoteConnectionState(state);
        }
      },
    })
      .then((stop) => {
        if (cancelled) {
          stop();
        } else {
          disconnect = stop;
        }
      })
      .catch((streamError: unknown) => {
        console.error("BiQuote stream error:", streamError);

        if (!cancelled) {
          setBiQuoteConnectionState("disconnected");
          setError("BiQuote live feed is unavailable");
        }
      });

    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, []);

  /*
   * ---------------------------------------------------
   * MARKET QUOTES
   * ---------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    async function loadQuotes() {
      try {
        const results =
          await Promise.all(
            assets
              .filter((asset) => asset.type === "crypto")
              .map(
                async (asset) => {
                const response =
                  await fetch(
                    `/api/market/quote?symbol=${encodeURIComponent(
                      asset.symbol,
                    )}`,
                    {
                      cache:
                        "no-store",
                    },
                  );

                if (!response.ok) {
                  throw new Error(
                    `Unable to load ${asset.symbol}`,
                  );
                }

                return (await response.json()) as MarketQuote;
              },
            ),
          );

        if (cancelled) {
          return;
        }

        const nextQuotes: Record<
          string,
          MarketQuote
        > = {};

        for (const quote of results) {
          nextQuotes[
            quote.symbol
          ] = quote;
        }

        setQuotes(nextQuotes);
        setError(null);
      } catch (loadError) {
        console.error(
          "Market quote error:",
          loadError,
        );

        if (!cancelled) {
          setError(
            "Some market data is unavailable",
          );
        }
      }
    }

    void loadQuotes();

    const interval =
      window.setInterval(
        loadQuotes,
        60_000,
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        interval,
      );
    };
  }, []);

  /*
   * ---------------------------------------------------
   * DAILY HIGH / LOW
   * ---------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    async function loadDailyRanges() {
      const startOfUtcDay =
        Math.floor(Date.now() / 86_400_000) * 86_400;

      const targets = assets.filter(
        (asset) => asset.type !== "crypto",
      );

      const results = await Promise.allSettled(
        targets.map(async (asset) => {
          const response = await fetch(
            `/api/market/candles?symbol=${encodeURIComponent(asset.symbol)}&interval=1H&limit=48`,
            { cache: "no-store" },
          );

          if (!response.ok) {
            throw new Error(`Unable to load daily range for ${asset.symbol}`);
          }

          const candles = (await response.json()) as Candle[];

          const today = candles.filter(
            (candle) =>
              Number.isFinite(candle.time) &&
              candle.time >= startOfUtcDay &&
              candle.time < startOfUtcDay + 86_400 &&
              Number.isFinite(candle.high) &&
              Number.isFinite(candle.low),
          );

          if (today.length === 0) {
            throw new Error(`No current-day candles returned for ${asset.symbol}`);
          }

          return {
            symbol: asset.symbol,
            high: Math.max(...today.map((candle) => candle.high)),
            low: Math.min(...today.map((candle) => candle.low)),
          };
        }),
      );

      if (cancelled) return;

      setDailyRanges((previous) => {
        const next = { ...previous };

        for (const result of results) {
          if (result.status === "fulfilled") {
            next[result.value.symbol] = {
              high: result.value.high,
              low: result.value.low,
            };
          } else {
            console.warn("Daily high/low update failed:", result.reason);
          }
        }

        return next;
      });
    }

    void loadDailyRanges();

    const interval = window.setInterval(
      () => void loadDailyRanges(),
      60_000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  /*
   * ---------------------------------------------------
   * MARKET ALERT MONITOR
   * ---------------------------------------------------
   *
   * Alerts are evaluated only against
   * newly closed candles.
   *
   * A qualifying alert can now be sent to:
   *
   * 1. Browser notification
   * 2. Telegram
   *
   * Telegram secrets remain server-side.
   */

  useEffect(() => {
    if (selectedAsset.type !== "crypto") {
      lastProcessedCandleRef.current = null;
      notifiedAlertIdsRef.current.clear();
      return;
    }

    let cancelled = false;

    lastProcessedCandleRef.current =
      null;

    notifiedAlertIdsRef.current.clear();

    async function checkMarketAlerts() {
      try {
        const response =
          await fetch(
            `/api/market/candles?symbol=${encodeURIComponent(
              selectedAsset.symbol,
            )}&interval=${encodeURIComponent(
              selectedTimeframe,
            )}&limit=200`,
            {
              cache: "no-store",
            },
          );

        if (!response.ok) {
          throw new Error(
            `Unable to load alert candles for ${selectedAsset.symbol}`,
          );
        }

        const candles =
          (await response.json()) as Candle[];

        if (
          cancelled ||
          !Array.isArray(candles)
        ) {
          return;
        }

        const validCandles =
          candles
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
                ),
            )
            .sort(
              (a, b) =>
                a.time - b.time,
            );

        const latestClosedCandle =
          getLatestClosedCandle(
            validCandles,
            selectedTimeframe,
          );

        if (!latestClosedCandle) {
          return;
        }

        /*
         * Establish the initial baseline.
         * Historical alerts are never replayed.
         */
        if (
          lastProcessedCandleRef.current ===
          null
        ) {
          lastProcessedCandleRef.current =
            latestClosedCandle.time;

          return;
        }

        /*
         * No newly closed candle.
         */
        if (
          latestClosedCandle.time <=
          lastProcessedCandleRef.current
        ) {
          return;
        }

        const alerts =
          detectMarketAlerts(
            selectedAsset.symbol,
            validCandles,
          );

        /*
         * Only alerts from the newly
         * closed candle are actionable.
         */
        const currentCandleAlerts =
          alerts.filter(
            (alert) =>
              alert.time ===
              latestClosedCandle.time,
          );

        if (
          currentCandleAlerts.length ===
          0
        ) {
          lastProcessedCandleRef.current =
            latestClosedCandle.time;
          return;
        }

        for (const alert of currentCandleAlerts) {
          if (
            notifiedAlertIdsRef.current.has(
              alert.id,
            )
          ) {
            continue;
          }

          /*
           * Browser notification.
           */
          if (
            notificationPermission() ===
            "granted"
          ) {
            const notification =
              getNotificationForAlert(
                alert,
              );

            sendTradingNotification(
              notification,
            );
          }

          /*
           * Retry Telegram on a later poll
           * if delivery fails.
           */
          const telegramSent =
            await sendTelegramAlert(alert);

          if (telegramSent) {
            notifiedAlertIdsRef.current.add(
              alert.id,
            );
          } else {
            console.error(
              `Telegram delivery failed; will retry: ${alert.id}`,
            );
          }
        }

        /*
         * Advance the candle only after all
         * alerts for it were delivered.
         */
        const allAlertsDelivered =
          currentCandleAlerts.every((alert) =>
            notifiedAlertIdsRef.current.has(
              alert.id,
            ),
          );

        if (allAlertsDelivered) {
          lastProcessedCandleRef.current =
            latestClosedCandle.time;
        }
      } catch (alertError) {
        console.error(
          "Market alert monitor error:",
          alertError,
        );
      }
    }

    void checkMarketAlerts();

    const interval =
      window.setInterval(
        checkMarketAlerts,
        ALERT_POLL_INTERVAL_MS,
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        interval,
      );
    };
  }, [
    selectedAsset.symbol,
    selectedTimeframe,
  ]);

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
        <div className="mb-6">
          <MarketTicker
            quotes={quotes}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
          />
        </div>

        <header className="mb-6 border-y border-red-900/70 bg-black px-5 py-4">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 animate-pulse bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.9)]" />

                <h1 className="font-mono text-2xl font-black tracking-[0.2em] text-white">
                  TRADEFLOW
                </h1>
              </div>

              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-red-500">
                MARKET INTELLIGENCE TERMINAL
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="border border-red-900/70 bg-[#090909] px-5 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-700">
                  Portfolio Value
                </p>

                <p className="mt-1 font-mono text-xl font-bold text-white">
                  $—
                </p>
              </div>

              <div className="border border-red-900/70 bg-[#090909] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-700">
                      Browser Alerts
                    </p>

                    <p
                      className={`mt-1 font-mono text-[10px] uppercase ${
                        notificationState ===
                        "granted"
                          ? "text-white"
                          : notificationState ===
                              "denied"
                            ? "text-red-500"
                            : "text-white/50"
                      }`}
                    >
                      {notificationState ===
                      "granted"
                        ? "ENABLED"
                        : notificationState ===
                            "denied"
                          ? "BLOCKED"
                          : "NOT ENABLED"}
                    </p>
                  </div>

                  {notificationState !==
                    "granted" && (
                    <button
                      type="button"
                      onClick={
                        handleNotificationPermission
                      }
                      disabled={
                        notificationState ===
                        "denied"
                      }
                      className="border border-red-700 bg-red-950/40 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-wider text-red-400 transition hover:bg-red-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Enable
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
          <aside className="border border-red-900/60 bg-[#080808]">
            <div className="flex items-center justify-between border-b border-red-900/60 bg-[#0d0000] px-4 py-3">
              <h2 className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-red-500">
                Watchlist
              </h2>

              <button
                type="button"
                className="border border-red-800 px-2 py-1 font-mono text-xs text-red-500 transition hover:bg-red-950 hover:text-white"
              >
                +
              </button>
            </div>

            <div className="space-y-px">
              {assets.map((asset) => {
                const isSelected =
                  asset.symbol ===
                  selectedSymbol;

                const assetQuote =
                  quotes[asset.symbol];

                const assetStreamQuote =
                  streamQuotes[asset.symbol];

                const assetPrice =
                  asset.type === "crypto"
                    ? assetQuote?.price ?? null
                    : assetStreamQuote?.mid ?? null;

                const assetDayChange =
                  asset.type === "crypto"
                    ? assetQuote?.change24h ?? null
                    : assetStreamQuote?.dayDiffPercent ?? null;

                return (
                  <button
                    key={asset.symbol}
                    type="button"
                    onClick={() =>
                      setSelectedSymbol(
                        asset.symbol,
                      )
                    }
                    className={`w-full border-b border-red-950/70 px-4 py-4 text-left transition ${
                      isSelected
                        ? "bg-red-950/40 shadow-[inset_3px_0_0_#dc2626]"
                        : "bg-[#080808] hover:bg-red-950/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-mono text-sm font-bold ${
                          isSelected
                            ? "text-white"
                            : "text-red-400"
                        }`}
                      >
                        {asset.symbol}
                      </span>

                      <span className="font-mono text-[9px] uppercase tracking-wider text-red-800">
                        {asset.type}
                      </span>
                    </div>

                    <div className="mt-1 font-mono text-[10px] uppercase text-white/40">
                      {asset.name}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-mono text-sm text-white">
                        {assetPrice !== null
                          ? formatAssetPrice(asset.symbol, asset.type, assetPrice)
                          : "—"}
                      </span>

                      <span
                        className={`font-mono text-xs ${
                          assetDayChange !== null
                            ? assetDayChange >= 0
                              ? "text-white"
                              : "text-red-500"
                            : "text-white/30"
                        }`}
                      >
                        {assetDayChange !== null
                          ? `${assetDayChange >= 0 ? "+" : ""}${assetDayChange.toFixed(2)}%`
                          : "—"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0">
            <div className="mb-5 flex flex-col justify-between gap-4 border-b border-red-900/50 pb-4 md:flex-row md:items-end">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-600">
                  Selected Security
                </p>

                <div className="mt-1 flex items-baseline gap-3">
                  <h2 className="font-mono text-2xl font-black text-white">
                    {selectedAsset.symbol}
                  </h2>

                  <span className="font-mono text-xs uppercase text-white/40">
                    {selectedAsset.name}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {timeframes.map(
                  (timeframe) => (
                    <button
                      key={timeframe}
                      type="button"
                      onClick={() =>
                        setSelectedTimeframe(
                          timeframe,
                        )
                      }
                      className={`border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider transition ${
                        selectedTimeframe ===
                        timeframe
                          ? "border-red-500 bg-red-700 text-white shadow-[0_0_12px_rgba(220,38,38,0.35)]"
                          : "border-red-950 bg-black text-red-700 hover:border-red-800 hover:text-red-400"
                      }`}
                    >
                      {timeframe}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="mb-5 grid gap-px border border-red-900/60 bg-red-900/40 sm:grid-cols-2 xl:grid-cols-4">
              <div className="bg-[#080808] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-700">
                  Current Price
                </p>

                <p className="mt-2 font-mono text-xl font-bold text-white">
                  {selectedLivePrice !== null
                    ? formatAssetPrice(
                        selectedAsset.symbol,
                        selectedAsset.type,
                        selectedLivePrice,
                      )
                    : "—"}
                </p>
              </div>

              <div className="bg-[#080808] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-700">
                  24h Change
                </p>

                <p
                  className={`mt-2 font-mono text-xl font-bold ${
                    selectedDayChange !== null
                      ? selectedDayChange >= 0
                        ? "text-white"
                        : "text-red-500"
                      : "text-white"
                  }`}
                >
                  {selectedDayChange !== null
                    ? `${selectedDayChange >= 0 ? "+" : ""}${selectedDayChange.toFixed(2)}%`
                    : "—"}
                </p>
              </div>

              <div className="bg-[#080808] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-700">
                  24h High
                </p>

                <p className="mt-2 font-mono text-xl font-bold text-white">
                  {dailyHigh !== null
                    ? formatAssetPrice(selectedAsset.symbol, selectedAsset.type, dailyHigh)
                    : "—"}
                </p>
              </div>

              <div className="bg-[#080808] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-700">
                  24h Low
                </p>

                <p className="mt-2 font-mono text-xl font-bold text-red-500">
                  {dailyLow !== null
                    ? formatAssetPrice(selectedAsset.symbol, selectedAsset.type, dailyLow)
                    : "—"}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 border border-red-700 bg-red-950/40 px-4 py-3 font-mono text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="border border-red-900/60 bg-[#050505]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-900/60 bg-[#090000] px-4 py-3">
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-white">
                    Price / Market Structure
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-[9px] uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-white">
                      <span className="h-2 w-2 bg-white" />
                      Support
                    </span>

                    <span className="flex items-center gap-1.5 text-red-500">
                      <span className="h-2 w-2 bg-red-600" />
                      Resistance
                    </span>

                    <span className="flex items-center gap-1.5 text-white/50">
                      <span className="h-px w-4 bg-white/50" />
                      BOS / CHOCH
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setShowStructure(
                        (current) =>
                          !current,
                      )
                    }
                    aria-pressed={
                      showStructure
                    }
                    className={`border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition ${
                      showStructure
                        ? "border-red-500 bg-red-950/60 text-white shadow-[0_0_12px_rgba(220,38,38,0.2)]"
                        : "border-red-950 bg-black text-red-800 hover:text-red-500"
                    }`}
                  >
                    M1:{" "}
                    {showStructure
                      ? "ON"
                      : "OFF"}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setShowStructureEvents(
                        (current) =>
                          !current,
                      )
                    }
                    aria-pressed={
                      showStructureEvents
                    }
                    className={`border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition ${
                      showStructureEvents
                        ? "border-white/40 bg-white/10 text-white"
                        : "border-red-950 bg-black text-red-800 hover:text-red-500"
                    }`}
                  >
                    M2:{" "}
                    {showStructureEvents
                      ? "ON"
                      : "OFF"}
                  </button>


                  <button
                    type="button"
                    onClick={() =>
                      setShowBollingerBands(
                        (current) =>
                          !current,
                      )
                    }
                    aria-pressed={
                      showBollingerBands
                    }
                    className={`border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition ${
                      showBollingerBands
                        ? "border-[#39ff14] bg-[#39ff14]/10 text-[#39ff14] shadow-[0_0_12px_rgba(57,255,20,0.25)]"
                        : "border-red-950 bg-black text-red-800 hover:text-red-500"
                    }`}
                  >
                    M3:{" "}
                    {showBollingerBands
                      ? "ON"
                      : "OFF"}
                  </button>
                </div>
              </div>

              <div className="p-1">
                <PriceChart
                  symbol={
                    selectedAsset.symbol
                  }
                  livePrice={
                    streamQuotes[selectedAsset.symbol]?.mid ?? null
                  }
                  timeframe={
                    selectedTimeframe
                  }
                  showStructure={
                    showStructure
                  }
                  showStructureEvents={
                    showStructureEvents
                  }
                  showBollingerBands={
                    showBollingerBands
                  }
                />
              </div>
            </div>

            <div className="mt-5">
              {selectedAsset.type === "crypto" ? (
                <OrderBook symbol={selectedAsset.symbol} />
              ) : (
                <section className="border border-white/10 bg-[#07100f] px-4 py-6 text-center text-white">
                  <h2 className="font-mono text-sm font-bold tracking-widest">
                    ORDER BOOK UNAVAILABLE
                  </h2>
                  <p className="mt-2 font-mono text-xs text-white/50">
                    {selectedAsset.symbol} · Live bid/ask quotes do not provide
                    verified Level 2 market depth.
                  </p>
                </section>
              )}
            </div>

            <div className="mt-5 border border-red-900/60 bg-[#080808]">
              <div className="border-b border-red-900/60 bg-[#0d0000] px-5 py-3">
                <h3 className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-red-500">
                  Market Statistics
                </h3>
              </div>

              <div className="p-5">
                <div className="grid gap-px border border-red-950 bg-red-950/40 md:grid-cols-3">
                  <div className="bg-[#080808] p-4">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-red-700">
                      Volume
                    </span>

                    <p className="mt-2 font-mono text-sm font-bold text-white">
                      {selectedQuote
                        ? `$${selectedQuote.volume24h.toLocaleString()}`
                        : "—"}
                    </p>
                  </div>

                  <div className="bg-[#080808] p-4">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-red-700">
                      24h Range
                    </span>

                    <p className="mt-2 font-mono text-sm font-bold text-white">
                      {dailyLow !== null && dailyHigh !== null
                        ? `${formatAssetPrice(selectedAsset.symbol, selectedAsset.type, dailyLow)} – ${formatAssetPrice(selectedAsset.symbol, selectedAsset.type, dailyHigh)}`
                        : "—"}
                    </p>
                  </div>

                  <div className="bg-[#080808] p-4">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-red-700">
                      Data Status
                    </span>

                    <p className="mt-2 flex items-center gap-2 font-mono text-sm font-bold text-white">
                      <span className="h-2 w-2 animate-pulse bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
                      LIVE
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
