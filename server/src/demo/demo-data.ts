/**
 * The shape of a demo agency, as data rather than as code.
 *
 * Separate from the service that writes it so the two concerns stay apart: what a
 * plausible agency looks like is a question about estate agency, and inserting rows in
 * dependency order is a question about Prisma. Changing the first should not mean
 * reading the second.
 *
 * Everything here is chosen to exercise the product rather than to look full. The
 * briefs are deliberately uneven — one precise, one that names only a city, one with no
 * brief at all — because that is the spread an agency really has, and it is what tells
 * you whether the radar's scoring and its caps behave.
 */

export interface DemoCustomer {
  name: string;
  phone: string;
  email?: string;
  kind: 'buyer' | 'seller' | 'both';
  notes?: string;
  lookingSection?: 'forsale' | 'rent' | 'commercial';
  lookingCities?: string[];
  lookingTypes?: string[];
  minRooms?: number;
  maxRooms?: number;
  minPrice?: number;
  maxPrice?: number;
  minSquareMeter?: number;
}

export interface DemoListing {
  status: 'published' | 'draft';
  section: 'forsale' | 'rent' | 'commercial';
  city: string;
  street: string;
  houseNumber: number;
  neighborhood?: string;
  propertyType: string;
  rooms: number;
  price: number;
  squareMeter: number;
  floor?: number;
  amenities?: string[];
  description?: string;
  /** For the "nobody is asking about it" rule, which needs an audience and no leads. */
  viewCount?: number;
  /** Days ago. The same rule needs a listing that has had time to fail. */
  publishedDaysAgo?: number;
  /** Index into `CUSTOMERS` — whose property it is, so a viewing can be put to them. */
  sellerIndex?: number;
}

export interface DemoLead {
  name: string;
  phone: string;
  email?: string;
  message: string;
  status: 'new' | 'contacted' | 'viewing' | 'offer' | 'won' | 'lost';
  /** Days since anybody touched it, which is what the stale-lead rule reads. */
  quietDays: number;
  /**
   * Days ago it arrived. Spread out on purpose: every lead created today draws a
   * chart with one bar, which demonstrates nothing about a chart of twelve weeks.
   */
  agedDays?: number;
  /** Index into `LISTINGS`, when the enquiry came in on one. */
  listingIndex?: number;
}

export interface DemoMeeting {
  title: string;
  /** Negative is in the past. Fractions are hours, so -0.5 is half an hour ago. */
  inDays: number;
  durationMinutes: number;
  customerIndex: number;
  listingIndex?: number;
  /** Whether the buyer was asked, and what they said. */
  asked?: boolean;
  attendeeResponse?: 'pending' | 'confirmed' | 'declined';
  sellerAsked?: boolean;
  sellerResponse?: 'pending' | 'confirmed' | 'declined';
  /** A past viewing somebody already wrote up, so the calendar is not all chores. */
  outcome?: 'interested' | 'thinking' | 'not_interested' | 'no_show';
  feedbackNotes?: string;
}

