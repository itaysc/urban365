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

**The dev server proxies the same set** — `server.proxy` in `client/vite.config.ts`.
Change one and change the other: these paths are the only part of the site whose
routing lives outside the client, so a link that works in dev and 404s in production is
exactly the mistake they invite. `npm run check:seo -- --base http://localhost:5173`
runs the audit through the client's origin rather than straight at the API, which is
the arrangement production will have.

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
* **Median and mean, side by side.** Either alone misleads: in הרצליה the median asking
  price is ₪5,995,000 and the mean ₪5,135,000, and in תל אביב the mean runs ₪740,000
  *above* the median because one flat in nine is worth four of the others. Shown
  together the gap is itself the fact. A line under the figures says which is which,
  because the two are routinely taken for each other.
* The page says in words that these are asking prices on live ads, not closed deals.
* **Rent says `לחודש`** on every figure it prints.

### Saved properties and saved searches

Two pages, `/saved` and `/alerts`, with a tab strip on each (`SavedTabs`). They used to
be reachable only from two unrelated items in the header — a heart marked שמורים and a
bell marked **התראות** — so somebody who had saved a search went looking under "saved",
found only properties, and concluded the searches had not been kept. The bell now says
**חיפושים**, which is what is behind it.

### The pictures on the city index

Each city's card carries a photograph **of that city** — a view over the town, its
park, its old quarter — from Hebrew Wikipedia. Stock libraries were the obvious source
and are useless here: Unsplash and Pexels have Tel Aviv and Jerusalem and nothing
whatever of Dimona, Beit She'an or Harish, and searching those names returns pictures
that merely match the word, including studio portraits of strangers.

```bash
node scripts/fetch-city-photos.mjs cities.txt    # one city per line
```

writes `src/seo/city-photos.ts`. Today 32 of 33 cities have one; חריש, built in the
last decade, has no photograph in its article and gets a tile instead
(`seo/tile.ts`, a colour derived from the name so it is the same on every build).

Four things the script has to get right, each of which it got wrong first:

* **The lead image is the coat of arms**, for almost every Israeli city. The
  photographs are further down the article, via `prop=images`.
* **The file namespace is localised** — `קובץ:`, not `File:`. Stripping the English
  prefix left every name unusable and every city blank, from code that looked right
  and an API that answered 200.
* **`prop=images` returns template images too**, so a panorama of the Tel Aviv
  promenade won on both Ashdod and Ashkelon. A photograph counts as the city's only if
  the city's name is in its own name or in one of its Commons categories.
* **Redirects are not followed unless asked.** `תל אביב יפו` redirects to
  `תל אביב-יפו`, and without `redirects=1` the country's largest city came back bare.

A fifth thing it gets wrong by nature: a file name rarely says that a place is a place
of remembrance. `Oklahoma garden 1.jpg` won יהוד מונוסון on the word "garden" and is a
memorial stone, and יבנאל's article offered its cemetery. Words like `memorial`,
`קבר` and `עלמין` now outweigh anything that could lift them — but the check that
matters is a person looking at the grid, and a photograph can be replaced by editing
its entry in `city-photos.ts` (the next run of the script will overwrite it, so change
the scoring too if it should not come back).

**Attribution is a licence condition, not a courtesy.** Every photograph is Creative
Commons or public domain; GFDL files are skipped because that licence wants its full
text reproduced, which a card cannot do. The photographers are named in one list under
the grid — the licences ask for credit reasonable to the medium, and thirty names over
thirty pictures would bury the page. The URLs point at Wikimedia's own thumbnails; if
the traffic ever justifies it, copy them into the bucket instead.

### The links across the bottom

Every landing page ends with a column of links per section — the twelve busiest cities
for sale, for rent and for commercial — plus the searches and the legal pages
(`seo/footer.ts`). Thirty-six links on every page.

This is the part a search engine walks. A page is worth indexing roughly in proportion
to what links to it, and before this a city page was reachable only from the index and
from the few cities in its own district, which left the quiet ones three clicks from
anywhere. Now the busiest are one click from every page on the site, which is the
arrangement every property portal in the country uses and for the same reason.

