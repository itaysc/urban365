#!/usr/bin/env python3
"""Pulls the neighbourhood column out of the CBS statistical-areas PDF.

    pip install pypdf
    python3 scripts/extract-neighborhoods.py     # writes scripts/cbs-neighborhoods.json
    npm run neighborhoods:build                  # merges it with OSM into the client

Half of the pair. This half reads the PDF and stops at JSON, because the other half —
`merge-neighborhoods.mjs` — needs a database to decide which city an OpenStreetMap
point falls in, and because the PDF only has to be read again when the CBS publishes a
new one.

Python, alone in a TypeScript repo, because the useful text in this PDF only comes out
with positional extraction — plain text runs the five columns together — and pypdf's
layout mode is what does that well. It is a data-prep step run when the source changes,
like `sync-boundaries.mjs`, not part of the running server.

The source is `scripts/cbs-statistical-areas.pdf`: locality, locality code, 2008
statistical area, main neighbourhood names, main street names. Only the neighbourhood
column is taken.

Two things the PDF does that have to be undone:

* Layout mode hands back each line in VISUAL order, so every Hebrew cell arrives
  reversed and its brackets point the wrong way. Both are undone per cell.
* A statistical area is not a neighbourhood. "נווה יעקב (מזרח)" and "נווה יעקב (מרכז)"
  are one place that the CBS counts in halves, and nobody describes their flat as being
  in the east half of Neve Yaakov — so the trailing qualifier goes and the duplicates
  collapse.

Keys are normalised the way `cityKey` normalises them on the server, because the city
the form sends comes from the CBS locality file, which writes some of these names with a
hyphen where this table uses a space.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - a setup problem, not a parsing one
    sys.exit('pypdf is not installed. Run: pip install pypdf')

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'cbs-statistical-areas.pdf'
TARGET = HERE / 'cbs-neighborhoods.json'

MIRROR = str.maketrans('()[]{}<>', ')(][}{><')
QUALIFIER = re.compile(r'\s*\((?:[^()]*)\)?\s*$')
# What the source prints where a statistical area has no name of its own.
UNNAMED = 'אין שם שכונה'

# Places in a city that nobody lives in. They are real statistical areas and stay on the
# list — somebody really does convert a loft in an industrial zone — but they sort last,
# so the first thing a seller sees on opening the box is somewhere people live.
NOT_RESIDENTIAL = (
    'אזור תעשייה',
    'אזור התעשייה',
    'אזור תעסוקה',
    'פארק תעשי',
    'חניון',
    'מוזיאון',
    'בית עלמין',
    'בית קברות',
    'שדה תעופה',
    'נמל התעופה',
    'מרכז רפואי',
    'בית חולים',
)


def residential(name: str) -> bool:
    return not name.startswith(NOT_RESIDENTIAL)


def logical(cell: str) -> str:
    """Visual order back to logical: reverse, then mirror the brackets reversing broke."""
    return cell[::-1].translate(MIRROR).strip()


def city_key(name: str) -> str:
    """The same lossy key `server/src/listings/city-name.ts` builds, for the same reason."""
    key = unicodedata.normalize('NFKC', name or '')
    key = re.sub(r'[־‐-―-]', ' ', key)
    key = re.sub(r'[׳״\'"]', '', key)
    return re.sub(r'\s+', ' ', key).strip().lower()


def clean(hood: str) -> str:
    hood = QUALIFIER.sub('', hood.strip(' .'))
    # Reversing a gershayim leaves two apostrophes behind.
    return hood.replace("''", '"').replace('  ', ' ').strip()


def rows(path: Path):
    """Yield (city, neighbourhood cell) for every row of the table."""
    reader = PdfReader(str(path))
    city = None

    for page in reader.pages:
        for line in (page.extract_text(extraction_mode='layout') or '').split('\n'):
            fields = [f for f in re.split(r'\s{3,}', line.strip()) if f]
            if len(fields) < 3:
                continue

            # Read from the right of the printed table: city, locality code, statistical
            # area, then the neighbourhoods. A continuation row repeats neither the city
            # nor its code, so the last city seen still applies.
            if re.fullmatch(r'\d+', fields[-1]) and re.fullmatch(r'\d+', fields[-2]):
                name, hoods = None, fields[-3]
            else:
                name, code, area = logical(fields[-1]), fields[-2], fields[-3]
                if not re.fullmatch(r'\d+', code) or not re.fullmatch(r'\d+', area):
                    continue
                hoods = fields[-4] if len(fields) >= 4 else ''

            if name:
                city = name
            if city and hoods:
                yield city, logical(hoods)


def main() -> None:
    by_city: dict[str, list[str]] = {}

    for city, cell in rows(SOURCE):
        key = city_key(city)
        for raw in cell.split(','):
            hood = clean(raw)
            if len(hood) < 2 or UNNAMED in hood:
                continue
            names = by_city.setdefault(key, [])
            if hood not in names:
                names.append(hood)

    total = sum(len(v) for v in by_city.values())
    if len(by_city) < 100 or total < 2000:
        # The table has had ~114 localities and a couple of thousand neighbourhoods for
        # years. Fewer means the parse found something other than the table, and writing
        # it would silently shrink the picker.
        sys.exit(f'Only {total} neighbourhoods in {len(by_city)} cities — refusing to write.')

    ordered = {
        key: sorted(names, key=lambda n: (not residential(n), n))
        for key, names in sorted(by_city.items())
    }

    TARGET.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=1, sort_keys=True) + '\n',
        encoding='utf8',
    )

    print(f'Wrote {total} neighbourhoods across {len(by_city)} cities to {TARGET.name}')
    print('Now run: npm run neighborhoods:build')


main()
