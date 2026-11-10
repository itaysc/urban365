import { presentLink, type LinkRow } from './document-links.js';

const empty: LinkRow = { id: 'l1', customer: null, listing: null, deal: null, mortgageCase: null, lead: null };

describe('presentLink', () => {
  it('names the record a file is attached to', () => {
    expect(presentLink({ ...empty, customer: { id: 'c1', name: 'דנה' } })).toEqual({
      id: 'l1',
      subject: 'customer',
      subjectId: 'c1',
      label: 'לקוח · דנה',
    });
    expect(presentLink({ ...empty, listing: { id: 'p1', street: 'אבנר', city: 'חולון' } })?.label).toBe(
      'נכס · אבנר, חולון',
    );
    expect(presentLink({ ...empty, deal: { id: 'd1', title: 'דירת גן' } })?.label).toBe('עסקה · דירת גן');
    expect(
      presentLink({
        ...empty,
        mortgageCase: { id: 'm1', propertyCity: 'חיפה', customer: { name: 'יוסי' } },
      })?.label,
    ).toBe('תיק משכנתא · יוסי');
    expect(presentLink({ ...empty, lead: { id: 'e1', name: 'מיכל' } })?.label).toBe('פנייה · מיכל');
    expect(presentLink(empty)).toBeNull();
  });
});
