# Going to production

What has to be done outside the code for the app to work in production, in the order it
has to be done. `README.md` explains how the system works; this is the list of things a
deploy does not do for you.

Everything here is idempotent unless it says otherwise — re-running a step is safe.

Every `npm run … --prefix server` command below runs against the **built** server
(`server/dist`), because the scripts import compiled helpers from it. On Railway that is
already there; locally, `npm run build:server` first.

---

## 1. Environment

Set on the API service. `assertBootConfig` refuses to start in production on a weak
`JWT_SECRET` or on `CORS_ORIGINS=*`, so those two fail loudly; the rest fail quietly, in
the sense that the feature behind them is simply off.

| variable | required | what happens without it |
| --- | --- | --- |
| `NODE_ENV=production` | **yes** | cookies are issued without `secure`, and the boot checks only warn instead of refusing |
| `DATABASE_URL` | **yes** | the server does not start |
| `APP_DATABASE_URL` | **yes** | every tenant query runs as the owner role, which **bypasses row-level security** — see §3 |
| `JWT_SECRET` | **yes** | refuses to boot. 32+ random characters |
| `CORS_ORIGINS` | **yes** | refuses to boot on `*`. The client origin(s), comma-separated |
| `APP_URL` | **yes** | email links point at the wrong place |
| `API_URL` | **yes** | defaults to `APP_URL`, which is wrong in production where they are different origins — email links and the Google callback both derive from it |
| `RESEND_API_KEY` | **yes** | no email is sent; verification and password reset are logged to the console instead, which in production means nobody can verify an address |
| `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`, `B2_ENDPOINT`, `B2_REGION` | **yes** | every image upload fails |
| `TURNSTILE_SECRET` | recommended | the captcha check is skipped, so signup has no bot protection |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | the "continue with Google" button is not offered at all, on any page |
| `OPENAI_API_KEY` | optional | **private sellers' listings publish without being read for spam** — see §5 |
| `OPENAI_BASE_URL` | optional | talks to OpenAI directly. Set it to point at a gateway |
| `YAD2_CDP_URL`, `YAD2_DELAY_MS` | optional | only the scraper uses these |

The client is built with `VITE_API_URL` set to the API origin. Left empty it assumes the
Vite dev proxy, which does not exist in production.

---

## 2. Migrations

```bash
npm run db:deploy --prefix server
```

Railway runs this as the pre-deploy command. Nothing else applies migrations — the app
does not migrate on boot.

---

## 3. The `nadlan_app` role

Row-level security is the thing standing between one agency and another's data, and it
only works through a role that does not own the tables. The role is created by migration
`20261028161621_rls_policies` **with the password `nadlan_app`**, which is fine for the
local compose database and is not fine anywhere else.

In production, once:

```sql
ALTER ROLE nadlan_app WITH PASSWORD '<a long random password>';
```

Then set `APP_DATABASE_URL` to the same connection string as `DATABASE_URL` with that
user and password instead of the owner's.

