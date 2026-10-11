import type {
  BiQuoteSubscriptionState,
  BiQuoteTick,
} from "@/lib/biquote-stream";

export interface BiQuoteMarketQuote extends BiQuoteTick {
  receivedAt: number;
  subscriptionState: BiQuoteSubscriptionState["state"] | "unknown";
  quoteAgeSeconds: number | null;
  seeded: boolean;
}

export type BiQuoteConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";
