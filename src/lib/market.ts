export type AssetType = "crypto" | "stock" | "index" | "forex";

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
  {
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    type: "forex",
  },
  {
    symbol: "GBPUSD",
    name: "British Pound / US Dollar",
    type: "forex",
  },
  {
    symbol: "USDJPY",
    name: "US Dollar / Japanese Yen",
    type: "forex",
  },
  {
    symbol: "AUDUSD",
    name: "Australian Dollar / US Dollar",
    type: "forex",
  },
  {
    symbol: "NZDUSD",
    name: "New Zealand Dollar / US Dollar",
    type: "forex",
  },
  {
    symbol: "USDCAD",
    name: "US Dollar / Canadian Dollar",
    type: "forex",
  },
  {
    symbol: "USDCHF",
    name: "US Dollar / Swiss Franc",
    type: "forex",
  },
  {
    symbol: "EURGBP",
    name: "Euro / British Pound",
    type: "forex",
  },
  {
    symbol: "EURJPY",
    name: "Euro / Japanese Yen",
    type: "forex",
  },
  {
    symbol: "GBPJPY",
    name: "British Pound / Japanese Yen",
    type: "forex",
  },
  {
    symbol: "USTEC",
    name: "NAS100USD — US Tech 100 Index",
    type: "index",
  },
];
