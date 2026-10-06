import { NextResponse } from "next/server";
import { CoinGeckoMarketDataProvider } from "@/lib/providers/coingecko";

const provider = new CoinGeckoMarketDataProvider();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

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

  try {
    const quote = await provider.getQuote(symbol);

    return NextResponse.json(quote);
  } catch (error) {
    console.error("Market quote error:", error);

    return NextResponse.json(
      {
        error: "Unable to retrieve market quote",
      },
      {
        status: 502,
      },
    );
  }
}