export const CUSTOMERS: DemoCustomer[] = [
  {
    name: 'אבי כהן',
    phone: '052-3334444',
    email: 'avi.cohen@example.test',
    kind: 'buyer',
    notes: 'עובד בתל אביב, מחפש קרוב לרכבת. גמיש בכניסה.',
    lookingSection: 'forsale',
    lookingCities: ['חולון', 'בת ים'],
    lookingTypes: ['דירה'],
    minRooms: 3.5,
    maxRooms: 4.5,
    maxPrice: 2_400_000,
    minSquareMeter: 85,
  },
  {
    name: 'מירב לוי',
    phone: '054-1112222',
    email: 'merav@example.test',
    kind: 'buyer',
    // The vague brief, on purpose: it matches almost everything and is what the
    // per-customer cap exists to contain.
    notes: 'בתחילת הדרך, עדיין לא יודעת בדיוק מה היא רוצה.',
    lookingCities: ['חולון'],
  },
  {
    name: 'רונית בן דוד',
    phone: '052-7778888',
    email: 'ronit.bd@example.test',
    kind: 'seller',
    notes: 'מוכרת את הדירה בסוקולוב. עובדת עד 17:00, ביקורים אחרי.',
  },
  {
    name: 'יוסי מזרחי',
    phone: '050-9090909',
    kind: 'both',
    notes: 'מוכר בבת ים וקונה בראשון. צריך שהעסקאות יסתדרו באותו חודש.',
    lookingSection: 'forsale',
    lookingCities: ['ראשון לציון'],
    lookingTypes: ['דירה', 'פנטהאוז'],
    minRooms: 4,
    minPrice: 2_000_000,
    maxPrice: 3_200_000,
  },
  {
    name: 'דנה שפירא',
    phone: '053-4545454',
    email: 'dana.s@example.test',
    kind: 'buyer',
    notes: 'זוג צעיר, תקציב מוגבל, מוכנים לשיפוץ.',
    lookingSection: 'forsale',
    lookingCities: ['בת ים'],
    maxPrice: 1_900_000,
    minRooms: 3,
  },
  {
    name: 'אלון גרינברג',
    phone: '058-2323232',
    kind: 'buyer',
    notes: 'משקיע. מחפש תשואה, לא גר בנכס.',
    lookingSection: 'forsale',
    lookingCities: ['חולון', 'בת ים', 'ראשון לציון'],
    maxPrice: 1_700_000,
  },
  {
    name: 'שירה אדרי',
    phone: '052-6767676',
    email: 'shira@example.test',
    kind: 'buyer',
    notes: 'משפחה עם שלושה ילדים, חייבת 5 חדרים ומעלית.',
    lookingSection: 'forsale',
    lookingCities: ['ראשון לציון'],
    minRooms: 5,
    minSquareMeter: 110,
    maxPrice: 3_500_000,
  },
  {
    name: 'עומר פרץ',
    phone: '054-8989898',
    kind: 'buyer',
    // No brief at all: the radar should say nothing about this one, which is the
    // thing the empty-brief rule guards.
    notes: 'השאיר הודעה, עוד לא דיברנו על מה הוא מחפש.',
  },
];

