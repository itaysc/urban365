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

A draft is checked against the record before anybody sees it: every number in the text
must be one the model was given, and a street name that is *nearly* right — `חת העם`
for `אחד העם`, `סוקלוב` for `סוקולוב` — is caught by edit distance, because both read
as fluent Hebrew and both send somebody to the wrong road. A draft that fails is thrown
away and asked for again once; if the second also fails, nothing is shown. A plausible
wrong price in a message to somebody's client is worse than no draft.

The agent's name is never sent to the model and is appended from the record afterwards.
Given it, the model signed with a different invented name every time — and that was
masking a real bug, since the name was being read through the tenant client where
`User` is invisible, so it was empty anyway.

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

Accepting is the start of the work, not the end of it. An accepted request carries a
`stage` — agreed → viewing → negotiating → signed → completed, or fell through — that
**either side may move**, because it is the deal's stage and not one agency's view of
it. Both sides also share a message thread, opened in a dialog of its own rather than
inside the request card — a card is sized for a summary, and a conversation squeezed
into one is a column of clipped lines with nowhere to type. The thread is kept beside
the deal, so "what did we agree
about the commission" has an answer six weeks later that neither agency can edit:
messages have no update or delete policy at all. Read marks are per side (`seekerReadAt`
/ `holderReadAt`), which is all an unread badge needs. The other agency is emailed on an
accept, a decline and each message, and the email links back rather than quoting the
thread — a reply by email lands where neither agency can find it.

Nothing is deleted or hidden. Declined, withdrawn, completed and fallen-through requests
move to a History section with their threads intact, because "what happened with that
agency in March" is a question agents ask.

`Agency.coBrokerage` is on by default (the inventory it exposes is already public) with
a toggle on the agency page. Opting out removes an agency from the matching pool and
refuses requests aimed at it. The commission split is recorded as what was said, not as
an agreement, and the UI says so.

Testing it needs two agencies: `npm run seed:dev-agency -- --slug two` makes a second,
and the demo seed then creates four requests in both directions — two sent and two
received, one of them already accepted — because the two sides look nothing alike and
an agency that only ever sees one has seen half the feature.

## The overview page

`GET /my/overview` answers the first screen of the day in one request: what is waiting
(open suggestions, unanswered leads, viewings with no summary, viewings this week,
co-brokerage requests), the pipeline's open count, value and expected commission, and
two series — leads by week over twelve weeks and deals closed by month over six.

The series are bucketed in JavaScript from the rows rather than grouped in SQL. An
agency's leads and deals are hundreds, and the alternative is raw SQL that has to be
trusted to carry the tenant context. Empty buckets are filled in deliberately: a chart
drawn only from the weeks that had leads hides the dry month somebody opened it to see.

The charts are divs, not a library — a dozen bars with no axes, no zoom and no legend.

## Saved searches and buyer alerts

A buyer saves the search they just ran — the public search's own filters, so the email
can link back to exactly it — and `AlertsService` emails them when a new listing fits.
It uses the same `matchBrief` the agency side uses on a customer's brief, deliberately:
two implementations of "4 rooms in Holon up to 2.4m" would disagree within a month.

Three separate pieces of state, each doing one job. `alert` is whether to write at all,
so a search can be kept and silent. `lastAlertAt` caps it at one email a day. And
`notifiedUpTo` is what "new" is measured against — a watermark advanced to the newest
listing *scanned*, not the newest that matched, so the window stays bounded and nothing
is skipped. It starts at the moment the search is saved, so a new alert does not open
with the back catalogue. A failed send puts all of it back.

The form is anchored under the button on a wide screen, where the results it is about
stay visible, and a dialog below `sm`, where there is nowhere to anchor it. One
`SaveSearchForm` either way — two copies of four fields is how one of them ends up
with a fix the other never gets.

The button says so when the search on screen is already saved, and links to the alert
instead of offering to make a second copy of it — two identical searches mean one
listing produces two emails. The comparison is canonical on both sides: the filter bar
says `undefined` where the database says `null`, and city order is not part of a
search.

Alerts only go out between 08:00 and 21:00 Israel time. Not everything a filter bar
offers survives into an alert — free text, neighbourhoods, amenities and districts have
no column the matcher compares — and the save panel names what it is dropping rather
than discarding it quietly.

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

## Tab titles

