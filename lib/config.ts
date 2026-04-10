import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONFIG_DIR = path.join(os.homedir(), ".library-hold");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

/** Persisted configuration — backward compatible with the Python implementation. */
export interface Config {
  // Auth
  cardNumber?: string;
  pin?: string;
  bearerToken?: string;
  refreshToken?: string;
  patronId?: string;

  // Preferences
  pickupLocation?: string;

  // Library-specific (configurable via `library-hold configure`)
  libraryDomain?: string;    // e.g. "eagle-lynx.na3.iiivega.com"
  libraryHomeCode?: string;  // e.g. "21"
  holdLimit?: number;        // default: 15

  // Author watchlist — topup prioritizes unread titles from these authors
  watchedAuthors?: string[];
}

/**
 * Load config, merging environment variables as defaults with the JSON file
 * taking precedence (so persisted tokens from the file win over env vars).
 *
 * Environment variables (useful for Docker deployments):
 *   LIBRARY_CARD        — library card number (= cardNumber)
 *   LIBRARY_PIN         — library PIN
 *   LIBRARY_DOMAIN      — e.g. "eagle-lynx.na3.iiivega.com"
 *   LIBRARY_HOME_CODE   — e.g. "21"
 *   LIBRARY_PICKUP      — default pickup location id
 *   HOLD_LIMIT          — per-patron hold cap
 */
export function loadConfig(): Config {
  const fromEnv: Config = {};
  if (process.env["LIBRARY_CARD"])      fromEnv.cardNumber      = process.env["LIBRARY_CARD"];
  if (process.env["LIBRARY_PIN"])       fromEnv.pin             = process.env["LIBRARY_PIN"];
  if (process.env["LIBRARY_DOMAIN"])    fromEnv.libraryDomain   = process.env["LIBRARY_DOMAIN"];
  if (process.env["LIBRARY_HOME_CODE"]) fromEnv.libraryHomeCode = process.env["LIBRARY_HOME_CODE"];
  if (process.env["LIBRARY_PICKUP"])    fromEnv.pickupLocation  = process.env["LIBRARY_PICKUP"];
  const limit = parseInt(process.env["HOLD_LIMIT"] ?? "", 10);
  if (!isNaN(limit) && limit > 0)       fromEnv.holdLimit       = limit;

  if (!fs.existsSync(CONFIG_PATH)) return fromEnv;
  try {
    const fromFile = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Config;
    // File wins (it has persisted bearer/refresh tokens env vars don't have)
    return { ...fromEnv, ...fromFile };
  } catch {
    return fromEnv;
  }
}

export function saveConfig(cfg: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
