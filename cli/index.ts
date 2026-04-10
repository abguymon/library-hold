#!/usr/bin/env node
import readline from "node:readline";
import fs from "node:fs";
import { Command } from "commander";
import {
  loadBundledBooks,
  getMergedBooks,
  findBook,
  markRead,
  markSkip,
} from "../lib/books.js";
import {
  loadCoverCache,
  saveCoverCache,
  getCoverUrl,
  cacheKey,
} from "../lib/covers.js";
import { runTopup } from "../lib/topup.js";
import {
  loadConfig,
  saveConfig,
  type Config,
} from "../lib/config.js";
import {
  ensureAuth,
  login,
  search,
  getHolds,
  getCheckouts,
  getLocations,
  currentHoldCount,
  placeHold,
  resolveFormat,
  authorStr,
  availStr,
  HttpError,
  DEFAULT_LIBRARY_DOMAIN,
  DEFAULT_HOME_CODE,
  DEFAULT_HOLD_LIMIT,
  DEFAULT_PICKUP,
  holdLimit,
} from "../lib/iiivega.js";
// Note: cancelHold and freezeHold are used only by the web UI

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    process.stdout.write(question);
    // Hide input
    process.stdin.resume();
    (process.stdin as NodeJS.ReadStream).setRawMode?.(true);
    let input = "";
    process.stdin.on("data", function handler(buf: Buffer) {
      const char = buf.toString();
      if (char === "\r" || char === "\n") {
        (process.stdin as NodeJS.ReadStream).setRawMode?.(false);
        process.stdin.removeListener("data", handler);
        process.stdout.write("\n");
        rl.close();
        resolve(input);
      } else if (char === "\u0003") {
        process.exit(0);
      } else if (char === "\u007f" || char === "\b") {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    });
  });
}

