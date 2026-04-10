import { type Config, loadConfig, saveConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Constants / defaults
// ---------------------------------------------------------------------------

export const DEFAULT_LIBRARY_DOMAIN = "eagle-lynx.na3.iiivega.com";
export const DEFAULT_HOME_CODE = "21";
export const DEFAULT_PICKUP = "47";
export const DEFAULT_HOLD_LIMIT = 15;

const AUTH_URL =
  "https://auth.na3.iiivega.com/auth/realms/lynx/protocol/openid-connect/token";
const BASE_URL = "https://na3.iiivega.com";
const CLIENT_ID = "convergence";

export const FORMAT_IDS: Record<string, string> = {
  book:   "1",
  game:   "44",
  dvd:    "2",
  bluray: "9",
};

export const FORMAT_NAMES: Record<string, string> = {
  "1":  "Book",
  "44": "Game",
  "2":  "DVD",
  "9":  "Blu-ray",
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface Availability {
  totalCopies?: number;
  availableCopies?: number;
  totalHolds?: number;
}

export interface Agent {
  id?: string;
  label?: string;
  name?: string;
}

export interface MaterialTab {
  name?: string;
  type?: string;
}

export interface SearchResult {
  id: string;
  title?: string;
  primaryAgent?: Agent | Agent[] | string;
  publicationYear?: string;
  publicationDate?: string;
  availability?: Availability;
  materialType?: string;
  materialTabs?: MaterialTab[];
  coverUrl?: { small?: string; medium?: string; large?: string };
}

export interface HoldResource {
  title?: string;
  materialType?: string;
}

export interface Hold {
  id?: string;
  resource?: HoldResource;
  location?: string | number;
  frozen?: boolean;
  status?: number;
  priority?: number;
  priorityQueueLength?: number;
}

export interface CheckoutResource {
  title?: string;
  materialType?: string;
}

export interface Checkout {
  resource?: CheckoutResource;
  dueDate?: string;
  due?: string;
  dueDateTime?: string;
  renewalCount?: number;
  renewalsRemaining?: number;
}

export interface PickupLocation {
  id?: string | number;
  name?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiHeaders(cfg: Config, version: "1" | "2" = "1"): Record<string, string> {
  const domain = cfg.libraryDomain ?? DEFAULT_LIBRARY_DOMAIN;
  const homeCode = cfg.libraryHomeCode ?? DEFAULT_HOME_CODE;
  return {
    "api-version": version,
    "iii-customer-domain": domain,
    "iii-host-domain": domain,
    "iii-user-home-library-code": homeCode,
  };
}

export function holdLimit(cfg: Config): number {
  return cfg.holdLimit ?? DEFAULT_HOLD_LIMIT;
}

/** Decode the `exp` claim from a JWT without any deps. Returns 0 on failure. */
export function jwtExp(token: string): number {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return 0;
    const payload = parts[1]!;
    // base64url → base64
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/")
      + "=".repeat((4 - (payload.length % 4)) % 4);
    const data = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as
      Record<string, unknown>;
    return typeof data["exp"] === "number" ? data["exp"] : 0;
  } catch {
    return 0;
  }
}

function extractResults(data: unknown): SearchResult[] {
  if (Array.isArray(data)) return data as SearchResult[];
  if (data !== null && typeof data === "object") {
    for (const key of ["data", "results", "items", "formatGroups"]) {
      const val = (data as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as SearchResult[];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

async function parseError(res: Response): Promise<HttpError> {
  const body = await res.text().catch(() => "");
  let message = body;
  try {
    const data = JSON.parse(body) as Record<string, unknown>;
    message =
      typeof data["message"] === "string" ? data["message"] :
      typeof data["error_description"] === "string" ? data["error_description"] :
      body;
  } catch {
    // use raw body
  }
  return new HttpError(res.status, body, message || res.statusText);
}

async function postForm(
  url: string,
  data: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data).toString(),
  });
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<Record<string, unknown>>;
}

async function apiGet(path: string, cfg: Config): Promise<unknown> {
  const res = await fetch(BASE_URL + path, {
    headers: {
      Authorization: `Bearer ${cfg.bearerToken ?? ""}`,
      ...apiHeaders(cfg),
    },
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

async function apiPost(
  path: string,
  cfg: Config,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.bearerToken ?? ""}`,
      "Content-Type": "application/json",
      ...apiHeaders(cfg),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

async function apiPatch(
  path: string,
  cfg: Config,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(BASE_URL + path, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${cfg.bearerToken ?? ""}`,
      "Content-Type": "application/json",
      ...apiHeaders(cfg),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return res.json().catch(() => null);
}

async function apiDelete(path: string, cfg: Config): Promise<void> {
  const res = await fetch(BASE_URL + path, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${cfg.bearerToken ?? ""}`,
      ...apiHeaders(cfg),
    },
  });
  if (!res.ok) throw await parseError(res);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function doLogin(
  cfg: Config,
  card: string,
  pin: string,
): Promise<Record<string, unknown>> {
  return postForm(AUTH_URL, {
    grant_type: "password",
    client_id: CLIENT_ID,
    username: card,
    password: pin,
  });
}

async function doRefresh(refreshToken: string): Promise<Record<string, unknown>> {
  return postForm(AUTH_URL, {
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });
}

/**
 * Ensure `cfg` has a valid bearer token, refreshing or re-logging in as needed.
 * Returns an updated config (already persisted). Throws if credentials are missing.
 */
export async function ensureAuth(cfg: Config): Promise<Config> {
  const bearer = cfg.bearerToken ?? "";
  if (bearer && jwtExp(bearer) - Date.now() / 1000 > 60) {
    return cfg;
  }

  // Try refresh
  if (cfg.refreshToken) {
    try {
      const resp = await doRefresh(cfg.refreshToken);
      cfg.bearerToken = resp["access_token"] as string;
      cfg.refreshToken = resp["refresh_token"] as string;
      saveConfig(cfg);
      return cfg;
    } catch {
      // fall through to password grant
    }
  }

  // Fall back to password grant
  const card = cfg.cardNumber;
  const pin = cfg.pin;
  if (!card || !pin) {
    throw new Error("Not logged in. Run `library-hold login` first.");
  }

  try {
    const resp = await doLogin(cfg, card, pin);
    cfg.bearerToken = resp["access_token"] as string;
    cfg.refreshToken = resp["refresh_token"] as string;
    saveConfig(cfg);
    return cfg;
  } catch (e) {
    const code = e instanceof HttpError ? ` (${e.status})` : "";
    throw new Error(
      `Re-authentication failed${code}. Run \`library-hold login\` to update your credentials.`,
    );
  }
}

/** Perform login and persist all tokens to config. */
export async function login(
  card: string,
  pin: string,
  existingCfg?: Config,
): Promise<Config> {
  const cfg = existingCfg ?? loadConfig();
  const resp = await doLogin(cfg, card, pin);
  const updated: Config = {
    ...cfg,
    cardNumber: card,
    pin,
    bearerToken: resp["access_token"] as string,
    refreshToken: resp["refresh_token"] as string,
    patronId: card,
  };
  if (!updated.pickupLocation) {
    updated.pickupLocation = DEFAULT_PICKUP;
  }
  saveConfig(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function authorStr(agent: unknown): string {
  if (Array.isArray(agent)) {
    const first = agent[0] as Record<string, unknown> | undefined;
    if (!first) return "";
    // v2 API: {id, label}; v1 API: {name}
    if (typeof first["label"] === "string") return first["label"];
    if (typeof first["name"] === "string") return first["name"];
    return String(first);
  }
  if (agent !== null && typeof agent === "object") {
    const obj = agent as Record<string, unknown>;
    // v2 API: primaryAgent is a single object {id, label}
    if (typeof obj["label"] === "string") return obj["label"];
    if (typeof obj["name"] === "string") return obj["name"];
  }
  if (typeof agent === "string") return agent;
  return "";
}

export function availStr(avail: Availability | undefined): string {
  if (!avail) return "";
  const total = avail.totalCopies ?? 0;
  const available = avail.availableCopies ?? 0;
  const holds = avail.totalHolds ?? 0;
  if (!total) return "availability unknown";
  let s = `${available}/${total} copies available`;
  if (holds) s += `, ${holds} hold${holds !== 1 ? "s" : ""}`;
  return s;
}

// ---------------------------------------------------------------------------
// Business logic
// ---------------------------------------------------------------------------

export async function search(
  cfg: Config,
  query: string,
  formatId?: string,
): Promise<SearchResult[]> {
  // API v2 uses POST with JSON body. The search field is "searchText" (not "query").
  const body: Record<string, unknown> = {
    searchText: query,
    searchType: "everything",
    pageSize: 10,
  };
  if (formatId) body["materialTypeIds"] = [formatId];
  const res = await fetch(`${BASE_URL}/api/search-result/search/format-groups`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.bearerToken ?? ""}`,
      "Content-Type": "application/json",
      ...apiHeaders(cfg, "2"),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  const data = await res.json();
  return extractResults(data);
}

export async function getHolds(cfg: Config): Promise<Hold[]> {
  const data = await apiGet("/api/search-result/patrons/me/holds", cfg);
  return (Array.isArray(data) ? data : extractResults(data)) as Hold[];
}

export async function getCheckouts(cfg: Config): Promise<Checkout[]> {
  const data = await apiGet("/api/search-result/patrons/me/checkouts", cfg);
  return (Array.isArray(data) ? data : extractResults(data)) as Checkout[];
}

export async function getLocations(cfg: Config): Promise<PickupLocation[]> {
  const data = await apiGet("/api/search-result/gates/pickup-locations", cfg);
  return (Array.isArray(data) ? data : extractResults(data)) as PickupLocation[];
}

export async function currentHoldCount(cfg: Config): Promise<number | null> {
  try {
    return (await getHolds(cfg)).length;
  } catch {
    return null;
  }
}

export async function checkHoldHeadroom(cfg: Config): Promise<void> {
  const count = await currentHoldCount(cfg);
  const limit = holdLimit(cfg);
  if (count !== null && count >= limit) {
    throw new Error(
      `Hold limit reached (${count}/${limit}). Pick up or cancel a hold before requesting more.`,
    );
  }
}

export async function placeHold(
  cfg: Config,
  formatGroupId: string,
  pickup?: string,
  title?: string,
): Promise<boolean> {
  const body: Record<string, unknown> = {
    patronId: cfg.patronId ?? cfg.cardNumber,
    pickupLocation: pickup ?? cfg.pickupLocation ?? DEFAULT_PICKUP,
    formatGroupId,
    materialTypeName: "Book",
    borrowByMail: false,
    pickupAreaId: "",
  };
  try {
    await apiPost("/api/search-result/gates/tab-hold", cfg, body);
    const titleStr = title ? ` "${title}"` : "";
    console.log(`Hold placed successfully${titleStr}!`);
    return true;
  } catch (e) {
    const msg = e instanceof HttpError ? `(${e.status}): ${e.message}` : String(e);
    console.error(`Failed to place hold ${msg}`);
    return false;
  }
}

export async function cancelHold(cfg: Config, holdId: string): Promise<void> {
  await apiDelete(`/api/search-result/gates/holds/${holdId}`, cfg);
}

export async function freezeHold(
  cfg: Config,
  holdId: string,
  frozen: boolean,
): Promise<void> {
  await apiPatch(`/api/search-result/gates/holds/${holdId}`, cfg, { frozen });
}

export function resolveFormat(fmt: string | undefined): string | undefined {
  if (!fmt) return undefined;
  const key = fmt.toLowerCase();
  const id = FORMAT_IDS[key];
  if (!id) {
    throw new Error(`Unknown format '${fmt}'. Choose from: ${Object.keys(FORMAT_IDS).join(", ")}`);
  }
  return id;
}
