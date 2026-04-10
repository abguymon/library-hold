# library-hold

Manage library holds for any III Vega / LYNX catalog system from the terminal or a self-hosted web UI.

- **CLI** — search, request holds, track reading, and automate picture-book curation
- **Web UI** — Next.js dashboard with book covers, queue positions, and hold management
- Defaults to **Eagle Public Library** (`eagle-lynx.na3.iiivega.com`); configurable for any III Vega library

---

## Contents

- [CLI](#cli)
  - [Install](#install)
  - [First-time setup](#first-time-setup)
  - [Commands](#commands)
  - [Picture book automation](#picture-book-automation)
  - [Cron automation](#cron-automation)
- [Web UI — Docker deployment](#web-ui--docker-deployment)
  - [Quick start](#quick-start)
  - [Environment variables](#environment-variables)
  - [Traefik + Authelia setup](#traefik--authelia-setup)
- [Per-library configuration](#per-library-configuration)
- [Config file](#config-file)
- [Security](#security)

---

## CLI

### Install

Requires Node.js 18+.

```bash
git clone <repo>
cd library-holder
npm install
npm run build          # compiles TypeScript to dist/
```

For development (ts-node, no build step):
```bash
npm run dev -- --help
```

To install globally so `library-hold` is available everywhere:
```bash
npm install -g .
```

---

### First-time setup

```bash
library-hold login
```

Prompts for your library card number and PIN. Credentials are saved to `~/.library-hold/config.json`. Tokens refresh automatically — you won't be prompted again during normal use.

Non-interactive (for scripts):
```bash
library-hold login --card 20076001025739 --pin 1234
```

If your library isn't Eagle Public Library, also run:
```bash
library-hold configure
```

See [Per-library configuration](#per-library-configuration).

---

### Commands

#### `library-hold search <query>`

Search the catalog. Displays title, author, year, availability, and the `formatGroupId` needed to place a hold.

```bash
library-hold search "ursula le guin"
library-hold search --format book "dune"
library-hold search --format game "zelda"
library-hold search --format dvd "the matrix"
library-hold search --format bluray "inception"
```

**Format options:** `book`, `game`, `dvd`, `bluray`. Omit to search all formats.

---

#### `library-hold go <query>`

The main daily-use command — searches, shows numbered results, prompts to pick one, and places the hold.

```bash
library-hold go "green eggs and ham"
library-hold go --format game "breath of the wild"
```

---

#### `library-hold request <formatGroupId>`

Place a hold directly by UUID (from `search` output).

```bash
library-hold request a1b2c3d4-...
library-hold request --pickup 12 a1b2c3d4-...
```

---

#### `library-hold batch <title> [<title> ...]`

Search for multiple titles and auto-request the top result for each. Stops cleanly when the hold limit is reached.

```bash
library-hold batch "Dune" "Foundation" "Neuromancer"
library-hold batch --file reading-list.txt
library-hold batch "Dune" --file rest-of-list.txt
library-hold batch --format game "Hades" "Celeste" "Hollow Knight"
```

**File format** (one title per line, `#` for comments):
```
# SciFi classics
Dune
Foundation
```

---

#### `library-hold holds`

List current holds with queue position or pickup-ready status.

```
Your holds (4/15):

  1. Dune (Book)
     #3 of 6 in queue — Meridian Orchard Park Branch

  2. Breath of the Wild (Video Game)
     Ready for pickup! — Meridian Orchard Park Branch
```

---

#### `library-hold checkouts`

List checked-out items with due dates.

---

#### `library-hold locations`

List all pickup locations and their IDs. Your current default is marked.

---

### Picture book automation

Commands for curating a picture book reading list using the bundled Caldecott Medal/Honor list (~380 titles).

#### `library-hold books`

List picture books with read/unread/skip status and ratings.

```bash
library-hold books
library-hold books --filter unread
library-hold books --filter read
```

---

#### `library-hold read <search-term>`

Mark a book as read. Optionally record a rating.

```bash
library-hold read "where the wild things are"
library-hold read --rating 5 "goodnight moon"
```

---

#### `library-hold skip <search-term>`

Mark a book to never auto-request (disliked or not appropriate).

```bash
library-hold skip "in the night kitchen"
```

---

#### `library-hold topup [--target 10]`

Bring picture book holds up to target count (default 10). Searches the catalog for unread, non-skipped books, prioritizing Caldecott Medal winners over Honor books, and places holds until the target is met or the hold limit is reached.

```bash
library-hold topup
library-hold topup --target 8
```

Output:
```
Picture book holds: 6 / 10 target (4 needed)
Placed: The Snowy Day, Sylvester and the Magic Pebble, Frog and Toad Are Friends
Not found in catalog: The Funny Little Woman
```

---

### Cron automation

To automatically top up picture book holds every other day at 9am, add to your crontab:

```bash
crontab -e
```

```
0 9 */2 * * library-hold topup --target 10
```

Adjust the target and schedule to taste. The command is idempotent — if you're already at or above the target it does nothing.

---

## Web UI — Docker deployment

### Quick start

1. Copy `docker-compose.yml` and create a `.env` file beside it:

```bash
cp docker-compose.yml /path/to/your/stack/
```

```env
# .env
LIBRARY_CARD=20076001025739
LIBRARY_PIN=1234

# Optional — only needed if not using Eagle Public Library
# LIBRARY_DOMAIN=your-library.na3.iiivega.com
# LIBRARY_HOME_CODE=21
# LIBRARY_PICKUP=47
# HOLD_LIMIT=15
```

2. Edit the Traefik host rule in `docker-compose.yml` (see [Traefik + Authelia setup](#traefik--authelia-setup)).

3. Start:

```bash
docker compose up -d
```

The web UI is available at the domain you configured.

---

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LIBRARY_CARD` | Yes | — | Library card number |
| `LIBRARY_PIN` | Yes | — | Library PIN |
| `LIBRARY_DOMAIN` | No | `eagle-lynx.na3.iiivega.com` | III Vega domain for your library |
| `LIBRARY_HOME_CODE` | No | `21` | Home location code (from `locations` command) |
| `LIBRARY_PICKUP` | No | `47` | Default pickup location ID |
| `HOLD_LIMIT` | No | `15` | Per-patron hold cap at your library |
| `BOOKS_DATA_PATH` | No | `/data/books.json` | Path inside container for tracking data |

Auth tokens are cached in the `library-hold-config` volume so the app doesn't re-authenticate on every restart.

---

### Traefik + Authelia setup

The `docker-compose.yml` is pre-configured for a standard Traefik v2/v3 + Authelia stack. You need:

- A running Traefik instance with an external Docker network named `proxy`
- An Authelia middleware named `authelia` already defined in Traefik's dynamic config or another compose file

**Step 1 — Set your domain**

Edit the host rule label in `docker-compose.yml`:

```yaml
- "traefik.http.routers.library-hold.rule=Host(`library.yourdomain.com`)"
```

**Step 2 — TLS certificate resolver**

The compose file uses `letsencrypt` as the cert resolver. If yours is named differently, update:

```yaml
- "traefik.http.routers.library-hold.tls.certresolver=letsencrypt"
```

To use Traefik's default cert (e.g., for internal-only with a wildcard), remove the `certresolver` line and keep only:

```yaml
- "traefik.http.routers.library-hold.tls=true"
```

**Step 3 — Authelia middleware**

The compose file references an Authelia middleware from Docker labels:

```yaml
- "traefik.http.routers.library-hold.middlewares=authelia@docker"
```

If your Authelia middleware is defined in a file provider instead of Docker labels, use `authelia@file`. If your middleware has a different name, update accordingly.

To disable Authelia protection entirely (not recommended — exposes your library credentials), remove the `middlewares` label.

**Step 4 — External network**

The compose file joins the `proxy` network, which must already exist:

```bash
docker network create proxy
```

If your Traefik network has a different name, update the `networks` section in `docker-compose.yml`:

```yaml
networks:
  proxy:
    external: true
```

**Volumes**

Two named volumes are created automatically:

| Volume | Mounted at | Contains |
|---|---|---|
| `library-hold-data` | `/data` | `books.json` — read/skip/rating tracking |
| `library-hold-config` | `/root/.library-hold` | `config.json` — cached auth tokens |

To back up your reading data:

```bash
docker run --rm -v library-hold-data:/data alpine cat /data/books.json > books-backup.json
```

To restore:

```bash
docker run --rm -v library-hold-data:/data -i alpine sh -c 'cat > /data/books.json' < books-backup.json
```

---

## Per-library configuration

The CLI and web UI default to Eagle Public Library. To use a different III Vega / LYNX library:

**CLI:**
```bash
library-hold configure
```

Prompts for your library's domain and home code, saves to `~/.library-hold/config.json`.

**Manual config edit** (`~/.library-hold/config.json`):
```json
{
  "libraryDomain": "your-library.na3.iiivega.com",
  "libraryHomeCode": "21"
}
```

**Docker** — set environment variables in `.env`:
```env
LIBRARY_DOMAIN=your-library.na3.iiivega.com
LIBRARY_HOME_CODE=21
LIBRARY_PICKUP=47
```

To find your library's domain and location codes, check your library's website or catalog URL. The `library-hold locations` command (after logging in) will list all pickup location IDs.

---

## Config file

Located at `~/.library-hold/config.json`, created `chmod 600` on first login.

```json
{
  "cardNumber": "20076001025739",
  "pin": "1234",
  "bearerToken": "...",
  "refreshToken": "...",
  "patronId": "...",
  "pickupLocation": "47",
  "libraryDomain": "eagle-lynx.na3.iiivega.com",
  "libraryHomeCode": "21",
  "holdLimit": 15
}
```

`pickupLocation` defaults to `47` (Meridian Orchard Park Branch). Run `library-hold locations` to see all options.

In Docker, `LIBRARY_CARD` and `LIBRARY_PIN` from environment variables are used as the initial credentials. Once authenticated, tokens are written to the config volume and reused on restart.

---

## Security

Credentials are stored in plaintext at `~/.library-hold/config.json` (or the config volume in Docker). The file is created `chmod 600`. Treat it like any credential file — don't commit it to version control.

The Docker deployment is designed to sit behind Authelia, so the web UI itself requires SSO authentication before anything library-related is accessible.
