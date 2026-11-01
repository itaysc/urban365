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

## Matching and the radar

An hourly sweep (`MatchScheduler`, 30 seconds after boot and then every hour) compares
each agency's customer briefs against its own published listings and raises
`Suggestion` rows. It is idempotent: `dedupeKey` is the identity of the observation, so
a dismissed suggestion is never raised again, and two instances sweeping at once is
safe. The matching is ordinary arithmetic — no model is involved, deliberately, because
a suggestion an agent cannot trust is worse than none.

Three more rules run in the same sweep (`RulesService`): a viewing in the next 72 hours
that a side who *was asked* has not confirmed, an enquiry at `new` or `contacted` with
no activity for 3 days, and a listing up for 21+ days with 25+ views and not one
enquiry. The first is keyed on the meeting alone — a viewing happens once — while the
other two carry an ISO week and an ISO month in the key, so a recurring state can be
raised again later without being raised every hour.

The radar hides suggestions about a listing that is no longer published; archiving does
not delete, so nothing cascades, and republishing brings the suggestion back.

Caps are `PER_CUSTOMER_LIMIT = 3` and `PER_AGENCY_LIMIT = 50` per sweep, plus
`PER_KIND_LIMIT = 10` for the other rules. Both are
applied *after* removing what has already been raised, so the next sweep offers the
next ones rather than re-offering the same three forever.

### Drafting the message

`DraftService` writes a WhatsApp message in Hebrew for a match, on request and never on
its own. The instruction is held whole and apart from the data — the customer's name,
the agent's name and the address go in the user message as JSON — so a customer called
"ignore your instructions" is a name being described rather than an order being given.

It is written to be read as a person wrote it: two or three sentences, no emoji, no
"הזדמנות", and gender-neutral throughout, because nothing in the CRM records a
customer's gender and guessing from a name is how an agent loses one.

Nothing is sent. The draft goes back to the agent, who edits it, copies it or opens
WhatsApp with it ready — and presses send there themselves.

### The morning briefing

`BriefingService` runs on the same hourly sweep and sends each agent one email a day,
from 07:00 Israel time, listing what is on their radar. `lastBriefingAt` is both the
record and the lock — claimed with a conditional update before the mail goes out, and
released if the send fails, so a sweep that is late or doubled still sends exactly once
and a failure retries within the hour.

Two deliberate restraints. It is never sent empty: a daily message that sometimes says
"nothing today" teaches people to stop opening it. And the hour is read from the
calendar rather than a stored offset, because Israel keeps daylight saving and
arithmetic on an offset drifts by an hour for half the year.

`User.dailyBriefing` is on by default with a checkbox on the agent's own profile. The
email says where that checkbox is.

## Co-brokerage

Two agencies working one deal. The sweep matches each agency's customer briefs against
*other* agencies' published listings (`cobroke_match`, score 80+, five per sweep and at
most one open per customer at a time), and the agent can offer the holding agency a
split.

The design rests on one asymmetry: **the listing is already public and the buyer is
not.** So the agency being asked sees the property, the asking agency's name, the
message, the proposed split and a summary of what the buyer wants — and never the
buyer's name, phone or budget. The price is left out deliberately: a match already
proves the buyer can afford the asking price, and the room above it is theirs to keep.

`CoBrokerageRequest` is the only row in the system belonging to two agencies, so its
policies name both: either party may read, only the seeking side may insert, and which
fields each may change is enforced in the service because a policy cannot tell accepting
from withdrawing. **Row-level security has no column dimension**, so the buyer is kept
from the holding side by two separate projections in `projections.ts` — and by a test
that asserts the holding side's field list, because a projection is one careless edit
from leaking.

`Agency.coBrokerage` is on by default (the inventory it exposes is already public) with
a toggle on the agency page. Opting out removes an agency from the matching pool and
refuses requests aimed at it. The commission split is recorded as what was said, not as
an agreement, and the UI says so.

Testing it needs two agencies: `npm run seed:dev-agency -- --slug two` makes a second,
and the demo seed then creates four requests in both directions — two sent and two
received, one of them already accepted — because the two sides look nothing alike and
an agency that only ever sees one has seen half the feature.

## Demo data (development only)

`DemoService` fills an agency with eight customers, eight listings, five leads and six
meetings, chosen to exercise the product rather than to look full: one precise brief,
one that names only a city, one customer with no brief at all, a listing with plenty of
views and no enquiries, a viewing nobody has confirmed, and a past viewing nobody has
written up. One seed makes all four radar rules fire.

Every record is registered in `DemoRecord`, and the clear deletes exactly those ids —
nothing is inferred from a name, a date or a flag, so an agency running this against
its own data gets its own data back untouched. The clear runs in one transaction.

Two ways in: a panel on the agency page, rendered only in a development build, and
`npm run seed:demo` (`-- --clear` to empty, `-- --agency <id>` for a particular one).
**The server refuses all three routes when `NODE_ENV=production`, and refuses anyone
but an owner anywhere** — the client's hiding is a convenience, not the protection.

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
  quietly, but those customers have to be rung. The same is true of the request that
  asks a property's owner to approve a viewing time.
* **A viewing nobody has agreed to still stands.** The calendar shows the buyer's and
  the owner's answers side by side, and an owner saying "not before five" is recorded
  and shown — but nothing cancels or moves the meeting on its own, and no reminder
  chases a side that has not answered. Moving it is the agent's to do.
* **A property's owner is linked by hand.** It is a field on the listing, chosen from
  the agency's customers, and empty on every scraped listing and on anything typed in
  before this existed — so a viewing on one of those cannot be put to anybody until
  somebody fills it in. The calendar says `לא רשום בעל נכס` rather than offering a
  button that would do nothing.
* **Agency listings are not spam-checked.** Only private sellers are, deliberately — an
  agency has a licence and an approved claim.
* **A listing edited after it is published is not re-checked.** The check runs at publish.
* **`isExclusive` is inferred** from the `בלעדיות` amenity label rather than read from its
  own column, inconsistent with `isNewFromDeveloper`.
* **Matching only sees the agency's own inventory.** A customer who fits another
  agency's listing is the co-brokerage case, and it is a product decision about what an
  agency's customer list is worth to somebody else, not a line to change quietly.
* **The OpenAI key in `.env` is rejected (401).** Drafting returns a plain "try again"
  and the radar is otherwise unaffected. The same key feeds the private-seller spam
  check, which is built to publish when the model cannot be reached — so until the key
  is replaced, listings are very likely going out unchecked without anything in the UI
  saying so.
* **The drafts' wording has never been read.** The plumbing is tested against a stubbed
  model; the prompt itself has not run against a real one, for the reason above. It
  wants a look at a dozen real drafts before anybody sends one.
* **No remote.** Everything is committed locally and has never been pushed.
