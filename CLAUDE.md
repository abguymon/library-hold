# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Install & run

```bash
uv tool install .           # install globally
uv tool install --editable . # editable install for development
library-hold --help
```

No external dependencies — stdlib only. Requires Python ≥ 3.13 (uses `type` aliases and structural pattern matching).

## Architecture

Everything lives in a single file: `library_hold/main.py`.

**Layers (top to bottom):**

1. **Config** (`load_config` / `save_config`) — reads/writes `~/.library-hold/config.json` (chmod 600). Stores card number, PIN, bearer token, refresh token, patron ID, and default pickup location.

2. **HTTP** (`post_form`, `api_get`, `api_post`) — thin wrappers around `urllib`. `_add_api_headers` attaches the four required III Vega headers plus Bearer auth to every authenticated request.

3. **Auth** (`ensure_auth`) — called at the start of every authenticated command. Checks JWT expiry, tries refresh grant, falls back to password grant. Silently saves updated tokens to config.

4. **Business logic** (`_do_search`, `_place_hold`, `_check_hold_headroom`, `_current_hold_count`) — catalog search and hold placement.

5. **Commands** (`cmd_*`) — one function per subcommand, wired up in `main()` via a dispatch dict.

## Key constants

| Name | Value | Purpose |
|------|-------|---------|
| `AUTH_URL` | `https://auth.na3.iiivega.com/...` | Keycloak token endpoint |
| `BASE_URL` | `https://na3.iiivega.com` | API base |
| `API_HEADERS` | dict | Required III Vega headers on every API call |
| `DEFAULT_PICKUP` | `"47"` | Meridian Orchard Park Branch |
| `HOLD_LIMIT` | `15` | Eagle Public Library per-patron hold cap |
| `FORMAT_IDS` | dict | Maps `book/game/dvd/bluray` → numeric material type IDs |

## Hold placement

`_place_hold` POSTs to `/api/search-result/gates/tab-hold`. The `formatGroupId` (UUID) comes from search results and is the primary identifier for placing a hold. `patronId` falls back to `cardNumber` if not set separately.