export const LISTINGS: DemoListing[] = [
  {
    status: 'published',
    section: 'forsale',
    city: 'חולון',
    street: 'סוקולוב',
    houseNumber: 15,
    neighborhood: 'קרית שרת',
    propertyType: 'דירה',
    rooms: 4,
    price: 2_150_000,
    squareMeter: 96,
    floor: 3,
    amenities: ['מעלית', 'מרפסת', 'ממ"ד'],
    description: 'דירה מרווחת במיקום שקט, קרובה לפארק ולבתי ספר. מתאימה למשפחה.',
    sellerIndex: 2,
  },
  {
    status: 'published',
    section: 'forsale',
    city: 'חולון',
    street: 'הרצל',
    houseNumber: 88,
    propertyType: 'דירה',
    rooms: 3,
    price: 1_680_000,
    squareMeter: 72,
    floor: 1,
    amenities: ['מרפסת'],
    description: 'דירת 3 חדרים במרכז, דורשת שיפוץ. מחיר מתאים למשקיעים.',
  },
  {
    status: 'published',
    section: 'forsale',
    city: 'בת ים',
    street: 'בלפור',
    houseNumber: 7,
    propertyType: 'דירה',
    rooms: 3,
    price: 1_750_000,
    squareMeter: 70,
    floor: 2,
    description: 'קרובה לים, בניין מטופח.',
    // Looked at by plenty of people and asked about by none, which is the shape the
    // "nobody is asking" rule is meant to catch — so nothing in LEADS may point here.
    viewCount: 64,
    publishedDaysAgo: 34,
  },
  {
    status: 'published',
    section: 'forsale',
    city: 'בת ים',
    street: 'יוספטל',
    houseNumber: 22,
    propertyType: 'דירה',
    rooms: 4,
    price: 2_050_000,
    squareMeter: 88,
    floor: 5,
    amenities: ['מעלית', 'חניה'],
    description: 'נוף לים מהסלון, קומה גבוהה.',
    sellerIndex: 3,
  },
  {
    status: 'published',
    section: 'forsale',
    city: 'ראשון לציון',
    street: 'רוטשילד',
    houseNumber: 40,
    propertyType: 'דירה',
    rooms: 5,
    price: 3_100_000,
    squareMeter: 125,
    floor: 4,
    amenities: ['מעלית', 'חניה', 'ממ"ד', 'מרפסת'],
    description: 'חמישה חדרים בשכונה מבוקשת, כניסה גמישה.',
  },
  {
    status: 'published',
    section: 'forsale',
    city: 'ראשון לציון',
    street: 'הנשיא',
    houseNumber: 12,
    propertyType: 'פנטהאוז',
    rooms: 5,
    price: 4_200_000,
    squareMeter: 150,
    floor: 9,
    amenities: ['מעלית', 'חניה', 'מרפסת', 'מיזוג'],
    description: 'פנטהאוז עם מרפסת גג, נוף פתוח.',
  },
  {
    status: 'published',
    section: 'rent',
    city: 'חולון',
    street: 'ויצמן',
    houseNumber: 3,
    propertyType: 'דירה',
    rooms: 2.5,
    price: 5_200,
    squareMeter: 55,
    floor: 2,
    description: 'להשכרה, מרוהטת חלקית.',
  },
  {
    // A draft, so "my listings" is not uniformly published and the status filter has
    // something to do.
    status: 'draft',
    section: 'forsale',
    city: 'חולון',
    street: 'אילת',
    houseNumber: 31,
    propertyType: 'דירה',
    rooms: 4,
    price: 2_290_000,
    squareMeter: 92,
    floor: 6,
    amenities: ['מעלית', 'חניה'],
    description: 'עוד לא פורסם — ממתין לתמונות.',
  },
];

export const LEADS: DemoLead[] = [
  {
    name: 'נועה שחר',
    phone: '053-7778888',
    email: 'noa.s@example.test',
    message: 'ראיתי את הדירה בסוקולוב, אפשר לתאם ביקור?',
    status: 'new',
    quietDays: 6,
    agedDays: 6,
    listingIndex: 0,
  },
  {
    name: 'איתי רוזן',
    phone: '052-1010101',
    message: 'מה הארנונה בבניין?',
    status: 'contacted',
    quietDays: 9,
    agedDays: 16,
    // Not listing 2: that one is the "plenty of views and not one enquiry" case, and a
    // lead attached to it makes the rule it exists to demonstrate never fire.
    listingIndex: 1,
  },
  {
    name: 'הילה נחום',
    phone: '054-3131313',
    email: 'hila@example.test',
    message: 'מעוניינת בפרטים על הפנטהאוז.',
    status: 'new',
    quietDays: 0,
    agedDays: 1,
    listingIndex: 5,
  },
  {
    name: 'גיא אלמוג',
    phone: '050-5151515',
    message: 'האם המחיר גמיש?',
    status: 'viewing',
    quietDays: 2,
    agedDays: 30,
    listingIndex: 4,
  },
  {
    name: 'תמר ביטון',
    phone: '058-6262626',
    message: 'חיפשתי משהו להשקעה באזור.',
    status: 'lost',
    quietDays: 21,
    agedDays: 54,
  },
];

