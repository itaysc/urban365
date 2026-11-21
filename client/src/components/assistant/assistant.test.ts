import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assistantOpensOnLoad,
  displayChatText,
  formatChatDate,
  forgetTranscript,
  rememberAssistantOpen,
  rememberTranscript,
  shownTranscript,
  stickAfterScroll,
  storedTranscript,
  typeStep,
} from './assistant';
import { actionText, CHAT_CATEGORIES } from './chat-actions';
import { valuationReply } from './valuation-reply';

describe('chat dates', () => {
  it('shows an ISO day as DD/MM/YYYY', () => {
    expect(formatChatDate('2024-06-01')).toBe('01/06/2024');
    expect(displayChatText('נמכרה ב-2024-06-01 ליד הרחוב')).toBe('נמכרה ב-01/06/2024 ליד הרחוב');
  });

  it('leaves a year and a price alone', () => {
    expect(displayChatText('ב-2024 החציון 1,900,000 ₪')).toBe('ב-2024 החציון 1,900,000 ₪');
  });
});

describe('valuationReply', () => {
  it('says the filled fields the way the valuation parser reads them', () => {
    const said = valuationReply({
      city: 'חולון',
      street: 'דב הוז',
      rooms: '4',
      area: '97',
      floor: '2',
      topFloor: '4',
      condition: ['fair'],
      balcony: ['yes'],
      mamad: ['no'],
      lift: [],
      parking: ['yes'],
      storage: ['no'],
      building: ['well-kept'],
      aspect: ['blocked'],
      renewal: ['none'],
      gush: '10',
      chelka: '20',
    });

    expect(said).toContain('בעיר חולון');
    expect(said).toContain('רחוב דב הוז');
    expect(said).toContain('קומה 2 מתוך 4');
    expect(said).toContain('יש מרפסת');
    expect(said).toContain('אין ממ״ד');
    expect(said).toContain('נוף חסום');
    expect(said).toContain('גוש 10 חלקה 20');
    expect(said).not.toContain('מעלית');
  });
});

describe('chat actions', () => {
  it('offers the five categories, each item as its own card', () => {
    expect(CHAT_CATEGORIES.map((item) => item.label)).toEqual(['קנייה', 'מכירה', 'משכנתא', 'הערכת שווי', 'מידע']);
    for (const category of CHAT_CATEGORIES) {
      expect(category.items.length).toBeGreaterThan(0);
      for (const item of category.items) {
        if (item.card.type !== 'a2ui') throw new Error(item.id);
        const ids = new Set(item.card.components.map((component) => component.id));
        expect(ids.size).toBe(item.card.components.length);
        for (const component of item.card.components) {
          for (const child of [component.child, ...(component.children ?? [])]) {
            if (child) expect(ids.has(child)).toBe(true);
          }
        }
        expect(item.card.components.some((component) => component.id === 'root')).toBe(true);
      }
    }
  });

  it('asks for a place in one address field', () => {
    for (const category of CHAT_CATEGORIES) {
      for (const item of category.items) {
        if (item.card.type !== 'a2ui') continue;
        const labels = item.card.components.map((component) => component.label);
        expect(labels).not.toContain('עיר');
        expect(labels).not.toContain('רחוב');
        expect(labels).not.toContain('עיר או שכונה');
      }
    }
    const street = CHAT_CATEGORIES.find((item) => item.id === 'value')?.items.find((item) => item.id === 'street');
    if (street?.card.type !== 'a2ui') throw new Error('street');
    expect(street.card.components.some((component) => component.component === 'AddressField')).toBe(true);
  });

  it('reads one address line as the street and the city', () => {
    expect(actionText('submit_street', { address: 'ויצמן 9, חולון' })).toBe(
      'אני רוצה לדעת מה המחיר הממוצע ברחוב ויצמן 9 בעיר חולון',
    );
  });

  it('turns a filled search into the sentence the search tool expects', () => {
    expect(actionText('submit_search', { section: ['rent'], city: 'תל אביב', roomsMin: '3', roomsMax: '4.5', budget: '8000' })).toBe(
      'אני מחפש דירה להשכרה, בעיר תל אביב, 3–4.5 חדרים, עד 8000',
    );
  });

  it('opens saved listings from קנייה, and the search asks for a rooms range', () => {
    const buy = CHAT_CATEGORIES.find((item) => item.id === 'buy');
    const saved = buy?.items.find((item) => item.id === 'saved');
    const search = buy?.items.find((item) => item.id === 'search');
    if (saved?.card.type !== 'a2ui' || search?.card.type !== 'a2ui') throw new Error('buy');
    expect(saved.label).toBe('נכסים ששמרתי');
    expect(saved.card.components.some((component) => component.component === 'SavedListings')).toBe(true);
    expect(search.card.components.some((component) => component.component === 'RoomsRange')).toBe(true);
  });

  it('keeps a filled valuation from starting the questionnaire again', () => {
    const said = actionText('submit_valuation', { city: 'חולון', rooms: '4', building: ['well-kept'] });
    expect(said.startsWith('אני רוצה הערכת שווי לדירה.')).toBe(true);
    expect(said).toContain('בעיר חולון');
    expect(said).toContain('הבניין מטופח');
  });

  it('opens the sell and buy guides inside the chat, with a link to the post', () => {
    const sell = CHAT_CATEGORIES.find((item) => item.id === 'sell')?.items.find((item) => item.id === 'sell-guide');
    const buy = CHAT_CATEGORIES.find((item) => item.id === 'buy')?.items.find((item) => item.id === 'buy-guide');
    if (sell?.card.type !== 'a2ui' || buy?.card.type !== 'a2ui') throw new Error('guide');
    expect(sell.card.components.some((component) => component.href === '/blog/איך-מוכרים-דירה')).toBe(true);
    expect(buy.card.components.some((component) => component.text === 'איך קונים ומחפשים דירה')).toBe(true);
    expect(sell.card.components.some((component) => component.component === 'List')).toBe(true);
  });
});

