import {
  clearBuyingPower,
  loadBuyingPower,
  quoteListing,
  type BuyingMark,
  type BuyingPower,
  type ListingQuote,
} from '@/lib/buying-power';
import { formatShekel } from '@/lib/format';
import { BUYER_LABEL } from '@/lib/mortgage';

/**
 * The same marks the search cards carry, painted onto a server-rendered city page.
 *
 * Those pages are HTML. They cannot know what this browser saved in the calculator,
 * and a crawler should keep seeing the price alone. When a household is here, the
 * figures are added after the page has loaded, and taken off again if it is cleared.
 */

const MARK_LABEL: Record<BuyingMark, string> = {
  equity: 'חסר הון עצמי',
  income: 'החזר מעל התקרה',
  cash: 'חסר מזומן',
};

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function affordBlock(quote: ListingQuote): string {
  const marks = quote.marks.map((mark) => MARK_LABEL[mark]).join(' · ');
  const breakdown = `מס רכישה ${formatShekel(quote.purchaseTax)}, עורך דין ${formatShekel(quote.lawyer)} (הערכה). הבנק לא מממן אותם.`;

  return `<div class="afford">
<div class="pay"><span>החזר ${esc(formatShekel(quote.monthly))}</span>${
    marks ? `<span class="mark">${esc(marks)}</span>` : ''
  }</div>
<p class="rest" title="${esc(breakdown)}">הון נדרש ${esc(formatShekel(quote.equityRequired))} · מס ועורך דין ${esc(formatShekel(quote.extraCash))}</p>
</div>`;
}

export function buyingNote(power: BuyingPower): string {
  const income =
    power.incomeKnown && power.income > 0 ? ` והכנסה ${esc(formatShekel(power.income))}` : '';

  return `<p class="buying">כל הדירות מוצגות. הסימון לפי ${esc(BUYER_LABEL[power.buyer])}, הון ${esc(formatShekel(power.equity))}${income}. <a href="/mortgage?tab=budget">עדכון</a> · <button type="button" class="clear">הסרה</button></p>`;
}

function paint(root: ParentNode): void {
  root.querySelectorAll('.afford, .buying').forEach((node) => node.remove());

  const power = loadBuyingPower();
  if (!power) return;

  const cards = [...root.querySelectorAll<HTMLElement>('[data-price]')];
  if (cards.length === 0) return;

  const list = cards[0].closest('ul');
  list?.insertAdjacentHTML('beforebegin', buyingNote(power));

  for (const card of cards) {
    const price = Number(card.dataset.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    card.querySelector('.price')?.insertAdjacentHTML('afterend', affordBlock(quoteListing(power, price)));
  }

  root.querySelector<HTMLButtonElement>('.buying .clear')?.addEventListener('click', () => {
    clearBuyingPower();
    paint(root);
  });
}

/**
 * The sale comparison, fetched because the page was rendered without waiting for it.
 * The sentence is the server's. It lies across the photograph, not under the price.
 */
function paintGaps(root: ParentNode): void {
  const cards = [...root.querySelectorAll<HTMLElement>('[data-id]')];
  const ids = cards.map((card) => card.dataset.id).filter((id): id is string => !!id && /^[a-z0-9]{8,40}$/iu.test(id));
  if (ids.length === 0) return;

  fetch(`/api/v1/listings/price-checks?ids=${encodeURIComponent(ids.slice(0, 36).join(','))}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { items?: { id: string; headline: string; stance?: string }[] } | null) => {
      for (const item of body?.items ?? []) {
        if (!/^[a-z0-9]{8,40}$/iu.test(item.id) || !item.headline) continue;
        const photo = root.querySelector(`[data-id="${item.id}"] .photo`);
        if (!photo || photo.querySelector('.gap')) continue;
        const tone = item.stance === 'above' || item.stance === 'below' ? ` ${item.stance}` : '';
        photo.insertAdjacentHTML('beforeend', `<p class="gap${tone}">${esc(item.headline)}</p>`);
      }
    })
    .catch(() => undefined);
}

if (typeof document !== 'undefined' && document.querySelector('[data-price]')) {
  paint(document);
  paintGaps(document);
}