`PageTitle` sits on a pathless root route and maps the path to a name — one table in
`lib/pageTitle.ts` rather than a `useDocumentTitle` call in each of two dozen pages,
because the page that gets forgotten is invisible: a stale tab title looks exactly like
a page nobody got round to.

The search page is the exception and sets its own, because its title *is* the search —
`נדל״ן למכירה בחולון` comes from the query string, which a path cannot know. The table
returns null for `/` so the two never fight over it.

Multi-value filters in a search URL are comma-separated (`?city=חולון,בת ים`); the
parser reads the first value of a repeated key and ignores the rest.

## The tab icon

`client/public/favicon.svg` is the source: a blue tile with `U365` in white, drawn as
SVG so it is sharp at whatever size a browser asks for and there is one file to change
rather than a set of sizes to regenerate. `textLength` is set explicitly, because an
SVG favicon renders with system fonts and without it the width differs between a Mac,
a PC and a phone — on one of them the last character leaves the tile.

`apple-touch-icon.png` exists because Safari ignores an SVG icon when somebody adds the
site to their home screen. It is the same artwork with square corners, since iOS rounds
the icon itself and paints anything transparent black. To regenerate it after changing
the SVG:

```
sed 's/ rx="14"//' client/public/favicon.svg > /tmp/touch.svg
qlmanage -t -s 180 -o /tmp /tmp/touch.svg
cp /tmp/touch.svg.png client/public/apple-touch-icon.png
```

The tab, the mark and the header now agree: `Urban365`. The word `נדל״ן` elsewhere —
`נדל״ן למכירה`, `סוכנויות נדל״ן` — is the ordinary noun for real estate and is left
alone; only the places using it as the product's *name* were changed.

## City landing pages, robots.txt and sitemap.xml

The client is a static React bundle: ask it for anything and the HTML that comes back is
an empty `<div id="root">`. Google will usually run the JavaScript and see the page
eventually; Bing, and most of what now reads the web on somebody's behalf, will not. So
the pages worth finding are rendered a second time, as HTML, by the server that already
holds the listings — `server/src/seo/`.

| path | what it is |
| --- | --- |
| `/nadlan` | every city we hold listings in, grouped by district |
| `/nadlan/:section/:city` | one city: medians, a breakdown by rooms, by neighbourhood and by property type, and the listings themselves |
| `/nadlan/property/:slug` | one property: price, photographs, description, details, and others near it |
| `/sitemap.xml` | an index of the two below |
| `/sitemap-cities.xml` | the home page, the city index, and every city page worth reading |
| `/sitemap-listings-N.xml` | the listing pages, five thousand per file, numbered from 1 |
| `/robots.txt` | what crawlers may have, and where the sitemap is |

`:section` is `forsale`, `rent` or `commercial`. `:city` is the city name with its
spaces hyphenated and the whole thing percent-encoded — `/nadlan/forsale/בת-ים`. Nothing
is stored under that slug: the request is matched against the city names the listings
actually carry, through the same `cityKey` normalisation the search uses, so a feed that
changes how it spells a place does not 404 the page.

A property's slug is its address followed by its id —
`/nadlan/property/סוקולוב-15-חולון-cmvu0ayux0046xzh0ifihzgx6` — and only the last
segment is ever looked up. A listing whose address is corrected keeps working on the old
link and is moved to the new one with a 301, so the spelling in somebody's saved link is
never load-bearing. A bare id redirects the same way.

A listing that has left the market answers **410 Gone**, not 404, with a page that says
so and offers the others near it: 410 tells a search engine the URL is deliberately
finished and gets it dropped in one pass instead of re-crawled for weeks.

**No phone number appears on any of these pages.** The app hands one out at a time from
a rate-limited route behind a button, and a page written for crawlers is exactly where
that restraint would otherwise be undone. `npm run check:seo` fails if one ever shows up.

### The one thing to set up

**These paths have to be served from the public domain.** They are rendered by the API,
which in production is a different origin, and a city page sitting on
`api.example.com` is a second website competing with the first. Every canonical, every
sitemap entry and every link into the app is written against `APP_URL` on the assumption
that the host serving the client proxies them through:

Netlify — in `client/public/_redirects`, **above** the SPA catch-all, which otherwise
swallows them:

