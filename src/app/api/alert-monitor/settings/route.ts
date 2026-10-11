import { NextResponse } from "next/server";

import { assets } from "@/lib/market";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TIMEFRAMES = new Set(["30m", "1H", "4H", "1D"]);
const ALLOWED_SYMBOLS = new Set(assets.map((asset) => asset.symbol));

interface MonitorSettings {
  symbols: string[];
  timeframes: string[];
  enabled: boolean;
}

function validateSettings(
  value: unknown,
): MonitorSettings | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const input = value as Record<string, unknown>;

  if (
    !Array.isArray(input.symbols) ||
    !Array.isArray(input.timeframes) ||
    typeof input.enabled !== "boolean"
  ) {
    return null;
  }

  const symbols = input.symbols;
  const timeframes = input.timeframes;

  if (
    symbols.length < 1 ||
    symbols.length > 5 ||
    !symbols.every(
      (symbol) =>
        typeof symbol === "string" &&
        ALLOWED_SYMBOLS.has(symbol),
    ) ||
    new Set(symbols).size !== symbols.length
  ) {
    return null;
  }

  if (
    timeframes.length < 1 ||
    timeframes.length > ALLOWED_TIMEFRAMES.size ||
    !timeframes.every(
      (timeframe) =>
        typeof timeframe === "string" &&
        ALLOWED_TIMEFRAMES.has(timeframe),
    ) ||
    new Set(timeframes).size !== timeframes.length
  ) {
    return null;
  }

  return {
    symbols: symbols as string[],
    timeframes: timeframes as string[],
    enabled: input.enabled,
  };
}

export async function GET() {
  try {
    const result = await db.query<MonitorSettings>(
      `
        SELECT symbols, timeframes, enabled
        FROM public.alert_monitor_settings
        WHERE id = 1
      `,
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Alert-monitor settings have not been initialized." },
        { status: 503 },
      );
    }

    return NextResponse.json(result.rows[0], {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Unable to load alert-monitor settings:", error);

    return NextResponse.json(
      { error: "Unable to load alert-monitor settings." },
      { status: 503 },
    );
  }
}

export async function PUT(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must contain valid JSON." },
      { status: 400 },
    );
  }

  const settings = validateSettings(body);

  if (!settings) {
    return NextResponse.json(
      {
        error:
          "Choose 1–5 unique supported assets, 1–4 supported timeframes, and provide an enabled boolean.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await db.query<MonitorSettings>(
      `
        INSERT INTO public.alert_monitor_settings (
          id,
          symbols,
          timeframes,
          enabled,
          updated_at
        )
        VALUES (1, $1::TEXT[], $2::TEXT[], $3, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          symbols = EXCLUDED.symbols,
          timeframes = EXCLUDED.timeframes,
          enabled = EXCLUDED.enabled,
          updated_at = NOW()
        RETURNING symbols, timeframes, enabled
      `,
      [settings.symbols, settings.timeframes, settings.enabled],
    );

    return NextResponse.json(result.rows[0], {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Unable to save alert-monitor settings:", error);

    return NextResponse.json(
      { error: "Unable to save alert-monitor settings." },
      { status: 503 },
    );
  }
}
