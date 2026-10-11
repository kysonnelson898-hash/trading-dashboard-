import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.ALERT_MONITOR_SECRET;
  const match = /^Bearer (.+)$/.exec(
    request.headers.get("authorization") ?? "",
  );

  if (!expected || !match) return false;

  const supplied = Buffer.from(match[1], "utf8");
  const configured = Buffer.from(expected, "utf8");

  return (
    supplied.length === configured.length &&
    timingSafeEqual(supplied, configured)
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db.query(
      "SELECT to_regclass($1) AS table_name",
      ["public.market_alerts"],
    );

    const available = result.rows[0]?.table_name === "market_alerts";

    return NextResponse.json(
      { ok: available, database: available ? "connected" : "table_missing" },
      { status: available ? 200 : 503 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, database: "unavailable" },
      { status: 503 },
    );
  }
}
