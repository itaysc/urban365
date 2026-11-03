import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { SiteFooter } from '@/components/SiteFooter';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { useAuth } from '@/auth/auth-context';
import { SiteHeader } from '@/components/SiteHeader';
import { CityBox } from '@/components/listing/CityBox';
import { StreetBox } from '@/components/listing/StreetBox';
import { NeighborhoodBox } from '@/components/listing/NeighborhoodBox';
import { RoomsPicker } from '@/components/search/RoomsPicker';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { panelClass } from '@/components/mortgage/panel';
import { PinMap } from '@/components/valuation/PinMap';
import { Result } from '@/components/valuation/Result';
import { Section } from '@/components/valuation/Section';
import {
  ASPECTS,
  ASPECT_LABEL,
  BUILDING_STATES,
  BUILDING_STATE_LABEL,
  CONDITIONS,
  CONDITION_HINT,
  CONDITION_LABEL,
  RENEWALS,
  RENEWAL_LABEL,
  type Aspect,
  type BuildingState,
  type Condition,
  type Renewal,
} from '@/lib/propertyCondition';
import { findPlace, findStreet, valueProperty, type ValuationInput } from '@/services/valuation';
import {
  EMPTY_FORM,
  isBlankValuationDraft,
  readValuationDraft,
  rememberValuationDraft,
  type ValuationForm,
  type ValuationPin,
} from '@/lib/valuationDraft';

/**
 * הערכת שווי — what a flat is worth, from sales that actually happened.
 *
 * The method is an estate agent's, not ours: find comparable sales, restate them at
 * today's prices and this flat's size, adjust for what is different, and quote a
 * range with a price inside it. What the page adds is that the comparables come from
 * three million recorded Tax Authority transactions rather than from memory.
 *
 * The shape follows `MortgagePage`: form on one side, result on the other, with the
 * result in an `aria-live` region so it is announced when it arrives rather than
 * silently replacing what was there.
 *
 * The data sheet is long, so it is grouped and all but the first part is closed. The
 * first four answers — town, pin, rooms, size — produce a valuation on their own; the
 * rest narrow the range, and the page says so rather than demanding them.
 */

/** Israel's centre, for the moment before a town is chosen. */
const DEFAULT_CENTRE = { latitude: 31.9, longitude: 34.9 };