export const MEETINGS: DemoMeeting[] = [
  {
    // Tomorrow, nobody has answered: the viewing the radar should be shouting about.
    title: 'ביקור בסוקולוב 15',
    inDays: 1,
    durationMinutes: 45,
    customerIndex: 0,
    listingIndex: 0,
    asked: true,
    attendeeResponse: 'pending',
    sellerAsked: true,
    sellerResponse: 'pending',
  },
  {
    title: 'ביקור ביוספטל 22',
    inDays: 2,
    durationMinutes: 45,
    customerIndex: 4,
    listingIndex: 3,
    asked: true,
    attendeeResponse: 'confirmed',
    sellerAsked: true,
    sellerResponse: 'confirmed',
  },
  {
    title: 'ביקור ברוטשילד 40',
    inDays: 3,
    durationMinutes: 60,
    customerIndex: 6,
    listingIndex: 4,
    asked: true,
    attendeeResponse: 'declined',
  },
  {
    // Yesterday, written up: the calendar should not be only unfinished business.
    title: 'ביקור בבלפור 7',
    inDays: -1,
    durationMinutes: 45,
    customerIndex: 4,
    listingIndex: 2,
    asked: true,
    attendeeResponse: 'confirmed',
    outcome: 'thinking',
    feedbackNotes: 'אהבו את המיקום, חוששים מהרעש מהכביש. ביקשו לראות עוד משהו באזור.',
  },
  {
    // Last week, never written up: what the "awaiting a summary" list is for.
    title: 'ביקור בהרצל 88',
    inDays: -6,
    durationMinutes: 30,
    customerIndex: 5,
    listingIndex: 1,
    asked: true,
    attendeeResponse: 'confirmed',
  },
  {
    title: 'פגישת ייעוץ במשרד',
    inDays: 4,
    durationMinutes: 60,
    customerIndex: 3,
  },
];

/**
 * The co-brokerage requests the seed makes, in both directions.
 *
 * Both, because the two sides of this feature look nothing alike and an agency that
 * only ever sees one of them has seen half the product. The one we send carries our
 * customer's name; the one we receive carries a brief and a stranger's agency, and the
 * difference on screen is the point.
 *
 * `customerIndex` is into `CUSTOMERS`, and the listing is chosen at seed time from
 * whatever the other agency actually has — a fixture cannot know another agency's
 * inventory, so it says what kind of thing to look for instead.
 */
export interface DemoCoBrokerage {
  /** `out` is us asking them; `in` is them asking us. */
  direction: 'out' | 'in';
  /** Ours, for an outgoing request. Ignored for an incoming one. */
  customerIndex: number;
  /** Ours, for an incoming request — the property they want to bring a buyer to. */
  listingIndex?: number;
  message: string;
  commissionSplit: number;
  status: 'pending' | 'accepted' | 'declined';
  /** Where an accepted deal has got to. Ignored unless the status is `accepted`. */
  stage?: 'agreed' | 'viewing' | 'negotiating' | 'signed' | 'completed' | 'fell_through';
  /**
   * The conversation that followed. `mine` is the agency being seeded, whichever side
   * of this request it is on — a thread with only one voice in it demonstrates nothing.
   */
  thread?: { from: 'mine' | 'theirs'; body: string }[];
}

