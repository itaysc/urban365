# Nadlan

Two apps in one repo:

| folder | what it is | dev port |
| --- | --- | --- |
| `client/` | React 19 + TypeScript + Vite + Tailwind | 5173 |
| `server/` | NestJS API | 5555 |

Structure, scripts, env handling and the Railway setup follow the conventions in
`foozool-initiatives`.

## Requirements

Node **22+** (`.nvmrc` in each folder — `nvm use`). The NestJS 12 / TypeScript 6
toolchain does not run on Node 20.

> Installing needs **npm 11**. npm 10.9.x crashes resolving this dependency tree
> (`Cannot read properties of null (reading 'edgesOut')`). The lockfiles are committed, so
> `npm ci` works on either version — only a fresh `npm install` needs npm 11:
> `npx npm@11 install`.

## Install

```bash
npm run install:all
docker compose up -d            # local Postgres on :5432
npm run db:migrate --prefix server
```

Copy `server/.env.example` → `server/.env` first; it already points `DATABASE_URL` at the
compose database.

## Run

```bash
npm run dev          # client and server together
npm run dev:server   # NestJS on http://localhost:5555
npm run dev:client   # Vite on http://localhost:5173
```

The Vite dev server proxies `/api` and `/health` to `127.0.0.1:5555`, so the browser makes
same-origin calls and there is no CORS preflight in development. Leave `VITE_API_URL` empty
to use the proxy; set it to the deployed server origin in production.

Copy `client/.env.example` → `client/.env` and `server/.env.example` → `server/.env` before
the first run.

### Startup order

Vite serves in about a second; Nest needs a few to compile and bind its port. If the
client came up first, a page already open would fire a request into that gap and you'd see

```
[vite] http proxy error: /api/v1/yad2/agency
Error: connect ECONNREFUSED 127.0.0.1:5555
```

in the terminal and `Request failed with status code 502` in the browser — the same event
seen from both sides. So `dev:client` runs `scripts/wait-for-server.mjs` first, which polls
`/health` until the API answers (then gives up after 90s and starts anyway rather than
blocking). On top of that the client retries connection-level failures and 502/503/504 a
few times, which also covers the brief gap when `nest start --watch` restarts the API after
a server-side edit. A 4xx is a real answer and is never retried.

## Build

```bash
npm run build         # both
npm run build:server  # -> server/dist
npm run build:client  # -> client/dist
```

## API shape

* `GET /health` — liveness, **outside** the API prefix, so Railway's healthcheck and uptime
  probes do not track the API version.
* `GET /api/v1/...` — everything else. The prefix is set in `server/src/main.ts`.

## Database

Postgres, through Prisma. The schema is `server/prisma/schema.prisma`.

Each table keeps **typed columns for what search filters and sorts on** — price, rooms,
city, m², geo, amenities — alongside a **`raw` JSON column holding the exact yad2 payload**
the row came from. Nothing is lost to the mapping, and a new yad2 field costs a migration
only when you want to *query* it, not to capture it.

| table | holds |
| --- | --- |
| `Agency` | one row per agency. `yad2Id` is set only for scraped ones; `status` tracks claiming |
| `Broker` | the team strip, unique per `(agency, yad2Id)` |
| `Listing` | one row per ad. `token` is set only for scraped ones; `status` gates publication |
| `ScrapeRun` | one row per scrape, so a bad run is distinguishable from shrinking stock |
| `User`, `AgencyMembership`, `AgencyClaim`, `AgencyInvite` | accounts, roles and claiming |
| `Session`, `AuthToken` | refresh-token families and out-of-band tokens, hashes only |
| `ListingImage`, `Lead`, `Deal` | the CRM |

**Public identifiers are `Agency.id` and `Listing.id`**, not yad2's `customerId` and
`token`. Those are nullable now, because agencies created here never had them, and a
nullable column cannot be a public key. `GET /api/v1/listings/:id` still accepts a yad2
token for one release so older links keep working.

