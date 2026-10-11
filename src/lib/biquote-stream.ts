import {
  HubConnectionBuilder,
  LogLevel,
  type HubConnection,
} from "@microsoft/signalr";

export interface BiQuoteTick {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  dayDiffPercent: number;
}

export interface BiQuoteSubscriptionState {
  symbol: string;
  state: "open" | "closed" | "unknown";
  quoteAgeSeconds: number;
  seeded: boolean;
}

interface BiQuoteStreamOptions {
  symbols: string[];
  onTick: (tick: BiQuoteTick) => void;
  onSubscriptionState?: (
    states: BiQuoteSubscriptionState[],
  ) => void;
  onConnectionState?: (
    state: "connecting" | "connected" | "reconnecting" | "disconnected",
  ) => void;
}

export async function connectBiQuoteStream({
  symbols,
  onTick,
  onSubscriptionState,
  onConnectionState,
}: BiQuoteStreamOptions): Promise<() => void> {
  const connection: HubConnection =
    new HubConnectionBuilder()
      .withUrl("https://biquote.io/hubs/tick", {
        transport: 1,
        skipNegotiation: true,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

  let stopped = false;

  connection.on("ReceiveTick", (tick: BiQuoteTick) => {
    if (!stopped) {
      onTick(tick);
    }
  });

  connection.on(
    "ReceiveSubscriptionState",
    (states: BiQuoteSubscriptionState[]) => {
      if (!stopped) {
        onSubscriptionState?.(states);
      }
    },
  );

  connection.onreconnecting(() => {
    onConnectionState?.("reconnecting");
  });

  connection.onreconnected(async () => {
    if (stopped) return;

    try {
      await connection.invoke("Subscribe", symbols);
      onConnectionState?.("connected");
    } catch (error) {
      console.error("BiQuote resubscription failed:", error);
    }
  });

  connection.onclose(() => {
    onConnectionState?.("disconnected");
  });

  onConnectionState?.("connecting");

  try {
    await connection.start();

    if (stopped) {
      await connection.stop();
      return () => {};
    }

    await connection.invoke("Subscribe", symbols);
    onConnectionState?.("connected");
  } catch (error) {
    stopped = true;
    await connection.stop();
    throw error;
  }

  return () => {
    stopped = true;
    void connection.stop();
  };
}