export const CO_BROKERAGE: DemoCoBrokerage[] = [
  {
    direction: 'out',
    customerIndex: 0,
    message: 'הלקוח שלי ראה כבר שלושה נכסים באזור, רציני ומוכן לסגור החודש.',
    commissionSplit: 50,
    status: 'pending',
  },
  {
    direction: 'out',
    customerIndex: 6,
    message: 'משפחה שמחפשת חמישה חדרים כבר חצי שנה. אם זה עדיין פנוי נשמח להביא אותם.',
    commissionSplit: 50,
    status: 'accepted',
    stage: 'viewing',
    thread: [
      { from: 'theirs', body: 'בשמחה. הדירה פנויה, אפשר להביא אותם ביום רביעי אחרי 16:00.' },
      { from: 'mine', body: 'מעולה. קבעתי איתם לרביעי ב-17:00, אני מגיע איתם.' },
      { from: 'theirs', body: 'רשום. בעל הנכס יהיה שם, הקוד לשער 1234.' },
    ],
  },
  {
    // One that came to nothing, because the history is half the point of keeping these.
    direction: 'out',
    customerIndex: 4,
    message: 'יש לי זוג צעיר שמחפש בדיוק באזור. אפשר להביא אותם?',
    commissionSplit: 50,
    status: 'accepted',
    stage: 'fell_through',
    thread: [
      { from: 'theirs', body: 'כן, אבל יש כבר הצעה על השולחן. כדאי שתמהרו.' },
      { from: 'mine', body: 'הם ראו ולא התלהבו מהקומה. ממשיכים לחפש, תודה על הזמינות.' },
    ],
  },
  {
    direction: 'in',
    customerIndex: 0,
    listingIndex: 4,
    message: 'יש לי קונה שמחפש חמישה חדרים באזור כבר חודשיים.',
    commissionSplit: 50,
    status: 'declined',
  },
  {
    direction: 'in',
    customerIndex: 0,
    listingIndex: 0,
    message: 'יש לי זוג שמחפש בדיוק באזור הזה. אפשר לתאם ביקור השבוע?',
    commissionSplit: 50,
    status: 'pending',
  },
  {
    direction: 'in',
    customerIndex: 0,
    listingIndex: 3,
    message: 'הקונה שלי אוהב את הקומה הגבוהה. נשמח לשתף פעולה.',
    commissionSplit: 40,
    status: 'pending',
  },
];

/** A deal on the board, and where it is. */
export interface DemoDeal {
  title: string;
  stage: 'qualified' | 'negotiation' | 'under_contract' | 'closed_won' | 'closed_lost';
  price: number;
  commission: number;
  customerIndex: number;
  listingIndex?: number;
  /** For a closed one: how many months ago, so the chart has a shape. */
  closedMonthsAgo?: number;
  notes?: string;
}

/**
 * A board with something on it at every stage, and a history behind it.
 *
 * The closed ones are spread over the last few months on purpose: a pipeline chart
 * drawn from deals that all closed this week is a single bar, and tells nobody whether
 * the agency is doing better or worse than it was.
 */
export const DEALS: DemoDeal[] = [
  {
    title: 'אבי כהן — סוקולוב 15',
    stage: 'under_contract',
    price: 2_150_000,
    commission: 43_000,
    customerIndex: 0,
    listingIndex: 0,
    notes: 'חתימה מתוכננת לסוף החודש, עורך הדין בודק את הטאבו.',
  },
  {
    title: 'שירה אדרי — רוטשילד 40',
    stage: 'negotiation',
    price: 3_050_000,
    commission: 61_000,
    customerIndex: 6,
    listingIndex: 4,
    notes: 'פער של 50 אלף. המוכר מוכן לרדת אם הכניסה תידחה לאפריל.',
  },
  {
    title: 'דנה שפירא — בלפור 7',
    stage: 'qualified',
    price: 1_750_000,
    commission: 35_000,
    customerIndex: 4,
    listingIndex: 2,
  },
  {
    title: 'יוסי מזרחי — יוספטל 22',
    stage: 'closed_won',
    price: 2_050_000,
    commission: 41_000,
    customerIndex: 3,
    listingIndex: 3,
    closedMonthsAgo: 1,
  },
  {
    title: 'אלון גרינברג — הרצל 88',
    stage: 'closed_won',
    price: 1_680_000,
    commission: 33_600,
    customerIndex: 5,
    listingIndex: 1,
    closedMonthsAgo: 2,
  },
  {
    title: 'מירב לוי — ויצמן 3',
    stage: 'closed_lost',
    price: 1_900_000,
    commission: 0,
    customerIndex: 1,
    closedMonthsAgo: 2,
    notes: 'קנתה דרך סוכנות אחרת.',
  },
  {
    title: 'עומר פרץ — חיפוש פתוח',
    stage: 'closed_lost',
    price: 0,
    commission: 0,
    customerIndex: 7,
    closedMonthsAgo: 4,
    notes: 'הפסיק לחפש.',
  },
];
