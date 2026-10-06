import { NextResponse } from "next/server";
import { BitstampMarketDataProvider } from "@/lib/providers/bitstamp";

const provider = new BitstampMarketDataProvider();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") ?? "4H";
  const limit = Number(searchParams.get("limit") ?? "100");

  if (!symbol) {
    return NextResponse.json(
      {
        error: "Missing symbol parameter",
      },
      {
        status: 400,
      },
    );
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return NextResponse.json(
      {
        error: "Limit must be an integer between 1 and 500",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const candles = await provider.getCandles(
      symbol,
      interval,
      limit,
    );

    return NextResponse.json(candles);
  } catch (error) {
    console.error("Market candles error:", error);

    return NextResponse.json(
      {
        error: "Unable to retrieve market candles",
      },
      {
        status: 502,
      },
    );
  }
}