The sort tiebreaker in `listings.service.ts` is `id` for the same reason: it used to be
`token`, and the moment a listing exists with no token, every one of them ties and
pagination starts repeating and dropping rows. `listings.pagination.spec.ts` guards it.

Re-scraping **upserts on `token`**, so listings update in place. Listings that stop
appearing are marked `delistedAt` rather than deleted, which keeps price history and past
inventory queryable. The whole save runs in one transaction.

```bash
npm run db:migrate --prefix server   # create + apply a migration
npm run db:deploy  --prefix server   # apply existing migrations (CI / Railway)
npm run db:studio  --prefix server   # browse the data
npm run import:cache --prefix server # load data/agencies/*.json into Postgres
```

Scrapes still write the untouched payload to `server/data/agencies/*.json` as a backup, so
a mapping bug can be replayed with `import:cache` without re-scraping yad2.

### Prisma 7 note

Prisma 7 no longer accepts `url` in the schema's datasource. The connection lives in
`server/prisma.config.ts` for migrate, and reaches the runtime client through the `pg`
driver adapter in `PrismaService`. Also note `prisma@latest` currently resolves to an
8.0.0 **release candidate** — both `prisma` and `@prisma/client` are pinned to 7.10.1.

## Accounts

Email + password, httpOnly cookies, no passport (one cookie strategy does not justify the
layer). Passwords are **argon2id** via `@node-rs/argon2` — bcrypt silently truncates at 72
bytes, and `@node-rs` ships prebuilt binaries, which the `node:22-slim` runtime stage needs
since it has no build toolchain.

| route | notes |
| --- | --- |
| `POST /api/v1/auth/signup` | creates a user plus a new agency, **or** a claim on an unclaimed one |
| `POST /api/v1/auth/login` | identical 401 for a wrong password and an unknown email |
| `POST /api/v1/auth/refresh` | rotates; the cookie is path-scoped to this route alone |
| `POST /api/v1/auth/logout` · `logout-all` | |
| `GET /api/v1/auth/me` | what the client calls on boot |

**Sessions are rows, not Redis.** A login opens a family; each rotation adds a row and
tombstones its predecessor, so replaying a revoked token is provable reuse and kills the
whole family. Verified: replaying an old refresh token 401s *and* invalidates the token
that replaced it.

The access token is deliberately **not** checked against the database per request — zero
queries, at the cost of "log out everywhere" taking up to 15 minutes to bite on access
(refresh kills it immediately).

Authentication is the **default**: a global guard means a new route is private unless it
says `@Public()`. Today's open surfaces are `/health` and `/api/v1/listings/*`. The yad2
scraper is `@PlatformAdmin()` — it was reachable anonymously before, which let anyone make
the server scrape a third party from our IP.

`platformRole` is not writable through any API. Grant it out of band:

```bash
npm run grant:admin --prefix server -- you@example.com   # then log in again
```

Secrets: set `JWT_SECRET` (32+ random characters) and `CORS_ORIGINS`. `assertBootConfig`
refuses to start in production on a weak secret or `CORS_ORIGINS=*`, and warns in dev.

### Verification, reset and claiming

Email goes through `MailService`, which uses **Resend** when `RESEND_API_KEY` is set and
otherwise **logs the message and its link**. That keeps the whole flow testable locally
with no account, no domain and no DNS.

Links point at the **API**, not the SPA: `GET /auth/email-verification/redirect` validates
the token, consumes it, then 302s to the app. The token never reaches browser history or a
Referer header. `API_URL` defaults to `APP_URL`, which is right in dev because Vite proxies
`/api` — set it explicitly in production, where the two are different origins.

Tokens are stored as **sha256 hashes only**, compared in constant time, and one live token
per purpose: issuing a new one retires the old. A consumed token cannot be replayed.

Resetting a password **revokes every session**, including the browser doing the reset — if
the reset was prompted by a compromise, leaving the attacker logged in defeats the point.