function printResults(query: string, results: Awaited<ReturnType<typeof search>>): void {
  console.log(`\nSearch results for "${query}":\n`);
  for (let i = 0; i < results.length; i++) {
    const item = results[i]!;
    const title = item.title ?? "Unknown title";
    const author = authorStr(item.primaryAgent);
    const year = item.publicationYear ?? "";
    const avail = availStr(item.availability);

    console.log(`  ${i + 1}. ${title}`);
    if (author) console.log(`     Author: ${author}`);
    if (year)   console.log(`     Year:   ${year}`);
    if (avail)  console.log(`     Avail:  ${avail}`);
    console.log(`     ID:     ${item.id}`);
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdLogin(opts: { card?: string; pin?: string }): Promise<void> {
  const card = opts.card ?? await prompt("Library card number: ");
  const pin  = opts.pin  ?? await promptSecret("PIN: ");
  try {
    await login(card, pin);
    console.log("Logged in successfully.");
  } catch (e) {
    die(`Login failed: ${e instanceof HttpError ? `(${e.status}) ${e.message}` : String(e)}`);
  }
}

async function cmdConfigure(): Promise<void> {
  const cfg = loadConfig();
  console.log("\nConfigure library connection\n");
  console.log(`Current library domain: ${cfg.libraryDomain ?? DEFAULT_LIBRARY_DOMAIN}`);
  const domain = await prompt(
    `Library domain [${DEFAULT_LIBRARY_DOMAIN}]: `,
  );
  const homeCode = await prompt(
    `Home library code [${cfg.libraryHomeCode ?? DEFAULT_HOME_CODE}]: `,
  );
  const limitInput = await prompt(
    `Hold limit [${cfg.holdLimit ?? DEFAULT_HOLD_LIMIT}]: `,
  );
  const pickupInput = await prompt(
    `Default pickup location id [${cfg.pickupLocation ?? DEFAULT_PICKUP}]: `,
  );

  const updated: Config = {
    ...cfg,
    libraryDomain:   domain    || cfg.libraryDomain   || DEFAULT_LIBRARY_DOMAIN,
    libraryHomeCode: homeCode  || cfg.libraryHomeCode  || DEFAULT_HOME_CODE,
    pickupLocation:  pickupInput || cfg.pickupLocation  || DEFAULT_PICKUP,
  };
  const limit = parseInt(limitInput, 10);
  if (!isNaN(limit) && limit > 0) updated.holdLimit = limit;

  saveConfig(updated);
  console.log("Configuration saved.");
}

async function cmdSearch(query: string, opts: { format?: string }): Promise<void> {
  const cfg = await ensureAuth(loadConfig()).catch((e) => die(String(e)));
  let formatId: string | undefined;
  try {
    formatId = resolveFormat(opts.format);
  } catch (e) {
    die(String(e));
  }
  const results = await search(cfg, query, formatId).catch((e) => {
    die(`Search failed: ${e instanceof HttpError ? `(${e.status}) ${e.message}` : String(e)}`);
  });
  if (!results.length) {
    console.log("No results found.");
    return;
  }
  printResults(query, results);
}

async function cmdRequest(
  formatGroupId: string,
  opts: { pickup?: string },
): Promise<void> {
  const cfg = await ensureAuth(loadConfig()).catch((e) => die(String(e)));
  const count = await currentHoldCount(cfg);
  const limit = holdLimit(cfg);
  if (count !== null && count >= limit) {
    die(`Hold limit reached (${count}/${limit}). Pick up or cancel a hold before requesting more.`);
  }
  await placeHold(cfg, formatGroupId, opts.pickup);
}

async function cmdHolds(): Promise<void> {
  const cfg = await ensureAuth(loadConfig()).catch((e) => die(String(e)));
  const holds = await getHolds(cfg).catch((e) => {
    die(`Failed to fetch holds: ${e instanceof HttpError ? `(${e.status}) ${e.message}` : String(e)}`);
  });
  if (!holds.length) {
    console.log("No current holds.");
    return;
  }

  // Fetch location names for display
  const locNames: Record<string, string> = {};
  try {
    const locs = await getLocations(cfg);
    for (const loc of locs) {
      if (loc.id != null) locNames[String(loc.id)] = loc.name ?? "";
    }
  } catch {
    // non-fatal
  }

  const limit = holdLimit(cfg);
  console.log(`\nYour holds (${holds.length}/${limit}):\n`);
  for (let i = 0; i < holds.length; i++) {
    const hold = holds[i]!;
    const title = hold.resource?.title ?? "Unknown title";
    const fmt = hold.resource?.materialType ?? "";
    const fmtStr = fmt ? ` (${fmt})` : "";
    const locName = locNames[String(hold.location ?? "")] ?? String(hold.location ?? "");

    let statusStr: string;
    if (hold.frozen) {
      statusStr = "Frozen (paused)";
    } else if (hold.status === 1) {
      statusStr = "Ready for pickup!";
    } else if (hold.priority != null && hold.priorityQueueLength != null) {
      statusStr = `#${hold.priority} of ${hold.priorityQueueLength} in queue`;
    } else if (hold.priority != null) {
      statusStr = `#${hold.priority} in queue`;
    } else {
      statusStr = "Waiting";
    }

    console.log(`  ${i + 1}. ${title}${fmtStr}`);
    console.log(`     ${statusStr} — ${locName}`);
    console.log();
  }
}

async function cmdCheckouts(): Promise<void> {
  const cfg = await ensureAuth(loadConfig()).catch((e) => die(String(e)));
  const checkouts = await getCheckouts(cfg).catch((e) => {
    die(`Failed to fetch checkouts: ${e instanceof HttpError ? `(${e.status}) ${e.message}` : String(e)}`);
  });
  if (!checkouts.length) {
    console.log("Nothing currently checked out.");
    return;
  }

  console.log(`\nCurrently checked out (${checkouts.length}):\n`);
  for (let i = 0; i < checkouts.length; i++) {
    const item = checkouts[i]!;
    const title = item.resource?.title ?? "Unknown title";
    const fmt = item.resource?.materialType ?? "";
    const fmtStr = fmt ? ` (${fmt})` : "";

    let due = item.dueDate ?? item.due ?? item.dueDateTime ?? "";
    if (due.includes("T")) due = due.slice(0, 10);
    const dueStr = due ? `Due ${due}` : "Due date unknown";

    const renewals = item.renewalCount ?? item.renewalsRemaining;
    const renewalStr = renewals != null ? `, ${renewals} renewal(s) remaining` : "";

    console.log(`  ${i + 1}. ${title}${fmtStr}`);
    console.log(`     ${dueStr}${renewalStr}`);
    console.log();
  }
}

async function cmdLocations(): Promise<void> {
  const cfg = await ensureAuth(loadConfig()).catch((e) => die(String(e)));
  const locations = await getLocations(cfg).catch((e) => {
    die(`Failed to get locations: ${e instanceof HttpError ? `(${e.status}) ${e.message}` : String(e)}`);
  });
  const current = String(cfg.pickupLocation ?? DEFAULT_PICKUP);

  console.log("\nPickup locations:\n");
  for (const loc of locations) {
    const id = String(loc.id ?? "?");
    const name = loc.name ?? "Unknown";
    const marker = id === current ? "  <-- your default" : "";
    console.log(`  ${id.padStart(5)}: ${name}${marker}`);
  }
  console.log();
}

async function cmdGo(query: string, opts: { format?: string }): Promise<void> {
  const cfg = await ensureAuth(loadConfig()).catch((e) => die(String(e)));
  let formatId: string | undefined;
  try {
    formatId = resolveFormat(opts.format);
  } catch (e) {
    die(String(e));
  }
  const results = await search(cfg, query, formatId).catch((e) => {
    die(`Search failed: ${e instanceof HttpError ? `(${e.status}) ${e.message}` : String(e)}`);
  });

  if (!results.length) {
    console.log("No results found.");
    return;
  }
  printResults(query, results);

  while (true) {
    let choice: string;
    try {
      choice = await prompt(`Which would you like to request? (1-${results.length}, or q to quit): `);
    } catch {
      console.log("\nCancelled.");
      return;
    }
    if (choice.toLowerCase() === "q") {
      console.log("Cancelled.");
      return;
    }
    const idx = parseInt(choice, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= results.length) {
      const item = results[idx - 1]!;
      const count = await currentHoldCount(cfg);
      const limit = holdLimit(cfg);
      if (count !== null && count >= limit) {
        die(`Hold limit reached (${count}/${limit}). Pick up or cancel a hold before requesting more.`);
      }
      await placeHold(cfg, item.id, undefined, item.title);
      return;
    }
    console.log(`Please enter a number between 1 and ${results.length}.`);
  }
}

async function cmdBatch(
  titles: string[],
  opts: { file?: string; format?: string },
): Promise<void> {
  const cfg = await ensureAuth(loadConfig()).catch((e) => die(String(e)));

  const allTitles = [...titles];
  if (opts.file) {
    try {
      const lines = fs.readFileSync(opts.file, "utf8").split("\n");
      for (const line of lines) {
        const t = line.trim();
        if (t && !t.startsWith("#")) allTitles.push(t);
      }
    } catch (e) {
      die(`Cannot read file: ${e}`);
    }
  }

  if (!allTitles.length) {
    die("No titles provided. Pass titles as arguments or use --file.");
  }

  let formatId: string | undefined;
  try {
    formatId = resolveFormat(opts.format);
  } catch (e) {
    die(String(e));
  }

  const count = await currentHoldCount(cfg);
  const limit = holdLimit(cfg);
  let remaining = limit;
  if (count !== null) {
    remaining = limit - count;
    if (remaining <= 0) {
      die(`Hold limit reached (${count}/${limit}). Pick up or cancel a hold before requesting more.`);
    }
    if (remaining < allTitles.length) {
      console.log(
        `Note: You have ${count}/${limit} holds. ` +
        `Will place up to ${remaining} more (stopping at the limit).\n`,
      );
    }
  }

  console.log(`\nBatch requesting ${allTitles.length} title(s)...\n`);

  const succeeded: Array<[string, string]> = [];
  const failed: Array<[string, string]> = [];
  const skipped: string[] = [];
  let placedThisRun = 0;

  for (let i = 0; i < allTitles.length; i++) {
    const title = allTitles[i]!;
    if (placedThisRun >= remaining) {
      console.log(`  Hold limit reached (${limit}/${limit}) — stopping early.`);
      skipped.push(...allTitles.slice(i));
      break;
    }

    console.log(`  Searching: ${title}`);
    let results: Awaited<ReturnType<typeof search>>;
    try {
      results = await search(cfg, title, formatId);
    } catch {
      console.log("    Search error — skipping.\n");
      skipped.push(title);
      continue;
    }

    if (!results.length) {
      console.log("    No results found — skipping.\n");
      skipped.push(title);
      continue;
    }

    const top = results[0]!;
    const foundTitle = top.title ?? title;
    const author = authorStr(top.primaryAgent);
    const authorStr2 = author ? ` by ${author}` : "";
    console.log(`    Top result: ${foundTitle}${authorStr2}`);

    const ok = await placeHold(cfg, top.id, undefined, foundTitle);
    if (ok) {
      succeeded.push([title, foundTitle]);
      placedThisRun++;
    } else {
      failed.push([title, foundTitle]);
    }
    console.log();
  }

  const finalCount = (count ?? 0) + placedThisRun;
  const total = allTitles.length;
  console.log("=".repeat(50));
  console.log(`Done. ${succeeded.length}/${total} holds placed (${finalCount}/${limit} total).\n`);
  if (succeeded.length) {
    console.log(`  Placed (${succeeded.length}):`);
    for (const [, found] of succeeded) console.log(`    + ${found}`);
  }
  if (failed.length) {
    console.log(`\n  Failed (${failed.length}):`);
    for (const [query, found] of failed) console.log(`    x ${found}  (searched: "${query}")`);
  }
  if (skipped.length) {
    console.log(`\n  No results / not placed (${skipped.length}):`);
    for (const q of skipped) console.log(`    ? "${q}"`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Phase 2 commands — picture book list
// ---------------------------------------------------------------------------

async function cmdBooks(opts: { filter?: string; list?: string }): Promise<void> {
  const books = getMergedBooks();

  let filtered = books;

  // --filter: all | unread | read | skipped
  switch ((opts.filter ?? "all").toLowerCase()) {
    case "unread":  filtered = filtered.filter((b) => !b.read && !b.skip); break;
    case "read":    filtered = filtered.filter((b) => b.read);             break;
    case "skipped": filtered = filtered.filter((b) => b.skip);            break;
  }

  // --list: medal | honor | all
  const listFilter = (opts.list ?? "all").toLowerCase();
  if (listFilter === "medal") {
    filtered = filtered.filter((b) => b.lists.includes("caldecott_medal"));
  } else if (listFilter === "honor") {
    filtered = filtered.filter((b) => b.lists.includes("caldecott_honor"));
  }

  if (!filtered.length) {
    console.log("No books match the current filter.");
    return;
  }

  console.log(`\nPicture books (${filtered.length}):\n`);
  for (const book of filtered) {
    const award =
      book.lists.includes("caldecott_medal")  ? " [Medal]" :
      book.lists.includes("caldecott_honor")  ? " [Honor]" : "";
    const status =
      book.skip        ? " (skipped)" :
      book.read        ? ` (read${book.rating != null ? ` ★${book.rating}` : ""})` :
      "";
    const series = book.series
      ? `  Series: ${book.series}${book.seriesOrder != null ? ` #${book.seriesOrder}` : ""}\n`
      : "";
    console.log(`  ${book.year}${award}  ${book.title} — ${book.author}${status}`);
    if (series) process.stdout.write(series);
  }
  console.log();
}

async function cmdRead(searchTerm: string, opts: { rating?: string }): Promise<void> {
  const bundled = loadBundledBooks();
  const book = findBook(searchTerm, bundled);
  if (!book) {
    die(`No book found matching "${searchTerm}". Use \`library-hold books\` to browse the list.`);
  }
  let rating: number | undefined;
  if (opts.rating != null) {
    rating = parseInt(opts.rating, 10);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      die("Rating must be a number from 1 to 5.");
    }
  }
  markRead(book.title, rating);
  const ratingStr = rating != null ? ` with rating ★${rating}` : "";
  console.log(`Marked "${book.title}" as read${ratingStr}.`);
}

async function cmdSkip(searchTerm: string): Promise<void> {
  const bundled = loadBundledBooks();
  const book = findBook(searchTerm, bundled);
  if (!book) {
    die(`No book found matching "${searchTerm}". Use \`library-hold books\` to browse the list.`);
  }
  markSkip(book.title);
  console.log(`"${book.title}" added to skip list. Topup will never auto-request it.`);
}

async function cmdWatchAuthor(name: string): Promise<void> {
  const cfg = loadConfig();
  const watched = cfg.watchedAuthors ?? [];
  const lower = name.toLowerCase();
  if (watched.some((a) => a.toLowerCase() === lower)) {
    console.log(`"${name}" is already on the watch list.`);
    return;
  }
  saveConfig({ ...cfg, watchedAuthors: [...watched, name] });
  console.log(`Added "${name}" to watched authors. Topup will prioritize their books.`);
}

async function cmdUnwatchAuthor(name: string): Promise<void> {
  const cfg = loadConfig();
  const watched = cfg.watchedAuthors ?? [];
  const lower = name.toLowerCase();
  const next = watched.filter((a) => a.toLowerCase() !== lower);
  if (next.length === watched.length) {
    console.log(`"${name}" is not on the watch list.`);
    return;
  }
  saveConfig({ ...cfg, watchedAuthors: next });
  console.log(`Removed "${name}" from watched authors.`);
}

async function cmdWatchedAuthors(): Promise<void> {
  const cfg = loadConfig();
  const watched = cfg.watchedAuthors ?? [];
  if (!watched.length) {
    console.log("No authors on your watch list. Use `library-hold watch-author <name>` to add one.");
    return;
  }
  console.log("\nWatched authors (topup prioritizes their books):\n");
  for (const a of watched) console.log(`  - ${a}`);
  console.log();
}

async function cmdExport(): Promise<void> {
  const books = getMergedBooks();
  const csvRow = (b: ReturnType<typeof getMergedBooks>[number]): string => {
    const cols = [
      b.title,
      b.author,
      String(b.year),
      b.lists.join("|"),
      b.series ?? "",
      b.seriesOrder != null ? String(b.seriesOrder) : "",
      b.read ? "true" : "false",
      b.rating != null ? String(b.rating) : "",
      b.readDates.join("|"),
      b.skip ? "true" : "false",
      b.heldDates.join("|"),
    ];
    return cols.map((c) => (c.includes(",") || c.includes('"') || c.includes("\n") ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
  };

  const header = "title,author,year,awards,series,seriesOrder,read,rating,readDates,skip,heldDates";
  console.log(header);
  for (const b of books) {
    if (b.read || b.heldDates.length > 0 || b.skip || b.rating != null) {
      console.log(csvRow(b));
    }
  }
}

async function cmdFetchCovers(opts: { force?: boolean }): Promise<void> {
  const books = loadBundledBooks();
  const cache = loadCoverCache();
  const toFetch = books.filter((b) => opts.force || !(cacheKey(b.title) in cache));

  if (!toFetch.length) {
    console.log(`Cover cache is up to date (${books.length} books, 0 missing).`);
    return;
  }

  console.log(`\nFetching covers for ${toFetch.length} book(s)...\n`);
  let hits = 0;
  let misses = 0;

  for (let i = 0; i < toFetch.length; i++) {
    const book = toFetch[i]!;
    const key = cacheKey(book.title);
    process.stdout.write(`  [${i + 1}/${toFetch.length}] ${book.title}… `);
    const url = await getCoverUrl(book.title, book.author);
    cache[key] = url ?? "";
    if (url) {
      process.stdout.write("ok\n");
      hits++;
    } else {
      process.stdout.write("not found\n");
      misses++;
    }
    // Save every 20 books in case of interruption
    if ((i + 1) % 20 === 0) saveCoverCache(cache);
    // Rate-limit: ~6 req/s — well under Google Books free tier
    await new Promise((r) => setTimeout(r, 160));
  }

  saveCoverCache(cache);
  console.log(`\nDone. ${hits} covers fetched, ${misses} not found.\n`);
}

async function cmdTopup(opts: { target?: string; pickup?: string }): Promise<void> {
  const target = parseInt(opts.target ?? "10", 10);
  if (isNaN(target) || target < 1) die("--target must be a positive integer.");

  const cfg = await ensureAuth(loadConfig()).catch((e) => die(String(e)));
  const bundled = loadBundledBooks();

  const result = await runTopup(
    cfg,
    target,
    opts.pickup,
    bundled,
    (msg) => process.stdout.write(`  ${msg}\n`),
  ).catch((e: unknown) => {
    die(`Topup failed: ${e instanceof HttpError ? `(${e.status}) ${e.message}` : String(e)}`);
  });

  const { pictureBookHolds, placed, notFound, totalHolds, limit } = result;
  const headroom = limit - totalHolds;

  console.log(`\nPicture book holds: ${pictureBookHolds} / target ${target}`);
  console.log(`Total holds: ${totalHolds}/${limit}, headroom: ${headroom}`);

  if (placed.length === 0 && notFound.length === 0) {
    if (pictureBookHolds >= target) {
      console.log("Already at or above target. Nothing to do.");
    } else {
      console.log("Hold limit reached — can't place more holds right now.");
    }
    return;
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Topup complete. Placed ${placed.length} hold(s).\n`);
  if (placed.length) {
    console.log("  Placed:");
    for (const t of placed) console.log(`    + ${t}`);
  }
  if (notFound.length) {
    console.log(`\n  Not found in catalog (${notFound.length}):`);
    for (const t of notFound) console.log(`    ? ${t}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// CLI setup
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("library-hold")
  .description("Place holds at III Vega/LYNX public libraries")
  .version("1.0.0");

program
  .command("login")
  .description("Authenticate with your library card")
  .option("--card <number>", "Library card / barcode number")
  .option("--pin <pin>", "Library PIN")
  .action((opts: { card?: string; pin?: string }) => cmdLogin(opts));

program
  .command("configure")
  .description("Set library domain, home code, hold limit, and default pickup location")
  .action(() => cmdConfigure());

program
  .command("search <query>")
  .description("Search the catalog")
  .option("--format <fmt>", "Filter by format: book, game, dvd, bluray")
  .action((query: string, opts: { format?: string }) => cmdSearch(query, opts));

program
  .command("request <formatGroupId>")
  .description("Place a hold by formatGroupId (UUID from search results)")
  .option("--pickup <id>", "Pickup location id")
  .action((id: string, opts: { pickup?: string }) => cmdRequest(id, opts));

program
  .command("holds")
  .description("List your current holds and queue positions")
  .action(() => cmdHolds());

program
  .command("checkouts")
  .description("List what you have checked out with due dates")
  .action(() => cmdCheckouts());

program
  .command("locations")
  .description("List all pickup locations and their ids")
  .action(() => cmdLocations());

program
  .command("go <query>")
  .description("Search then interactively request a hold")
  .option("--format <fmt>", "Filter by format: book, game, dvd, bluray")
  .action((query: string, opts: { format?: string }) => cmdGo(query, opts));

program
  .command("batch [titles...]")
  .description(
    "Request holds for multiple titles, auto-picking the top result each. " +
    "Titles can be passed as arguments, read from a file (one per line), or both.",
  )
  .option("-f, --file <path>", "Text file with one title per line (# lines are ignored)")
  .option("--format <fmt>", "Filter all searches by format: book, game, dvd, bluray")
  .action((titles: string[], opts: { file?: string; format?: string }) =>
    cmdBatch(titles, opts),
  );

program
  .command("books")
  .description("List picture books with read/unread/skip status and ratings")
  .option("--filter <state>", "Filter: all, unread, read, skipped (default: all)")
  .option("--list <award>", "Filter by award: all, medal, honor (default: all)")
  .action((opts: { filter?: string; list?: string }) => cmdBooks(opts));

program
  .command("read <search-term>")
  .description("Mark a picture book as read (records date)")
  .option("--rating <1-5>", "Star rating 1–5")
  .action((term: string, opts: { rating?: string }) => cmdRead(term, opts));

program
  .command("skip <search-term>")
  .description("Add a picture book to the skip list (topup will never auto-request it)")
  .action((term: string) => cmdSkip(term));

program
  .command("topup")
  .description("Bring picture book holds up to target count (default: 10)")
  .option("--target <n>", "Target number of picture book holds", "10")
  .option("--pickup <id>", "Pickup location id (overrides default)")
  .action((opts: { target?: string; pickup?: string }) => cmdTopup(opts));

program
  .command("watch-author <name>")
  .description("Add an author to your watch list (topup prioritizes their books)")
  .action((name: string) => cmdWatchAuthor(name));

program
  .command("unwatch-author <name>")
  .description("Remove an author from your watch list")
  .action((name: string) => cmdUnwatchAuthor(name));

program
  .command("watched-authors")
  .description("List authors on your watch list")
  .action(() => cmdWatchedAuthors());

program
  .command("export")
  .description("Export reading history as CSV (books with any personal tracking data)")
  .action(() => cmdExport());

program
  .command("fetch-covers")
  .description("Pre-fetch cover images for all picture books and cache them locally")
  .option("--force", "Re-fetch even for books already in the cache")
  .action((opts: { force?: boolean }) => cmdFetchCovers(opts));

program.parseAsync(process.argv).catch((e) => {
  console.error(String(e));
  process.exit(1);
});
