import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { sendTelegramMessage } from "@/lib/telegram";

function hasValidMonitorSecret(request: Request): boolean {
  const expected = process.env.ALERT_MONITOR_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(authorization);

  if (!expected || !match) {
    return false;
  }

  const suppliedBuffer = Buffer.from(match[1], "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  if (!hasValidMonitorSecret(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body: unknown = await request.json();

    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return NextResponse.json(
        { error: "Missing Telegram message" },
        { status: 400 },
      );
    }

    if (message.length > 4096) {
      return NextResponse.json(
        { error: "Telegram message is too long" },
        { status: 400 },
      );
    }

    const sent = await sendTelegramMessage(message);

    if (!sent) {
      return NextResponse.json(
        { error: "Unable to send Telegram notification" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid Telegram alert request" },
      { status: 400 },
    );
  }
}