`forgot-password` and signup-with-an-existing-address both answer identically whatever the
truth is. The person who actually owns a reused address is told out of band, by email.

**Claiming.** `GET /api/v1/agencies/lookup?q=` is public but returns *unclaimed agencies
only*, no contact details, and nothing at all for a query under two characters — it must
not become a way to harvest the scraped set. Signing up with `claimAgencyId` attaches a
**pending** membership to the agency row that already exists; nothing is merged and no
listing is re-parented.

An agency already awaiting review still accepts **competing claims**. Otherwise the first
person to ask — possibly a squatter — locks the real agency out until an admin intervenes.
The queue shows every claim side by side, and approving one rejects the rest in the same
transaction.

| route | who |
| --- | --- |
| `GET /api/v1/admin/moderation/agencies` | platform admin |
| `POST /api/v1/admin/moderation/agencies/:id/approve` | `{ userId }` |
| `POST /api/v1/admin/moderation/agencies/:id/reject` | `{ reason? }` |

Rejecting a **scraped** agency returns it to `unclaimed` so someone else can ask later; an
agency invented at signup has nothing to return to and stays `rejected`.

Cloudflare Turnstile guards signup and forgot-password, and is skipped entirely outside
production or when no secret is set.

## Tenancy

Agency-scoped data is isolated by **Postgres row-level security**, not by filters written
by hand in each handler. The reference project does the latter and nothing catches a
forgotten `where` — one miss is a cross-tenant leak.

- `TenantInterceptor` puts the caller in `nestjs-cls` context and, for an authenticated
  request that has an agency, runs the **whole handler inside one transaction** with
  `app.current_agency_id` set on it. `SET LOCAL` lives on a single connection, so a query
  issued outside that transaction would not be scoped at all. The variables are set with
  `set_config(...)`, which parameterises — `SET LOCAL x = $1` is not valid SQL, and that
  is how this ends up as string interpolation and then as an injection.
- `TenantPrismaService` connects as `nadlan_app`, which does **not** own the tables and so
  cannot bypass policies. `PrismaService` keeps the owner role and is used only where
  queries must cross agencies: auth, admin and the yad2 scraper. Two clients rather than
  one flag means the choice is a visible, greppable import.
- `prisma-tenant.extension.ts` fills in `agencyId` on writes only. It deliberately does
  not touch reads: a query extension never fires for nested reads inside an `include`, so
  pretending it covers reads would be the dangerous kind of half-measure.
- Anonymous requests open no transaction. The public search is the hot path and must not
  pay for a `BEGIN`/`COMMIT` it cannot use.
- `TenantGuard` reads the principal off the **request**, not from CLS — Nest runs guards
  before interceptors, so the context does not exist yet at that point in the lifecycle.

Scoped routes also keep an explicit `agencyId` filter as **defence in depth**. RLS is the
boundary; the filter is a second line, and it is what protects these routes until the
policies are applied.

`APP_DATABASE_URL` selects the non-owner role. While it is unset the server logs a warning
and tenant queries run as the owner, which means RLS does not apply — fine before the
policy migration, not after.

## Search

`GET /api/v1/listings/search` — faceted search across every agency held, read from the
typed columns (the `raw` payload is never touched on this path).

| parameter | notes |
| --- | --- |
| `section` | `forsale` \| `rent` \| `commercial` |
| `agencyId` | scope to one agency (yad2 id) |
| `city`, `neighborhood`, `propertyType` | repeatable or comma-separated |
| `amenities` | comma-separated; **all** must be present, not any |
| `minPrice`, `maxPrice` | |
| `minRooms`, `maxRooms` | |
| `minSquareMeter`, `maxSquareMeter` | |
| `q` | free text over description, street, city, neighbourhood |
| `includeDelisted` | delisted listings are excluded by default |
| `sort` | `newest` (default), `oldest`, `price-asc\|desc`, `price-per-sqm-asc\|desc`, `rooms-asc\|desc`, `size-asc\|desc` |
| `page`, `pageSize` | 1-based; default 24, max 100 |
| `facets` | adds city / property-type / amenity counts for the current filters |