describe('chat transcript', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is still there after the page is opened again', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });

    rememberTranscript(
      [{ role: 'assistant', content: 'הנה הטווח.', cards: [], needsSignIn: false, fresh: true }],
      'end-user',
    );

    expect(storedTranscript('end-user')).toEqual([
      { role: 'assistant', content: 'הנה הטווח.', cards: [], needsSignIn: false, fresh: false },
    ]);
    expect(shownTranscript(storedTranscript('end-user'), [])).toHaveLength(1);
    forgetTranscript('end-user');
    expect(storedTranscript('end-user')).toEqual([]);
  });

  it('keeps the open chat when the server copy has not arrived', () => {
    const open = [{ role: 'user' as const, content: 'חולון', cards: [], needsSignIn: false }];
    expect(shownTranscript(open, [])).toEqual(open);
  });
});

describe('assistant open on load', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function windowWith(widthQueryMatches: boolean, stored: string | null) {
    const store = new Map<string, string>();
    if (stored !== null) store.set('nadlan:assistant:open:end-user', stored);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
      matchMedia: (query: string) => ({ matches: query.includes('max-width') ? widthQueryMatches : false }),
    });
  }

  it('stays closed on a phone even when the chat was left open', () => {
    windowWith(true, '1');
    expect(assistantOpensOnLoad('end-user')).toBe(false);
  });

  it('comes back open on a wider screen when the chat was left open', () => {
    windowWith(false, '1');
    expect(assistantOpensOnLoad('end-user')).toBe(true);
  });

  it('stays closed on a wider screen when the chat was closed', () => {
    windowWith(false, '0');
    rememberAssistantOpen(false, 'end-user');
    expect(assistantOpensOnLoad('end-user')).toBe(false);
  });
});

describe('typeStep', () => {
  it('reveals a short answer a few characters at a time', () => {
    expect(typeStep(40)).toBe(3);
  });

  it('moves faster once a long answer is waiting', () => {
    expect(typeStep(200)).toBe(5);
    expect(typeStep(800)).toBe(8);
  });
});

describe('stickAfterScroll', () => {
  it('follows again once the reader is back at the bottom', () => {
    expect(stickAfterScroll(100, 200, 100, false)).toBe(true);
  });

  it('lets go once the reader has moved up', () => {
    expect(stickAfterScroll(0, 400, 100, true)).toBe(false);
  });

  it('does not grab a reader back during the first pixels of a scroll', () => {
    expect(stickAfterScroll(90, 200, 100, false)).toBe(false);
  });
});