A section with fewer than three cities is left out rather than shown as a stub, and
the list is built from the cached directory, so it costs no query per page.

**The React app carries the same footer** (`components/SiteFooter.tsx`) on the search
page, saved, alerts, the legal pages and a seller's own listings — fed by
`GET /api/v1/cities`, which serves that same directory. One source, so the two footers
cannot drift apart. It is not on `/app/*`: a CRM is a tool, and a map of the storefront
in it is noise.

The search page keeps its full-height desktop layout — `lg:h-screen` moved off the page
onto the section inside it, so the search still fills the window and its results column
still scrolls internally, while the page itself can scroll far enough to reach the
footer.

### The bar across the top

The same one the app has — height, border, sticky blur, wordmark, the three links —
rebuilt in CSS in `seo/layout.ts`, so somebody arriving from a search engine cannot
tell that this page was rendered by something else.

It cannot be rendered signed-in, because these pages are cached and served to every
visitor at once — a name in the HTML would be one person's name shown to the next. So
the document is always the signed-out bar and **the browser personalises three elements
of it after loading**: one inline script asks `/api/v1/auth/me` and, if there is a
session, swaps the sign-in link for the person's name and reveals the searches link.

That is the only JavaScript on these pages, and the policy names it by its SHA-256
rather than allowing inline script at large — the page is assembled from a scraped
feed, and `unsafe-inline` would be trusting every street name in the country.
`npm run check:seo` fails if a second script appears, if one gains a `src`, or if the
policy ever loosens to `unsafe-inline`.

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

## The brokerage agreement

Under the Real Estate Agents Law a fee can only be claimed where the client signed a
written order, so for an agency this is not an administrative detail — it is the line
between billable work and unpaid work. Four nullable columns on `Customer`:

| column | what it holds |
| --- | --- |
| `agreementSignedAt` | the day they signed. **Null means unsigned**, which is the state that matters |
| `agreementCommissionPercent` | per cent of the price, before VAT |
| `agreementCommissionAmount` | or a fixed fee in shekels, before VAT |
| `agreementNote` | where the copy is filed, which property it covers, its validity |

The two fee columns are never derived from each other: 2% of what, before there is an
offer? The dialog writes one and clears the other, so they cannot disagree. Zero is a
real value — a fee waived on purpose — and is never treated as absent.

On the customers page the agreement is a chip beside the customer's name, green when
signed and amber when not, and pressing it opens the dialog. The filter beside the
search answers the question the page could not before: who is the agency working for
with nothing in writing.

Unticking "signed" clears the date but keeps the agreed fee — the signature is the
legal fact, the fee is a term that was discussed either way.

### A note on the migrations

`20261101210000_align_history_with_schema` exists because several earlier migrations
were hand-written and four schema changes never got one: two dropped indexes, the index
on `Street(cityKey, name)`, and the array defaults a Prisma upgrade stopped emitting.
The local database had them because it had been pushed to directly, so nothing showed
until a new migration tried to sweep them up under its own name. A fresh deploy would
have gone out without the `Street` index.

The whole history now replays into an empty database and produces exactly what
`schema.prisma` describes. Worth re-checking after any hand-written migration:

```bash
createdb nadlan_replay && DATABASE_URL=...nadlan_replay npm run db:deploy --prefix server
```

## A private seller's own properties

### Getting there

One entry, in the site header, and it follows what the person has:

| who | label | goes to |
| --- | --- | --- |
| signed out | `פרסום נכס` | the sign-in dialog, then `/sell/new` |
| signed in, nothing published | `פרסום נכס` | `/sell/new`, the form |
| signed in, has published | `הנכסים שלי` | `/sell`, the list |
| in an agency | — | nothing; agencies publish from their own dashboard |

It said `פרסום נכס` and went to the list whichever way round, so a seller looking for
their own flat had no reason to press it. Knowing which state somebody is in costs one
request, cached for five minutes rather than the usual thirty seconds — the answer
changes the day they publish their first property, and that happens once.

Below 640px the whole thing used to be hidden, which left a private seller on a phone
with **no way to reach their own listings at all**. Now the words fold away and the icon
stays, like `שמורים` beside it.