```
/nadlan/*        https://api.example.com/nadlan/:splat      200
/sitemap.xml     https://api.example.com/sitemap.xml        200
/sitemap-*.xml   https://api.example.com/sitemap-:splat.xml 200
/robots.txt      https://api.example.com/robots.txt         200
/*               /index.html                                200
```

Vercel — `rewrites` in `vercel.json`, same three paths. Cloudflare Pages does **not**
proxy to an external origin from `_redirects`; it needs a Pages Function, or the API
behind the same hostname.

Until that is in place the pages work and can be checked directly on the API origin, but
nothing links to them from the public domain and the canonicals point at URLs that 404.

### What the pages decide for themselves

* **A thin page is not indexed.** Below six listings a city page carries
  `noindex,follow` and stays out of the sitemap — `MIN_INDEXABLE` in
  `seo/render-city.ts`, and the sitemap reads the same constant, because a sitemap
  offering a page the page itself declines is a contradiction a crawler resolves by
  trusting neither. The page is still built and served: somebody following a link to a
  quiet town should find what we have.
* **A breakdown with nothing to compare is dropped.** A band needs three listings before
  it gets a row (`MIN_BAND_SUPPORT`), and a table needs either two rows or one row
  covering less than most of the city — otherwise "by property type" is the headline
  median printed twice. The meta description is built from the tables that survived, so
  the snippet never promises a section the page does not have.
* **Every figure is a median**, never a mean, and the page says in words that these are
  asking prices on live ads rather than closed deals.
* **Rent says `לחודש`** on every figure it prints.

### What it costs

One `groupBy` builds the city directory and is cached in memory for ten minutes
(`seo/cached.ts`); it serves slug resolution, the index page and the sitemap. A city
page is two indexed reads on top of that and is not cached in the process — the
responses carry `Cache-Control: public, max-age=300, stale-while-revalidate=3600`, so a
CDN in front of the public domain means most crawls never reach the application.

The pages carry their own `Content-Security-Policy`, because helmet's default
`img-src 'self' data:` would blank every listing photograph. Theirs allows images over
https and nothing else at all — no scripts, no frames, no forms.

### Linking a single property

`/?listing=<id>` on the search page opens that property in the app, the way
`/agency/:id?listing=` always has. Every listing page offers it as "צפייה בנכס ויצירת
קשר" — that is where the map, the gallery and the phone number are. The cards on a city
page link to the listing *page* rather than into the app, because a query parameter on
`/` is the same URL to a crawler and a city page would otherwise end in thirty-six links
to one address.

### The check

```bash
npm run check:seo
```

Fetches the pages from a running API and reads what a crawler would get: robots.txt and
the sitemaps agree, every sampled page answers 200 with one `<h1>`, a title and
description of a sensible length that no other page shares, a canonical on the public
site, parsing JSON-LD, no JavaScript and no phone number — and that 404, 410 and the
canonical 301 all behave. `--base` points it somewhere other than localhost, `--sample`
changes how many pages of each kind it opens.

It is the counterpart of the `check:seo` in foozool-initiatives, which keeps a set of
constants, a build script and a static sitemap in agreement. There is no second copy of
the truth to check here — these pages are generated from the database — so this checks
the output instead.

## Still open

Things that are known to be missing or unfinished, so nobody rediscovers them in
production.

* **Legal placeholders.** `client/src/content/legal.ts` still has three:
  `[[שם החברה]]`, `[[ח.פ. — יושלם עם רישום החברה]]` and
  `[[כתובת רשומה — תושלם עם רישום החברה]]`. The page shows a draft banner counting
  them while any remain, and both documents need a lawyer's pass before launch — which
  the banner also says.
* **No admin queue for flagged listings** (§5).
* **The SEO pages are not proxied yet**, because no host has been chosen for the
  client. Until the three rules in `client/public/_redirects` are live, the city pages
  exist only on the API origin and their canonicals point at URLs that 404.
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
* **Drafts read alike.** Accurate and natural, but five in a row open and close the
  same way. The lever is temperature, and raising it trades against the accuracy the
  fact check exists to protect — so it is left where it is. Each recipient sees one
  message, so this costs the agent's eye rather than the customer's.
* **The accessibility statement's contact is a placeholder.** `client/index.html` gives
  Open-Nagish `support@nadlan.example`, which is the address a visitor is told to write
  to about an accessibility problem — and in Israel that statement is a legal
  requirement rather than a courtesy.
* **No remote.** Everything is committed locally and has never been pushed.