export function ValuationPage() {
  /*
   * The tool is for people with an account.
   *
   * Derived rather than opened from an effect: `dismissed` is the only state, so
   * signing in closes the dialog on its own — the moment a user exists the gate is
   * gone and there is nothing left to ask. Opening it from an effect would also mean
   * a render of the signed-out page before the dialog appeared over it.
   */
  const { user, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const needsAccount = !loading && user === null;
  /*
   * Last visit's answers, read once before the first render.
   *
   * A lazy initialiser rather than an effect: restoring in an effect would paint an
   * empty form first and fill it a frame later, which reads as the page losing the
   * answers and then finding them again.
   */
  const [restored] = useState(readValuationDraft);
  const [form, setForm] = useState<ValuationForm>(restored.form);
  /**
   * Null until the person places it; the town's centre stands in meanwhile.
   *
   * It remembers which settlement it was placed in, so a pin belonging to the
   * previous town is simply ignored once the town changes. Clearing it from an
   * effect instead would mean a render where a Tel Aviv pin is attached to Dimona.
   */
  const [pin, setPin] = useState<ValuationPin | null>(restored.pin);

  /*
   * The street, once the typing has stopped.
   *
   * `StreetBox` reports every keystroke, and each one would otherwise be a lookup.
   * The server refuses anything that is not a street in the register, so a prefix
   * costs nothing there either — but it is still a request per letter.
   */
  const [typedStreet, setTypedStreet] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setTypedStreet(form.street.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [form.street]);

  const set = <K extends keyof ValuationForm>(key: K, value: ValuationForm[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  // Written on every change rather than on submit: the answer most worth keeping is
  // the one from the visit where nobody got as far as pressing the button.
  useEffect(() => {
    rememberValuationDraft({ form, pin });
  }, [form, pin]);

  /*
   * Starting again on a different flat.
   *
   * The form remembers everything, which is right for one property over several
   * sittings and wrong the moment it is a second property — so there has to be a way
   * back to empty that is not twenty deletions. Putting the form back to blank clears
   * the stored draft too, because `rememberValuationDraft` declines to store a blank
   * one. The old answer goes with it: leaving a range on screen that belongs to a
   * flat whose details have just been wiped is the worst of both.
   */
  const blank = isBlankValuationDraft({ form, pin });

  const clear = () => {
    setForm(EMPTY_FORM);
    setPin(null);
    valuation.reset();
  };

  /*
   * The town's centre comes from our own recorded sales, so choosing a town costs one
   * query and no outside request. It also tells us the settlement code the registry
   * files the town under, which is what the price index and the size exponent are
   * looked up by.
   */
  const place = useQuery({
    queryKey: ['valuation', 'place', form.city],
    queryFn: () => findPlace(form.city),
    enabled: !needsAccount && form.city.trim().length > 1,
    staleTime: Infinity,
  });

  /*
   * The centre is derived, not stored. Mirroring it into state meant the town's key
   * and its coordinates changed in different renders, and the map flew to the wrong
   * one — see `PinMap`'s own note.
   */
  const town =
    place.data?.latitude !== undefined && place.data?.longitude !== undefined
      ? { latitude: place.data.latitude, longitude: place.data.longitude }
      : DEFAULT_CENTRE;

  const settlementCode = place.data?.settlementCode ?? null;

  /*
   * A street narrows the opening view from a whole town to one road.
   *
   * It is navigation and nothing more — the estimate is built around the pin, never
   * around this — so a street the server cannot place costs nothing. The map simply
   * opens on the town as it did before.
   */
  const streetPoint = useQuery({
    queryKey: ['valuation', 'street', form.city.trim(), typedStreet],
    queryFn: () => findStreet(form.city.trim(), typedStreet),
    enabled: !needsAccount && form.city.trim().length > 1 && typedStreet.length > 1,
    staleTime: Infinity,
  });

  const located =
    streetPoint.data?.latitude != null && streetPoint.data?.longitude != null
      ? { latitude: streetPoint.data.latitude, longitude: streetPoint.data.longitude }
      : null;

  const centre = located ?? town;

  /*
   * A street we could not place, said out loud.
   *
   * OpenStreetMap is missing about a third of the Interior Ministry's street names
   * under the spelling the register uses — measured over a sample of towns — so this
   * is the ordinary case, not the exotic one. Until it was said, choosing one of
   * those streets did nothing at all and the page looked broken.
   */
  const unplaced = streetPoint.isSuccess && located === null;

  /*
   * What the pin is pinned *to*. The map re-centres whenever this changes, and a pin
   * dropped before it changed belongs to somewhere else — a Tel Aviv rooftop does
   * not describe a flat in Dimona, and nor does a pin on Dizengoff once the street
   * says Allenby. Tying the two together is what keeps the marker on screen and the
   * point we submit from ever being two different places.
   */
  const where = `${settlementCode ?? 'none'}|${located ? typedStreet : ''}`;
  const here = pin?.where === where ? pin : null;

  const point = here ?? centre;

  /*
   * A street counts as placed. It is a building's worth of precision short of a
   * dragged pin, and the caption below the map says so — but it is close enough to
   * value from, and making someone tap a map to confirm a street they just chose is
   * asking them to answer the same question twice.
   *
   * A town on its own is not: the centre of a city is not a location, and an estimate
   * built around it would be an estimate of somewhere else.
   */
  const pinned = here !== null || located !== null;

  const resultRef = useRef<HTMLDivElement>(null);
  const signInTrigger = useRef<HTMLButtonElement>(null);

  /*
   * Bring the answer into view when it arrives.
   *
   * On a phone the result sits below the whole form, and on a wide screen it sits
   * beside a form the person has usually scrolled down. Either way the default is
   * that pressing the button appears to do nothing. The `aria-live` region announces
   * itself to a screen reader; this is the same courtesy for everyone else.
   */
  const valuation = useMutation({
    mutationFn: valueProperty,
    onSuccess: () => {
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    },
  });

  const area = Number(form.area);
  const ready =
    form.city.trim() !== '' &&
    form.rooms !== undefined &&
    Number.isFinite(area) &&
    area >= 20 &&
    area <= 400 &&
    pinned;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || form.rooms === undefined) return;

    const input: ValuationInput = {
      city: form.city.trim(),
      street: form.street.trim() || undefined,
      neighborhood: form.neighborhood.trim() || undefined,
      latitude: point.latitude,
      longitude: point.longitude,
      gush: numberOr(form.gush),
      chelka: numberOr(form.chelka),
      settlementCode: settlementCode ?? undefined,
      rooms: form.rooms,
      area,
      attributes: {
        floor: numberOr(form.floor),
        topFloor: numberOr(form.topFloor),
        hasLift: form.hasLift,
        condition: form.condition,
        hasParking: form.hasParking,
        hasStorage: form.hasStorage,
        hasBalcony: form.hasBalcony,
        hasMamad: form.hasMamad,
        aspect: form.aspect,
        buildingState: form.buildingState,
        renewal: form.renewal,
      },
    };

    valuation.mutate(input);
  };

  const propertyAnswered = [
    form.floor,
    form.topFloor,
    form.condition,
    form.hasBalcony,
    form.hasMamad,
  ].filter((value) => value !== '' && value !== undefined).length;

  // Nothing here is a text box any more, so "unanswered" is simply undefined.
  const buildingAnswered = [
    form.hasLift,
    form.hasParking,
    form.hasStorage,
    form.buildingState,
  ].filter((value) => value !== undefined).length;

  const surroundingsAnswered = [form.aspect, form.renewal, form.gush, form.chelka].filter(
    (value) => value !== '' && value !== undefined,
  ).length;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">הערכת שווי לדירה</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          לפי עסקאות שנרשמו בפועל ברשות המסים — לא לפי מחירים מבוקשים במודעות. ממלאים
          את הפרטים, ומקבלים טווח מחירים ומחיר פרסום מומלץ.
        </p>

        {needsAccount ? (
          <section className={`${panelClass} mt-5 max-w-xl`}>
            <h2 className="text-base font-semibold text-slate-800">
              צריך חשבון כדי לקבל הערכה
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              ההערכה נשמרת בחשבון שלכם, כך שתוכלו לחזור אליה ולהשוות בין נכסים. ההרשמה
              קצרה ובחינם.
            </p>
            <button
              type="button"
              ref={signInTrigger}
              onClick={() => setDismissed(false)}
              className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              התחברות או הרשמה
            </button>
          </section>
        ) : (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/*
            `min-w-0` is load-bearing. A grid child defaults to `min-width: auto`, so
            it refuses to shrink below its widest content — and the rooms picker is a
            row of eleven buttons. Without this the form grew to 508px inside a 375px
            phone and took the whole page sideways with it; with it, the picker's own
            `overflow-x-auto` scrolls instead.
          */}
          <form onSubmit={submit} className={`${panelClass} flex min-w-0 flex-col gap-4`}>
            <Field label="עיר" htmlFor="city" required>
              <CityBox value={form.city} onChange={(value) => set('city', value)} required />
            </Field>

            {place.data?.settlementCode === null && form.city.trim().length > 1 && (
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                אין במאגר עסקאות שנרשמו ביישוב הזה, ולכן לא נוכל להעריך נכס בו.
              </p>
            )}

            <Field label="רחוב" htmlFor="street">
              <StreetBox
                city={form.city}
                value={form.street}
                onChange={(value) => set('street', value)}
              />
              {unplaced ? (
                <p className="mt-1 text-xs text-amber-800">
                  את הרחוב הזה לא מצאנו על המפה. סמנו את המיקום ידנית — ההערכה נבנית
                  סביב הסמן, כך שהדיוק שלה לא נפגע.
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  לא חובה — אם נמצא את הרחוב נמקם עליו את הסמן, ואפשר לגרור אותו לבניין
                  המדויק.
                </p>
              )}
            </Field>

            <RoomsPicker
              min={form.rooms}
              max={form.rooms}
              single
              onChange={(next) => set('rooms', next.min)}
            />

            <Field label="שטח רשום במ״ר" htmlFor="area" required>
              <input
                id="area"
                className={inputClass}
                inputMode="numeric"
                value={form.area}
                onChange={(event) => set('area', event.target.value.replace(/\D/g, ''))}
                placeholder="95"
              />
              {/*
                Named on purpose. Registered versus built versus "including the
                balcony" is an 8–12% difference that never looks wrong on the way in
                and is wrong all the way through afterwards.
              */}
              <p className="mt-1 text-xs text-slate-500">
                השטח הרשום בטאבו, בלי מרפסות ובלי מחסן.
              </p>
            </Field>

            <Section
              title="הדירה"
              hint="קומה, מצב ומה יש בה"
              answered={propertyAnswered}
              total={5}
            >
              {/*
                Read as one sentence — "floor 3 of 8" — because that is how anyone
                says it, and because the two together are what the adjustment uses:
                a third floor means something different in a block of four and in a
                tower of twenty.

                `min-w-0` on each half for the reason given above the form: a grid
                child will not shrink below an input's intrinsic width without it.
              */}
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <Field label="קומה" htmlFor="floor">
                    <input
                      id="floor"
                      className={inputClass}
                      inputMode="numeric"
                      value={form.floor}
                      onChange={(event) => set('floor', event.target.value.replace(/[^\d]/g, ''))}
                      placeholder="3"
                    />
                  </Field>
                </div>

                <div className="min-w-0">
                  <Field label="מתוך קומה" htmlFor="topFloor">
                    <input
                      id="topFloor"
                      className={inputClass}
                      inputMode="numeric"
                      value={form.topFloor}
                      onChange={(event) => set('topFloor', event.target.value.replace(/\D/g, ''))}
                      placeholder="8"
                    />
                  </Field>
                </div>
              </div>

              <Field label="מצב הדירה" htmlFor="condition">
                <select
                  id="condition"
                  className={selectClass}
                  value={form.condition ?? ''}
                  onChange={(event) =>
                    set('condition', (event.target.value || undefined) as Condition | undefined)
                  }
                >
                  <option value="">לא צוין</option>
                  {CONDITIONS.map((condition) => (
                    <option key={condition} value={condition}>
                      {CONDITION_LABEL[condition]}
                    </option>
                  ))}
                </select>
                {form.condition && (
                  <p className="mt-1 text-xs text-slate-500">{CONDITION_HINT[form.condition]}</p>
                )}
              </Field>

              <Yes label="מרפסת" value={form.hasBalcony} onChange={(v) => set('hasBalcony', v)} />
              <Yes label='ממ"ד' value={form.hasMamad} onChange={(v) => set('hasMamad', v)} />
            </Section>

            <Section
              title="הבניין"
              hint="מעלית, חניה ומצב הבניין"
              answered={buildingAnswered}
              total={4}
            >
              <Yes label="מעלית" value={form.hasLift} onChange={(v) => set('hasLift', v)} />

              <Yes label="חניה" value={form.hasParking} onChange={(v) => set('hasParking', v)} />
              <Yes label="מחסן" value={form.hasStorage} onChange={(v) => set('hasStorage', v)} />

              <Field label="מצב הבניין" htmlFor="buildingState">
                <select
                  id="buildingState"
                  className={selectClass}
                  value={form.buildingState ?? ''}
                  onChange={(event) =>
                    set(
                      'buildingState',
                      (event.target.value || undefined) as BuildingState | undefined,
                    )
                  }
                >
                  <option value="">לא צוין</option>
                  {BUILDING_STATES.map((state) => (
                    <option key={state} value={state}>
                      {BUILDING_STATE_LABEL[state]}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>

            <Section
              title="הסביבה והרישום"
              hint="נוף, התחדשות עירונית, גוש וחלקה"
              answered={surroundingsAnswered}
              total={4}
            >
              <Field label="שכונה" htmlFor="neighborhood">
                <NeighborhoodBox
                  city={form.city}
                  value={form.neighborhood}
                  onChange={(value) => set('neighborhood', value)}
                />
              </Field>

              <Field label="כיווני אוויר ונוף" htmlFor="aspect">
                <select
                  id="aspect"
                  className={selectClass}
                  value={form.aspect ?? ''}
                  onChange={(event) =>
                    set('aspect', (event.target.value || undefined) as Aspect | undefined)
                  }
                >
                  <option value="">לא צוין</option>
                  {ASPECTS.map((aspect) => (
                    <option key={aspect} value={aspect}>
                      {ASPECT_LABEL[aspect]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="התחדשות עירונית" htmlFor="renewal">
                <select
                  id="renewal"
                  className={selectClass}
                  value={form.renewal ?? ''}
                  onChange={(event) =>
                    set('renewal', (event.target.value || undefined) as Renewal | undefined)
                  }
                >
                  <option value="">לא צוין</option>
                  {RENEWALS.map((renewal) => (
                    <option key={renewal} value={renewal}>
                      {RENEWAL_LABEL[renewal]}
                    </option>
                  ))}
                </select>
              </Field>

              {/*
                Gush and chelka are the registry's own "same building", so supplying
                them is the single biggest improvement available — it lets the estimate
                use sales in this very block. They are on the arnona bill and the tabu
                extract, and nobody knows them by heart.
              */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="גוש" htmlFor="gush">
                  <input
                    id="gush"
                    className={inputClass}
                    inputMode="numeric"
                    value={form.gush}
                    onChange={(event) => set('gush', event.target.value.replace(/\D/g, ''))}
                  />
                </Field>
                <Field label="חלקה" htmlFor="chelka">
                  <input
                    id="chelka"
                    className={inputClass}
                    inputMode="numeric"
                    value={form.chelka}
                    onChange={(event) => set('chelka', event.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              </div>
              <p className="-mt-1 text-xs text-slate-500">
                מופיעים בחשבון הארנונה ובנסח הטאבו. אם תמלאו אותם, נשתמש בעסקאות
                מאותה חלקה — ההשוואה הטובה ביותר שיש.
              </p>
            </Section>

            <button
              type="submit"
              disabled={!ready || valuation.isPending}
              className="mt-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {valuation.isPending ? 'מחשב…' : 'חשב טווח שווי'}
            </button>

            {/* Nothing to clear until something has been answered. */}
            {!blank && (
              <button
                type="button"
                onClick={clear}
                className="self-center text-xs text-slate-500 underline-offset-2 transition hover:text-slate-800 hover:underline"
              >
                ניקוי הטופס והתחלה מחדש
              </button>
            )}
          </form>

          {/*
            The map and the answer.

            Second in the DOM, which is the whole placement: a right-to-left grid fills
            from the right, so the form takes the right column and this takes the left,
            and on a narrow screen they stack in the order written — form, then map.

            Inside here the two swap by breakpoint. On a wide screen the map sits above
            the answer, where both are in view at once. On a phone nothing is in view at
            once, so the answer comes first and the map goes to the bottom: once the
            button is pressed, the number is what you want under your thumb.
          */}
          <aside className="flex min-w-0 flex-col gap-5">
            <div className={`${panelClass} order-2 flex flex-col gap-2 lg:order-1`}>
              <PinMap
                centreKey={where}
                pin={point}
                precision={located ? 'street' : 'town'}
                onMove={(latitude, longitude) => setPin({ latitude, longitude, where })}
              />

              {!pinned && form.city.trim() !== '' && (
                <p className="text-xs text-amber-800">סמנו את מיקום הנכס על המפה כדי להמשיך.</p>
              )}
            </div>

            <div ref={resultRef} className="order-1 flex min-w-0 flex-col gap-5 scroll-mt-6 lg:order-2">
              {valuation.isError && (
                <section className={panelClass} aria-live="assertive">
                  <h2 className="text-base font-semibold text-slate-800">לא הצלחנו לחשב</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    משהו השתבש בדרך לשרת. נסו שוב בעוד רגע.
                  </p>
                </section>
              )}

              {valuation.data && <Result result={valuation.data} />}
            </div>
          </aside>


        </div>
        )}

        {/*
          Shipping this tool meant reversing a disclaimer the site carried on purpose,
          and the condition was saying plainly what it is and is not. So it stays —
          under everything, across the full width, where a footnote belongs.
        */}
        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          זו הערכה אינדיקטיבית ואינה תחליף לשמאות מקרקעין. שמאי מוסמך בודק את הנכס עצמו
          ונותן חוות דעת רשמית — מה שבנק, בית משפט או רשות מס מקבלים. הכלי הזה עונה על
          שאלה אחרת: באיזה מחיר לפרסם כדי למכור.
        </p>

        <LoginDialog
          open={needsAccount && !dismissed}
          onOpenChange={(open) => setDismissed(!open)}
          returnFocusTo={signInTrigger}
          description="כדי לקבל הערכת שווי ולשמור אותה"
          returnTo="/valuation"
        />
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * A yes/no that can also be unanswered, which a checkbox cannot express.
 *
 * The difference matters all the way into the arithmetic: an unanswered field
 * contributes nothing to the estimate and widens the range, while "no parking" costs
 * the flat real money. A checkbox left alone would silently mean the second.
 */
function Yes({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
}) {
  const options: { label: string; value: boolean | undefined }[] = [
    { label: 'יש', value: true },
    { label: 'אין', value: false },
    { label: 'לא יודע', value: undefined },
  ];

  return (
    <fieldset className="flex min-w-0 items-center justify-between gap-3">
      <legend className="float-start text-sm text-slate-700">{label}</legend>
      <div className="ms-auto flex gap-1.5">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              value === option.value
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const numberOr = (value: string): number | undefined => {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) ? parsed : undefined;
};