### The page

`/sell` is the page: what they published, how each one is doing, and what they can do
about it. Three actions, and two of them are deliberately not alike.

* **עריכה** opens the publish form again at `/sell/:id`.
* **הסרה מהפרסום** archives — `POST /me/listings/:id/archive`. The listing keeps its
  engagement figures and its enquiries still refer to it, and relisting is one press.
* **מחיקה** deletes — `DELETE /me/listings/:id`. The row goes, and the cascades take the
  images, the engagement counts and the saves with it; the photographs are then removed
  from the bucket.

The archive route was `DELETE :id` until there was a real delete to put there. They are
a verb apart on the same path no longer, because one is reversible from the same screen
and the other is not reversible at all.

**Enquiries survive a deletion.** A `Lead` belongs to the seller rather than to the
listing, so it keeps the name and number of somebody who rang and stops saying which
property it was about. Deleting a stranger's contact details because a flat sold is not
a call to make on the seller's behalf — and the confirmation says so, along with what
does go.

Bucket deletions are best-effort: a storage outage must not leave somebody unable to
delete their own listing. A failed object is a stray file, which costs storage; a failed
delete would be a person told no.

## Price history, and the two badges on a card

Every price a listing has carried is kept in `ListingPriceChange` — what it was, what
it became, and when. Written by all three paths that can move a price: the yad2 scrape,
the agency editor and a seller's own form. One of them forgetting is how a history
quietly stops being one, so the decision of what counts as a change lives in one tested
place, `listings/price-history.ts`, rather than in three `if` statements.

`Listing.priceBeforeDrop` is **not** this. It is yad2's own "was" figure from their
feed: only on scraped rows, one value, and gone when they stop sending it.

Two denormalised columns, `lastPriceDropAmount` and `lastPriceDropAt`, carry the most
recent drop beside the listing — a results page badges thirty cards at once and must not
ask the history thirty questions. **A rise clears them.** A flat that went up is not a
flat on offer, and a badge saying otherwise costs somebody a viewing.

### The badges

* **`ירידת מחיר -300,000 ₪`** — shown for 30 days after a drop (`DROP_IS_NEWS_FOR_DAYS`).
* **`חדש!`** — shown for 7 days from `listedAt`, or `publishedAt` where the source gave
  no date.

Both are time-limited on purpose: a badge that never expires stops being news, and a
page where half the cards shout has told the reader nothing.

`listedAt` deliberately does **not** fall back to `firstSeenAt`. That is when *we* first
saw a listing, which on a bulk import is the same afternoon for the entire catalogue —
every card in the country would wear a "new" badge for a week. A listing we cannot date
is simply not announced as new.

The rules are in `client/src/lib/listingBadges.ts`, pure and tested, because "is this
still news" is a judgement that should not be rewritten per card.

**They exist twice.** `server/src/seo/badges.ts` carries the same two thresholds for
the server-rendered city and listing pages, because the two halves of this repository
share no package. If you change one, change the other: a buyer seeing `חדש` on a city
page and not on the search for the same flat would be right to distrust both. Both
files say so at the top, and both are tested.

## The front door

`/` is a home page; `/search` is the results. It was the other way round, so the site
opened on a grid of whatever happened to be newest beside a map of the whole country —
a page that answers a question nobody has asked yet.

The home page is a cover photograph, three tabs and one box asking where. Every filter
the results page offers is still there on arrival; putting rooms, price and property
type on the front door would ask somebody to describe a flat before naming a city.
Underneath, the cities by region — the same links the footer carries, in the place a
person looks for them, and the ones a search engine follows from the strongest page on
the site.

**Every old link still works.** Shared searches, bookmarks and every link on a city
page point at `/` with a query string; `LandingPage` carries anything with a query
string on to `/search` unchanged. The links this repository mints were repointed at
the same time — `seo/render-city.ts`, `seo/render-listing.ts`, `seo/footer.ts`,
`SiteFooter` and the saved-search page.

The cover is `Tel Aviv Skyline 01.jpg` from Wikimedia, CC BY-SA 4.0, credited under the
city grid as the licence requires — the same arrangement as the city photographs.

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
