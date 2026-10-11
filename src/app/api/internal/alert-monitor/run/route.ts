import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { deliverQueuedMarketAlerts } from "@/lib/alert-delivery-worker";
import { checkServerMarketAlerts } from "@/lib/server-alert-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const expected = process.env.ALERT_MONITOR_SECRET;
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer (.+)$/);

  if (!expected || !match) {
    return false;
  }

  const suppliedBuffer = Buffer.from(match[1], "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (suppliedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}

async function runMonitor(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const detectedAlerts = await checkServerMarketAlerts();
    const delivery = await deliverQueuedMarketAlerts();

    return NextResponse.json(
      {
        success: true,
        detectedAlerts: detectedAlerts.length,
        delivery,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Background alert-monitor run failed:", error);

    return NextResponse.json(
      { error: "Background alert-monitor run failed." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export async function GET(request: Request) {
  return runMonitor(request);
}

export async function POST(request: Request) {
  return runMonitor(request);
}
