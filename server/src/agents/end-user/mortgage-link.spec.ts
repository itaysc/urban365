import type { AgentCard } from '../core/agent.types.js';
import { attachMortgageCalculator, mortgageCalculatorLink } from './mortgage-link.js';

const shown: AgentCard = { type: 'link', href: '/mortgage?price=3000000', label: 'מחשבון המשכנתא' };

describe('mortgage calculator link', () => {
  it('sends the calculator the first time, with the price filled in', () => {
    expect(mortgageCalculatorLink(1_500_000.4, [])).toEqual({
      type: 'link',
      href: '/mortgage?price=1500000',
      label: 'מחשבון המשכנתא',
    });
  });

  it('skips the link when the last few messages already showed the calculator', () => {
    expect(mortgageCalculatorLink(1_500_000, [shown])).toBeNull();
    const result = attachMortgageCalculator('החזר 8,000 ₪.', [], [shown], 1_500_000);
    expect(result.cards).toBeUndefined();
    expect(result.summary).toBe('החזר 8,000 ₪.');
  });

  it('still sends the calculator when a different link was shown', () => {
    const search: AgentCard = { type: 'link', href: '/search?city=נתניה', label: 'כל התוצאות' };
    const card = mortgageCalculatorLink(undefined, [search]);
    expect(card?.type).toBe('link');
    if (card?.type === 'link') expect(card.href).toBe('/mortgage');
  });
});