To check it is actually in force:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'nadlan_app';
```

`rolsuper` and `rolbypassrls` must both be `false`. While `APP_DATABASE_URL` is unset the
server logs a warning at boot and every tenant query runs as the owner, which bypasses
every policy in the database.

---

## 4. Reference data

Four lists. Two are committed to the repo and need nothing in production; two are tables
and have to be filled, or the feature they back silently offers nothing.

| what | where it lives | production step |
| --- | --- | --- |
| Cities (1,316) | `client/src/data/cities.ts` | none — in the bundle |
| Neighbourhoods (2,752) | `client/src/data/neighborhoods.ts` | none — in the bundle |
| Municipal + region boundaries | `CityBoundary` table | `npm run boundaries:sync --prefix server` |
| Streets (62,261) | `Street` table | `npm run streets:sync --prefix server` |

```bash
npm run boundaries:sync --prefix server   # OpenStreetMap, via Overpass
npm run streets:sync    --prefix server   # data.gov.il
```

Both are slow and both depend on somebody else's server. Overpass rate-limits anonymous
callers and refuses outright when it is at capacity; the boundaries script tries three
mirrors in turn for that reason. Run them when nothing is waiting on them.

**Boundaries** are what draw a city outline on the map and what make a region search
(`מרכז והשרון`) resolve to its cities. Without them a search by region returns nothing
and the map draws no outline.

**Streets** back the street autosuggest on every address field. Without them the field
still accepts anything typed — it just stops suggesting, which looks like nothing being
wrong.

Both are maintenance tasks, not deploy steps: a municipal boundary changes about never
and a street is named once. Run them when setting up, and again if the sources publish
something new.

The two committed lists are regenerated from sources in `server/scripts/` when the CBS
publishes a new file — see `generate-cities.mjs` and `extract-neighborhoods.py` /
`merge-neighborhoods.mjs`. That is a development step; the output is committed.

---

## 5. The spam check

A private seller's listing is read by a model before it goes public. With no
`OPENAI_API_KEY` the check is skipped and **everything publishes**, with a warning in the
log:

```
[ListingReviewService] No OPENAI_API_KEY: publishing without a spam check.
```

That is the deliberate failure mode — refusing a real seller costs more than letting one
spam listing through — but in production it means the feature is off, not lenient.

A flagged listing stays a `draft` with `reviewStatus = 'flagged'` and the model's reason
on the row. **Nothing shows them to an admin yet**, so until that exists, check the queue
by hand:

```sql
SELECT id, city, street, price, "reviewConfidence", "reviewReason", "createdAt"
FROM "Listing" WHERE "reviewStatus" = 'flagged' ORDER BY "reviewedAt" DESC;
```

To release one: `UPDATE "Listing" SET status = 'published', "publishedAt" = now(),
"reviewStatus" = 'clean' WHERE id = '…';`

---

## 6. Viewing reminders

Nothing to set up — the server sweeps for due reminders every five minutes on its own
timer, and says so at boot:

```
[ReminderScheduler] Viewing reminders sweep every 5 minutes.
```

It is safe on more than one instance: a reminder is claimed with a conditional update
before the mail goes out, so exactly one instance sends it and a failure releases the
claim for the next sweep.

Two things it depends on:

* **`RESEND_API_KEY`**, or no reminder reaches anybody. Without it the mail is logged
  instead, which is right in development and silent failure in production.
* **A verified sending domain at Resend.** Until one exists, Resend only accepts mail to
  the account's own address and refuses everything else — which the agent is now told
  about, but which means no customer is ever reminded.

Confirmations are sent by hand from the calendar and need the same two things.

## 7. Storage

```bash
npm run storage:init --prefix server
```

Creates the B2 bucket named in `B2_BUCKET` if it does not exist, then proves the
credentials can write, read and delete in it. Deliberately a command rather than
something the app does on first upload: auto-creating inside a request means a typo in
`B2_BUCKET` silently creates a junk bucket.

---

## 8. Google sign-in

Register **both** callbacks on the Google OAuth client, exactly:

```
<API_URL>/api/v1/auth/google/callback          # signing in
<API_URL>/api/v1/my/calendar/google/callback   # connecting a calendar
```

It must match what the server sends, character for character, including the scheme. The
server derives it from `API_URL`, so a trailing slash difference is enough to break it.

The calendar connection also needs the `calendar.events` scope added to the OAuth
consent screen. Until the app is verified by Google, only test users listed on that
screen can connect one — everybody else is refused at Google's end, before reaching us.

Without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` both buttons are hidden rather
than shown and failing.

---

## 9. The first admin

`platformRole` is not writable through any API. Out of band, after the account exists:

```bash
npm run grant:admin --prefix server -- you@example.com
```

Then log in again — the role is in the access token, so the old one does not have it.

Platform admins approve agency claims. Without one, **no agency can ever be approved** and
every signup sits at `/app/pending` forever.

---

## 10. Do not run in production

* `npm run seed:dev-agency` — creates an account with a **known password** in the source.
  The script refuses to run against anything but localhost, but the rule is worth stating.
* `npm run import:cache` — replays scraped yad2 payloads from `server/data/`. Fine as a
  recovery tool, not a setup step.

---

## Still open

Things that are known to be missing or unfinished, so nobody rediscovers them in
production.

* **Legal placeholders.** `client/src/content/legal.ts` still has three:
  `[[שם החברה]]`, `[[ח.פ. — יושלם עם רישום החברה]]` and
  `[[כתובת רשומה — תושלם עם רישום החברה]]`. The page shows a draft banner counting
  them while any remain, and both documents need a lawyer's pass before launch — which
  the banner also says.
* **No admin queue for flagged listings** (§5).
* **Reminders are email only.** Most customers are a phone number, and there is no SMS
  or WhatsApp provider wired up — the calendar says so per meeting rather than failing
  quietly, but those customers have to be rung.
* **Agency listings are not spam-checked.** Only private sellers are, deliberately — an
  agency has a licence and an approved claim.
* **A listing edited after it is published is not re-checked.** The check runs at publish.
* **`isExclusive` is inferred** from the `בלעדיות` amenity label rather than read from its
  own column, inconsistent with `isNewFromDeveloper`.
* **No remote.** Everything is committed locally and has never been pushed.
