export type Category =
  | "Broad U.S. Market"
  | "U.S. Large-Cap Growth"
  | "U.S. Information Technology"
  | "Developed International Markets"
  | "Emerging Markets"
  | "Broad International Markets"
  | "Semiconductors";

export const CATEGORIES: Category[] = [
  "Broad U.S. Market",
  "U.S. Large-Cap Growth",
  "U.S. Information Technology",
  "Developed International Markets",
  "Emerging Markets",
  "Broad International Markets",
  "Semiconductors",
];

/** Higher-level groups used by the daily market analysis. */
export type SectorGroup = "Broad U.S." | "U.S. Growth" | "Technology" | "Semiconductors" | "International";

export interface EtfDefinition {
  ticker: string;
  name: string;
  provider: string;
  category: Category;
  group: SectorGroup;
  focus: string;
  /** Initial reference value from the project brief (percent). Not independently verified. */
  referenceExpenseRatio: number;
  /** Official fund-provider page used to verify the expense ratio. */
  providerUrl: string;
  concentrationRisk: string;
}

export const ETFS: EtfDefinition[] = [
  {
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    provider: "Vanguard",
    category: "Broad U.S. Market",
    group: "Broad U.S.",
    focus: "S&P 500, large U.S. companies",
    referenceExpenseRatio: 0.03,
    providerUrl: "https://investor.vanguard.com/investment-products/etfs/profile/voo",
    concentrationRisk:
      "Market-cap weighted; the largest technology companies make up a large share of the index.",
  },
  {
    ticker: "VTI",
    name: "Vanguard Total Stock Market ETF",
    provider: "Vanguard",
    category: "Broad U.S. Market",
    group: "Broad U.S.",
    focus: "Entire U.S. stock market",
    referenceExpenseRatio: 0.03,
    providerUrl: "https://investor.vanguard.com/investment-products/etfs/profile/vti",
    concentrationRisk:
      "Broadly diversified across U.S. stocks but still market-cap weighted toward mega-cap technology.",
  },
  {
    ticker: "SCHG",
    name: "Schwab U.S. Large-Cap Growth ETF",
    provider: "Schwab",
    category: "U.S. Large-Cap Growth",
    group: "U.S. Growth",
    focus: "Large-cap U.S. growth",
    referenceExpenseRatio: 0.04,
    providerUrl: "https://www.schwabassetmanagement.com/products/schg",
    concentrationRisk:
      "Growth tilt with heavy weighting in a small number of mega-cap technology and communication stocks.",
  },
  {
    ticker: "VUG",
    name: "Vanguard Growth ETF",
    provider: "Vanguard",
    category: "U.S. Large-Cap Growth",
    group: "U.S. Growth",
    focus: "Large-cap U.S. growth",
    referenceExpenseRatio: 0.03,
    providerUrl: "https://investor.vanguard.com/investment-products/etfs/profile/vug",
    concentrationRisk:
      "Growth tilt with heavy weighting in a small number of mega-cap technology and communication stocks.",
  },
  {
    ticker: "VGT",
    name: "Vanguard Information Technology ETF",
    provider: "Vanguard",
    category: "U.S. Information Technology",
    group: "Technology",
    focus: "U.S. information technology",
    referenceExpenseRatio: 0.09,
    providerUrl: "https://investor.vanguard.com/investment-products/etfs/profile/vgt",
    concentrationRisk:
      "Single-sector fund; a few companies represent a large percentage of assets.",
  },
  {
    ticker: "FTEC",
    name: "Fidelity MSCI Information Technology Index ETF",
    provider: "Fidelity",
    category: "U.S. Information Technology",
    group: "Technology",
    focus: "U.S. information technology",
    referenceExpenseRatio: 0.08,
    providerUrl: "https://digital.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=FTEC",
    concentrationRisk:
      "Single-sector fund; a few companies represent a large percentage of assets.",
  },
  {
    ticker: "SCHF",
    name: "Schwab International Equity ETF",
    provider: "Schwab",
    category: "Developed International Markets",
    group: "International",
    focus: "Developed international stocks",
    referenceExpenseRatio: 0.03,
    providerUrl: "https://www.schwabassetmanagement.com/products/schf",
    concentrationRisk: "Currency risk and exposure to developed-market economic cycles outside the U.S.",
  },
  {
    ticker: "SCHE",
    name: "Schwab Emerging Markets Equity ETF",
    provider: "Schwab",
    category: "Emerging Markets",
    group: "International",
    focus: "Emerging-market stocks",
    referenceExpenseRatio: 0.06,
    providerUrl: "https://www.schwabassetmanagement.com/products/sche",
    concentrationRisk:
      "Currency, political and country-concentration risk (large weights in a few emerging economies).",
  },
  {
    ticker: "VXUS",
    name: "Vanguard Total International Stock ETF",
    provider: "Vanguard",
    category: "Broad International Markets",
    group: "International",
    focus: "International stocks excluding U.S.",
    referenceExpenseRatio: 0.05,
    providerUrl: "https://investor.vanguard.com/investment-products/etfs/profile/vxus",
    concentrationRisk: "Currency risk; mix of developed and emerging markets outside the U.S.",
  },
  {
    ticker: "SOXQ",
    name: "Invesco PHLX Semiconductor ETF",
    provider: "Invesco",
    category: "Semiconductors",
    group: "Semiconductors",
    focus: "Semiconductor companies",
    referenceExpenseRatio: 0.19,
    providerUrl: "https://www.invesco.com/us/financial-products/etfs/product-detail?audienceType=Investor&ticker=SOXQ",
    concentrationRisk:
      "Single-industry fund with roughly 30 holdings; semiconductors are highly cyclical and volatile.",
  },
  {
    ticker: "SOXX",
    name: "iShares Semiconductor ETF",
    provider: "iShares",
    category: "Semiconductors",
    group: "Semiconductors",
    focus: "Semiconductor companies",
    referenceExpenseRatio: 0.33,
    providerUrl: "https://www.ishares.com/us/products/239705/ishares-phlx-semiconductor-etf",
    concentrationRisk:
      "Single-industry fund with roughly 30 holdings; semiconductors are highly cyclical and volatile.",
  },
  {
    ticker: "SMH",
    name: "VanEck Semiconductor ETF",
    provider: "VanEck",
    category: "Semiconductors",
    group: "Semiconductors",
    focus: "Semiconductor companies",
    referenceExpenseRatio: 0.35,
    providerUrl: "https://www.vaneck.com/us/en/investments/semiconductor-etf-smh/",
    concentrationRisk:
      "Single-industry fund; top holdings (e.g. the largest chip makers) can exceed 10–20% each.",
  },
];

export const TICKERS = ETFS.map((e) => e.ticker);

export const ETF_BY_TICKER: Record<string, EtfDefinition> = Object.fromEntries(
  ETFS.map((e) => [e.ticker, e]),
);

export const COMPARISON_PRESETS: { label: string; tickers: string[] }[] = [
  { label: "VOO vs. VTI", tickers: ["VOO", "VTI"] },
  { label: "SCHG vs. VUG", tickers: ["SCHG", "VUG"] },
  { label: "VGT vs. FTEC", tickers: ["VGT", "FTEC"] },
  { label: "SCHF vs. SCHE vs. VXUS", tickers: ["SCHF", "SCHE", "VXUS"] },
  { label: "SOXQ vs. SOXX vs. SMH", tickers: ["SOXQ", "SOXX", "SMH"] },
];

export function annualFee(investment: number, expenseRatioPct: number): number {
  return investment * (expenseRatioPct / 100);
}

export function isTrackedTicker(t: string): boolean {
  return t.toUpperCase() in ETF_BY_TICKER;
}