```bash
curl 'localhost:5555/api/v1/listings/search?section=forsale&city=רחובות&minRooms=4&sort=price-asc'
curl 'localhost:5555/api/v1/listings/search?amenities=מעלית,ממ"ד&facets=true'
```

`GET /api/v1/listings/:token` returns one listing in the same **Asset** shape the agency
view uses — `listingRowToAsset` is shared by both — so the search results and the agency
page open the identical modal.

### The search UI

`/search` is the client for it. Filters live in the query string, so a filtered search is
shareable and survives a reload:

```
/search?section=forsale&city=רחובות&minRooms=4&sort=price-asc
/search?amenities=מעלית,ממ"ד&sort=price-asc
```

The left panel is driven by the facet counts the API returns, so each option shows how many
results it would give under the *current* filters — pick רחובות and the property-type list
narrows to what exists there. A selected option stays visible even when its count falls to
zero, so it can always be unticked. Free text is debounced, and results stay on screen
dimmed while the next page loads rather than collapsing the grid.

**On sorting:** every sort ends with `token`, which is unique, and puts nulls last. Without
a unique tiebreaker two listings at the same price have no defined order and Postgres may
return them differently per query — which makes rows repeat or disappear as you page.
Paging the whole set ten at a time returns all 182 rows exactly once.

## The yad2 agency extractor

The home page takes an agency number (`6816047`) or any yad2 agency URL, and renders what
yad2 shows: the agency header with its listing counts, the team strip, and the listings as
cards with pagination. Clicking a card opens the full listing in a modal — image gallery,
specs, amenities, description and the contact broker — rather than sending you to yad2.
The results also download as CSV (listings, team, agency).

Everything is read from the `__NEXT_DATA__` JSON that yad2's Next.js app embeds in every
page, so there are no CSS selectors to break when yad2 restyles.

### Section names

yad2's three tabs are `forsale`, **`rent`** and `commercial` — the rental one is *not*
`forrent`, which 404s. The `section` value matches the URL segment.

### Endpoints

| method | path | what it does |
| --- | --- | --- |
| `POST` | `/api/v1/yad2/agency` | `{ input, section?, refresh? }` — returns a cached result, or starts a job |
| `GET` | `/api/v1/yad2/jobs/:id` | job status, progress and result |
| `GET` | `/api/v1/yad2/agencies` | everything already cached |
| `GET` | `/api/v1/yad2/agency/:id?section=` | one cached agency |
| `GET` | `/api/v1/yad2/agency/:id/csv/:kind?section=` | CSV download; `kind` is `assets`, `team` or `agency` |

A full scrape walks ~27 feed pages and opens every listing, which takes a couple of
minutes — too long for one request, so it runs as a job and the client polls it. The job
reports real counts, not a spinner: the agency's first page states how many listings there
are, so within a second the bar knows its total and the UI counts
"מעתיק פריט X מתוך Y". `done`/`total` combine both phases (one unit per feed page, one per
listing) so the bar only moves forward. Results are cached to
`server/data/agencies/<id>-<section>.json` and served from there until a caller passes
`refresh: true`.

The whole view lives in the URL — `/agency/:agencyId?section=&page=&listing=` — so a page
of results, or a single listing's modal, can be linked to and survives a reload. Opening a
listing pushes a history entry, so Back closes the modal; closing it with ✕ or Escape steps
back rather than stacking another entry.

CSVs are UTF-8 with a BOM so Hebrew opens correctly in Excel. Column names are the
snake_case form of the API's own field names, so the files and the JSON stay in step.
Listing images are left out of the CSV — only `images_count`, and `amenities` lists just
what the property has.

