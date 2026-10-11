import { NextResponse } from "next/server";
import { BinanceMarketDataProvider } from "@/lib/providers/binance";

const provider =
  new BinanceMarketDataProvider();

export async function GET(
  request: Request,
) {
  const { searchParams } =
    new URL(request.url);

  const symbol =
    searchParams.get("symbol");

  const limit = Number(
    searchParams.get("limit") ?? "20",
  );

  if (!symbol) {
    return NextResponse.json(
      {
        error:
          "Missing symbol parameter",
      },
      { status: 400 },
    );
  }

  if (
    !Number.isInteger(limit) ||
    limit < 5 ||
    limit > 100
  ) {
    return NextResponse.json(
      {
        error:
          "Limit must be an integer between 5 and 100",
      },
      { status: 400 },
    );
  }

  try {
    const orderBook =
      await provider.getOrderBook(
        symbol,
        limit,
      );

    return NextResponse.json(
      orderBook,
    );
  } catch (error) {
    console.error(
      "Market order book error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to retrieve order book",
      },
      { status: 502 },
    );
  }
}
