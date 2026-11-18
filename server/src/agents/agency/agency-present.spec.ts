import {
  bankerContactCard,
  bankerContactSummary,
  customerCard,
  customerSummary,
  dealSummary,
  leadCard,
  leadSummary,
  meetingSummary,
  mortgageCaseSummary,
} from './agency-present.js';

const PHONE = /0\d[\d\-\s]{7,}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

describe('agency summaries keep phones and emails off the model', () => {
  it('leaves contact details out of the customer summary and on the card', () => {
    const row = {
      id: 'c1',
      name: 'ישראל ישראלי',
      kind: 'buyer',
      phone: '050-1234567',
      email: 'israel@example.com',
      notes: 'מחפש בחולון',
      lookingCities: ['חולון'],
    };
    expect(customerSummary(row)).not.toMatch(PHONE);
    expect(customerSummary(row)).not.toMatch(EMAIL);
    const card = customerCard(row);
    expect(card.type).toBe('customer');
    if (card.type === 'customer') {
      expect(card.phone).toBe('050-1234567');
      expect(card.email).toBe('israel@example.com');
    }
  });

  it('leaves contact details out of the lead summary', () => {
    const row = {
      id: 'l1',
      name: 'דנה',
      status: 'new',
      phone: '052-9998877',
      email: 'dana@mail.co.il',
      message: 'מעוניינת בביקור',
      listing: { id: 'x', city: 'נתניה', street: 'הרצל' },
    };
    expect(leadSummary(row)).not.toMatch(PHONE);
    expect(leadSummary(row)).not.toMatch(EMAIL);
    const card = leadCard(row);
    expect(card.type).toBe('lead');
    if (card.type === 'lead') expect(card.phone).toBe('052-9998877');
  });

  it('leaves banker phones off the summary and on the card', () => {
    const row = {
      id: 'b1',
      bankName: 'לאומי',
      branch: 'חולון',
      name: 'רונית',
      phone: '03-1234567',
      email: 'ronit@bank.co.il',
    };
    expect(bankerContactSummary(row)).not.toMatch(PHONE);
    expect(bankerContactSummary(row)).not.toMatch(EMAIL);
    const card = bankerContactCard(row);
    expect(card.type).toBe('banker_contact');
    if (card.type === 'banker_contact') expect(card.phone).toBe('03-1234567');
  });

  it('names a mortgage case without contact details', () => {
    const summary = mortgageCaseSummary({
      id: 'm1',
      stage: 'sent_to_banks',
      requestedAmount: 1_200_000,
      propertyValue: 2_000_000,
      propertyCity: 'רמת גן',
      loanTermYears: 25,
      customer: { id: 'c1', name: 'ישראל' },
      bankOffers: [{ bankName: 'הפועלים', monthlyPayment: 6_500, interestRate: 4.2 }],
    });
    expect(summary).toContain('ישראל');
    expect(summary).toContain('מכרז');
    expect(summary).not.toMatch(PHONE);
  });

  it('names a deal and a meeting without a phone', () => {
    expect(
      dealSummary({
        id: 'd1',
        title: 'דירה ברחובות',
        stage: 'negotiation',
        price: 2_000_000,
        customer: { id: 'c1', name: 'ישראל' },
      }),
    ).not.toMatch(PHONE);

    expect(
      meetingSummary({
        id: 'm1',
        title: 'סיור',
        startsAt: '2026-11-20T10:00:00.000Z',
        location: 'חולון',
        customer: { id: 'c1', name: 'ישראל' },
      }),
    ).not.toMatch(PHONE);
  });
});
