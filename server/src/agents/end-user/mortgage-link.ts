import type { AgentCard, ToolResult } from '../core/agent.types.js';
import { pageHref } from './pages.js';

/** Added to the tool summary only when the calculator card is actually sent. */
export const MORTGAGE_CALCULATOR_HINT = 'אפשר לשנות את המסלולים במחשבון המשכנתא.';

/**
 * The calculator card, or nothing when one was already drawn in the recent messages.
 * A different price on the same page still counts as the same link.
 */
export function mortgageCalculatorLink(price: number | undefined, recent: AgentCard[] | undefined): AgentCard | null {
  if (recent?.some(isMortgageCalculator)) return null;
  return {
    type: 'link',
    href: pageHref('mortgage', { price: price && price > 0 ? Math.round(price) : undefined }) ?? '/mortgage',
    label: 'מחשבון המשכנתא',
  };
}

/** Keeps the payment cards, and adds the calculator link only when it was not just shown. */
export function attachMortgageCalculator(
  summary: string,
  cards: AgentCard[],
  recent: AgentCard[] | undefined,
  price?: number,
): ToolResult {
  const link = mortgageCalculatorLink(price, recent);
  return {
    summary: link ? `${summary} ${MORTGAGE_CALCULATOR_HINT}` : summary,
    cards: link ? [...cards, link] : cards.length ? cards : undefined,
  };
}

function isMortgageCalculator(card: AgentCard): boolean {
  if (card.type !== 'link') return false;
  const path = card.href.split(/[?#]/)[0] ?? '';
  return path === '/mortgage' || path === '/mortgage/' || card.label === 'מחשבון המשכנתא';
}
