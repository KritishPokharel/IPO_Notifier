import { MassiveCloseProvider } from "./massive";
import { TiingoProvider } from "./tiingo";
import { TwelveDataProvider } from "./twelvedata";
import type { PrimaryProvider, SecondaryCloseProvider, SecondaryQuoteProvider } from "./types";

export interface ProviderSet {
  primary: PrimaryProvider | null;
  secondaryClose: SecondaryCloseProvider | null;
  secondaryQuote: SecondaryQuoteProvider | null;
  missing: string[];
}

export function providersFromEnv(env: NodeJS.ProcessEnv = process.env, opts: { allowSlowSecondary?: boolean } = {}): ProviderSet {
  const missing: string[] = [];
  const primary = env.TIINGO_API_KEY ? new TiingoProvider(env.TIINGO_API_KEY) : null;
  if (!primary) missing.push("TIINGO_API_KEY");

  let secondaryClose: SecondaryCloseProvider | null = null;
  const pref = (env.SECONDARY_CLOSE_PROVIDER ?? "auto").toLowerCase();
  if ((pref === "auto" || pref === "massive") && env.MASSIVE_API_KEY) {
    secondaryClose = new MassiveCloseProvider(env.MASSIVE_API_KEY);
  } else if ((pref === "auto" || pref === "twelvedata") && env.TWELVEDATA_API_KEY && opts.allowSlowSecondary !== false) {
    secondaryClose = new TwelveDataProvider(env.TWELVEDATA_API_KEY);
  }
  if (!secondaryClose && pref !== "none") missing.push("MASSIVE_API_KEY or TWELVEDATA_API_KEY (closing-price cross-check)");

  const secondaryQuote =
    env.TWELVEDATA_API_KEY && opts.allowSlowSecondary !== false ? new TwelveDataProvider(env.TWELVEDATA_API_KEY) : null;

  return { primary, secondaryClose, secondaryQuote, missing };
}
