export type AssetType = "crypto" | "stock" | "index";

export interface Asset {
  symbol: string;
  name: string;
  type: AssetType;
}

export const assets: Asset[] = [
  {
    symbol: "BTC/USD",
    name: "Bitcoin",
    type: "crypto",
  },
  {
    symbol: "ETH/USD",
    name: "Ethereum",
    type: "crypto",
  },
  {
    symbol: "SOL/USD",
    name: "Solana",
    type: "crypto",
  },
];