### Listing details

The modal mirrors yad2's own item page, including the two blocks it shows there:

* **פרטים נוספים** — deal type, condition, built m², floors in the building, parking,
  price per m² and entrance date (yad2 prints "כניסה גמישה" in place of the date when the
  seller marked it flexible), plus the fields we hold that yad2 leaves out.
* **מה יש בנכס** — the same ten rows on every listing, greyed and struck through when the
  property lacks one, because the absence is information too. Flags yad2 holds but does not
  put in that grid (furniture, shelters, kosher kitchen, exclusivity) are appended when true.

`price_per_square_meter` is `floor(price / square_meter)` — the **net** area, not the built
one. That is what yad2 itself prints: for listing `jn1o9d3j` (₪2,580,000 over 97 m² net and
109 m² built) both it and this app show 26,597 ₪.

### yad2's bot protection

yad2 sits behind **Radware Bot Manager**. A freshly launched automation browser is served a
challenge page that never clears, so a live scrape needs a Chrome that has already passed
the check:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-yad2"
```

`npm run chrome:debug` does this for you — it starts Chrome on port 9222 with its own
profile (Chrome refuses a debugging port on a profile that is already running) and opens
yad2. Then set `YAD2_CDP_URL=http://127.0.0.1:9222` in `server/.env` and restart the server.

Without it the job fails fast with `errorCode: "BOT_CHECK"`, and the UI shows those steps
instead of a raw error. Agencies already in the cache need none of this.

**This cannot run headless.** Radware detects headless Chrome itself, not the session: the
same profile that loads the agency page fine when headed is served
`Radware Bot Manager Captcha` and redirected to `validate.perfdrive.com` under
`--headless=new`. So a live scrape needs a real, visible Chrome window.

To keep it out of the way, minimise that window or put it on another desktop and leave it
running — a scrape **reuses a tab that is already open** rather than creating one, which is
what used to pull the window to the front each time. Only a blank tab or one already on
yad2 is reused; a tab showing anything else is left alone and a new one is opened, so a
page you are reading never gets hijacked. When it finishes it parks the tab it borrowed on
`about:blank` rather than closing it, since that tab is yours.

If that Chrome ends up with **no tabs at all**, Playwright cannot attach — it calls
`Browser.setDownloadBehavior`, which needs a browser context, and Chrome has none while
every tab is closed:

```
browserType.connectOverCDP: Protocol error (Browser.setDownloadBehavior):
Browser context management is not supported.
```

The scraper now checks `/json` before connecting and opens a blank tab if there is none,
and it never closes the last remaining tab, so that state neither happens nor sticks.

## Deploying the server to Railway

Only the server deploys to Railway; the client is a static `client/dist` build hosted
elsewhere.

In the Railway dashboard, for the API service:

* **Root Directory:** `server`
* **Config file:** `server/railway.toml`
* **Pre-deploy Command:** `npx prisma migrate deploy`

Add a Postgres service to the same project (**New → Database → PostgreSQL**) and turn on
point-in-time recovery from its Backups tab. Reference it from the API service rather than
pasting a URL, so the connection uses Railway's private network.

`server/railway.toml` builds from `server/Dockerfile` (multi-stage: build with
devDependencies, ship only runtime deps) and health-checks `/health`.

Variables to set on the service:

| variable | value |
| --- | --- |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | the client origin(s), comma-separated |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — reference the Postgres service |
| `PORT` | leave unset — Railway injects it |

## Layout

```
client/
  src/
    components/   shared UI
    pages/        route-level components
    router/       react-router route table
    services/     API clients (axios instance in services/api.ts)
    hooks/
    lib/
    types/
    config.ts     the only place import.meta.env is read
server/
  src/
    config/       configuration.ts — the only place process.env is read
    health/       GET /health
    app.module.ts
    main.ts       helmet, CORS, validation pipe, /api/v1 prefix
  Dockerfile
  railway.toml
```
