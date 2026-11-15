/**
 * A mortgage office with something on every screen, as data rather than as code.
 *
 * The real-estate fixture (`demo-data.ts`) is listings, viewings and a pipeline of
 * property deals. A mortgage brokerage has none of those: its board is files, its
 * tender is bank offers, and the people it actually calls are loan officers. Seeding
 * the other fixture into this office would fill screens the office does not have.
 *
 * Spread on purpose. One precise intake and one that is only a name, files in every
 * stage, a tender with three offers beside a file that has none, and closings scattered
 * across the last half year — a chart drawn from one month demonstrates nothing.
 */

export interface MortgageDemoCustomer {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}

export interface MortgageDemoLead {
  name: string;
  phone: string;
  email?: string;
  message: string;
  status: 'new' | 'contacted' | 'won' | 'lost';
  /** What the inbox chip says. A form from the site is `web`; a call somebody typed in is `manual`. */
  source?: 'web' | 'manual';
  /** Days since anybody touched it. */
  quietDays: number;
  /** Days ago it arrived, so the overview's weekly chart is not a single bar. */
  agedDays?: number;
  /** Left unassigned, which is where a web enquiry sits until somebody picks it up. */
  unassigned?: boolean;
}

export interface MortgageDemoOffer {
  bankName: string;
  track?: string;
  /** Per cent, e.g. 4.55 for 4.55%. */
  interestRate?: number;
  monthlyPayment?: number;
  receivedDaysAgo?: number;
  notes?: string;
}

export type MortgageDemoStage =
  | 'new_request'
  | 'consultation'
  | 'documents'
  | 'sent_to_banks'
  | 'approved_in_principle'
  | 'signed'
  | 'lost';

export interface MortgageDemoCase {
  stage: MortgageDemoStage;
  /** Index into `MORTGAGE_CUSTOMERS`. Absent when the file is still only an enquiry. */
  customerIndex?: number;
  /** Index into `MORTGAGE_LEADS`, when the file started as one. */
  leadIndex?: number;
  requestedAmount?: number;
  propertyValue?: number;
  equityAvailable?: number;
  monthlyIncomePrimary?: number;
  monthlyIncomeSecondary?: number;
  employmentType?: string;
  propertyCity?: string;
  loanTermYears?: number;
  riskPreference?: string;
  notes?: string;
  offers?: MortgageDemoOffer[];
  /**
   * Signed files become a `Deal`, which is what the commission dashboard reads.
   * Months ago it closed; 0 is this month. The fee is the shekel amount an advisor
   * writes onto the deal after signing — the case itself does not carry one.
   */
  closedMonthsAgo?: number;
  commission?: number;
  /** In the archive rather than on the board. The linked deal, if any, stays. */
  archived?: boolean;
}

export interface MortgageDemoMeeting {
  title: string;
  /** Negative is in the past. Fractions are fractions of a day. */
  inDays: number;
  durationMinutes: number;
  customerIndex: number;
  outcome?: 'interested' | 'thinking' | 'not_interested' | 'no_show';
  feedbackNotes?: string;
}

export interface MortgageDemoBanker {
  bankName: string;
  branch?: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  archived?: boolean;
}

export const MORTGAGE_CUSTOMERS: MortgageDemoCustomer[] = [
  {
    name: 'נועה אברהם',
    phone: '052-4112200',
    email: 'noa.avraham@example.test',
    notes: 'דירה ראשונה בתל אביב. זוג, שני שכירים, רוצים כמה שפחות פריים.',
  },
  {
    name: 'עידו פרץ',
    phone: '054-8801122',
    email: 'ido.peretz@example.test',
    notes: 'עצמאי, רוכש להשקעה ברמת גן. מוכן למסלול משתנה אם ההחזר יורד.',
  },
  {
    name: 'גיא חדד',
    phone: '050-3344556',
    email: 'guy.hadad@example.test',
    notes:
      'זוג צעיר בבת ים. חסרים תלושים ודפי עו״ש — בלי זה אין מה לשלוח לבנק.',
  },
  {
    name: 'מאיה רוזן',
    phone: '053-6677889',
    email: 'maya.rozen@example.test',
    notes: 'יש אישור עקרוני. צריכים לבחור מסלול עד סוף השבוע לפני שההצעה פגה.',
  },
  {
    name: 'תומר ביטון',
    phone: '052-9090111',
    email: 'tomer.biton@example.test',
    notes: 'נחתם החודש בלאומי. שכר הטרחה שולם.',
  },
  {
    name: 'הילה נחום',
    phone: '058-1213141',
    email: 'hila.nahum@example.test',
    notes: 'אחוז המימון יצא גבוה מדי. הבנק סירב, היא החליטה לחכות.',
  },
  {
    name: 'אורי דהן',
    phone: '054-2324252',
    notes: 'התקשר אתמול. דירה מקבלן בחיפה, עוד לא נפגשנו.',
  },
  {
    name: 'יעל אזולאי',
    phone: '052-6162636',
    email: 'yael.azulay@example.test',
    notes: 'נסגר בחודש שעבר. מחזור בגבעתיים.',
  },
  {
    name: 'ניר אלקיים',
    phone: '050-7172737',
    email: 'nir.elkayam@example.test',
    notes: 'דירה בירושלים. נחתם לפני חודשיים.',
  },
  {
    name: 'רותם פרידמן',
    phone: '053-8182838',
    notes: 'מחזור משכנתא קיימת בחולון, בלי רכישה חדשה.',
  },
  {
    name: 'עמית סגל',
    phone: '054-9192030',
    email: 'amit.segal@example.test',
    notes: 'רכישה בחיפה. נחתם לפני ארבעה חודשים.',
  },
  {
    name: 'לירון ברק',
    phone: '052-1011121',
    email: 'liron.barak@example.test',
    notes: 'כפר סבא. התיק הישן ביותר שעוד שמור בארכיון.',
  },
];

export const MORTGAGE_LEADS: MortgageDemoLead[] = [
  {
    name: 'דניאל אוחנה',
    phone: '050-4041424',
    email: 'daniel.ohana@example.test',
    message:
      'מחפש משכנתא לדירה בנתניה, בערך מיליון ומאה. אפשר לחזור אליי אחרי שש.',
    status: 'new',
    source: 'web',
    quietDays: 1,
    agedDays: 1,
    unassigned: true,
  },
  {
    name: 'ליאור ממן',
    phone: '052-5051525',
    message: 'ראיתי את המחשבון באתר. רוצה לדבר לפני שאני חותם על זיכרון דברים.',
    status: 'new',
    source: 'web',
    quietDays: 0,
    agedDays: 0,
    unassigned: true,
  },
  {
    name: 'הדר שלום',
    phone: '054-6061626',
    email: 'hadar.shalom@example.test',
    message: 'דיברתם איתי בשבוע שעבר לגבי מחזור. עדיין לא שלחתי תלושים.',
    status: 'contacted',
    quietDays: 4,
    agedDays: 12,
  },
  {
    name: 'עדי נבון',
    phone: '053-7071727',
    message: 'שאלה כללית על הון עצמי. לא חזרנו אליה.',
    status: 'new',
    quietDays: 20,
    agedDays: 28,
  },
  {
    name: 'יונתן פריד',
    phone: '058-8081828',
    email: 'yonatan.fried@example.test',
    message: 'משקיע, שתי דירות. ביקש הצעה ואז נעלם.',
    status: 'contacted',
    quietDays: 30,
    agedDays: 45,
  },
  {
    name: 'מיכל דנון',
    phone: '050-9091929',
    message: 'פנייה ישנה מהאתר. אף אחד לא נגע בה כבר חודשיים.',
    status: 'new',
    source: 'web',
    quietDays: 60,
    agedDays: 75,
    unassigned: true,
  },
  {
    name: 'נועה אברהם',
    phone: '052-4112200',
    email: 'noa.avraham@example.test',
    message: 'השארתי פרטים אחרי שחישבתי החזר. קבענו פגישה.',
    status: 'won',
    source: 'web',
    quietDays: 1,
    agedDays: 14,
  },
  {
    name: 'הילה נחום',
    phone: '058-1213141',
    email: 'hila.nahum@example.test',
    message: 'רוצה משכנתא לדירה בבאר שבע. ההון העצמי נמוך.',
    status: 'lost',
    quietDays: 8,
    agedDays: 20,
  },
];

export const MORTGAGE_CASES: MortgageDemoCase[] = [
  {
    stage: 'new_request',
    customerIndex: 6,
    requestedAmount: 750_000,
    propertyValue: 1_150_000,
    equityAvailable: 400_000,
    monthlyIncomePrimary: 12_000,
    employmentType: 'שכיר',
    propertyCity: 'חיפה',
    loanTermYears: 25,
    riskPreference: 'שמרני',
    notes: 'שיחה ראשונה בלבד. דירה מקבלן, מסירה בעוד שנה.',
  },
  {
    stage: 'new_request',
    leadIndex: 0,
    requestedAmount: 1_100_000,
    propertyCity: 'נתניה',
    notes: 'טופס מהאתר. עוד אין תיק לקוח — רק הפנייה.',
  },
  {
    stage: 'consultation',
    customerIndex: 0,
    leadIndex: 6,
    requestedAmount: 2_200_000,
    propertyValue: 3_400_000,
    equityAvailable: 1_200_000,
    monthlyIncomePrimary: 22_000,
    monthlyIncomeSecondary: 16_000,
    employmentType: 'שכיר',
    propertyCity: 'תל אביב -יפו',
    loanTermYears: 30,
    riskPreference: 'מאוזן',
    notes: 'פגישת ייעוץ היום. שני שכירים, דירה ראשונה, מעדיפים קבועה לא צמודה.',
  },
  {
    stage: 'documents',
    customerIndex: 2,
    requestedAmount: 1_350_000,
    propertyValue: 1_900_000,
    equityAvailable: 550_000,
    monthlyIncomePrimary: 15_000,
    monthlyIncomeSecondary: 9_000,
    employmentType: 'שכיר',
    propertyCity: 'בת ים',
    loanTermYears: 25,
    riskPreference: 'שמרני',
    notes: 'חסרים שלושה תלושי שכר ודפי עו״ש של חצי שנה. בלי זה אי אפשר לשלוח.',
  },
  {
    stage: 'sent_to_banks',
    customerIndex: 1,
    requestedAmount: 1_800_000,
    propertyValue: 2_600_000,
    equityAvailable: 800_000,
    monthlyIncomePrimary: 32_000,
    employmentType: 'עצמאי',
    propertyCity: 'רמת גן',
    loanTermYears: 20,
    riskPreference: 'מוכן לסיכון',
    notes: 'יצא למכרז. מחכים להצעה נוספת ממזרחי טפחות.',
    offers: [
      {
        bankName: 'בנק הפועלים',
        track: 'פריים',
        interestRate: 5.9,
        monthlyPayment: 12_800,
        receivedDaysAgo: 2,
        notes: 'גמיש לפירעון מוקדם, יקר יותר.',
      },
      {
        bankName: 'בנק לאומי',
        track: 'קבועה לא צמודה',
        interestRate: 4.85,
        monthlyPayment: 11_750,
        receivedDaysAgo: 2,
      },
      {
        bankName: 'בנק דיסקונט',
        track: 'משתנה כל 5 שנים',
        interestRate: 4.6,
        monthlyPayment: 11_420,
        receivedDaysAgo: 1,
        notes: 'ההחזר הנמוך ביותר. הריבית זזה בעוד חמש שנים.',
      },
    ],
  },
  {
    stage: 'approved_in_principle',
    customerIndex: 3,
    requestedAmount: 1_450_000,
    propertyValue: 2_100_000,
    equityAvailable: 650_000,
    monthlyIncomePrimary: 18_000,
    monthlyIncomeSecondary: 14_000,
    employmentType: 'שכיר',
    propertyCity: 'הרצליה',
    loanTermYears: 25,
    riskPreference: 'מאוזן',
    notes: 'אושר עקרונית בלאומי. ההצעה של דיסקונט בתוקף עד יום חמישי.',
    offers: [
      {
        bankName: 'בנק לאומי',
        track: 'קבועה לא צמודה',
        interestRate: 4.7,
        monthlyPayment: 8_200,
        receivedDaysAgo: 5,
        notes: 'האישור העקרוני. זה המסלול שהלקוחה נוטה אליו.',
      },
      {
        bankName: 'בנק הפועלים',
        track: 'פריים',
        interestRate: 5.75,
        monthlyPayment: 9_100,
        receivedDaysAgo: 4,
        notes: 'יקרה יותר, אבל אפשר לפרוע בלי קנס.',
      },
    ],
  },
  {
    stage: 'signed',
    customerIndex: 4,
    requestedAmount: 980_000,
    propertyValue: 1_650_000,
    equityAvailable: 670_000,
    monthlyIncomePrimary: 19_000,
    employmentType: 'שכיר',
    propertyCity: 'ראשון לציון',
    loanTermYears: 30,
    riskPreference: 'שמרני',
    notes: 'נחתם החודש. שכר הטרחה שולם בהעברה.',
    closedMonthsAgo: 0,
    commission: 12_000,
    offers: [
      {
        bankName: 'בנק לאומי',
        track: 'קבועה לא צמודה',
        interestRate: 4.55,
        monthlyPayment: 5_400,
        receivedDaysAgo: 12,
        notes: 'ההצעה שנבחרה.',
      },
    ],
  },
  {
    stage: 'lost',
    customerIndex: 5,
    leadIndex: 7,
    requestedAmount: 1_600_000,
    propertyValue: 1_850_000,
    equityAvailable: 250_000,
    monthlyIncomePrimary: 11_000,
    employmentType: 'שכיר',
    propertyCity: 'באר שבע',
    loanTermYears: 30,
    riskPreference: 'שמרני',
    notes: 'הבנק סירב בגלל אחוז המימון. הלקוחה לא ממשיכה.',
    offers: [
      {
        bankName: 'בנק הפועלים',
        track: 'פריים',
        interestRate: 6.4,
        monthlyPayment: 10_600,
        receivedDaysAgo: 9,
        notes: 'נדחתה אחרי בדיקה.',
      },
    ],
  },
  // Closed files, off the board. The deals stay, so the half-year chart has a bar
  // in every month rather than only the one that closed this week.
  {
    stage: 'signed',
    customerIndex: 7,
    archived: true,
    requestedAmount: 620_000,
    propertyValue: 1_400_000,
    equityAvailable: 780_000,
    monthlyIncomePrimary: 17_000,
    employmentType: 'שכיר',
    propertyCity: 'גבעתיים',
    loanTermYears: 15,
    riskPreference: 'שמרני',
    notes: 'מחזור. נחתם בחודש שעבר.',
    closedMonthsAgo: 1,
    commission: 8_500,
    offers: [
      {
        bankName: 'בנק מזרחי טפחות',
        track: 'קבועה לא צמודה',
        interestRate: 4.4,
        monthlyPayment: 4_700,
        receivedDaysAgo: 40,
      },
    ],
  },
  {
    stage: 'signed',
    customerIndex: 8,
    archived: true,
    requestedAmount: 2_400_000,
    propertyValue: 3_600_000,
    equityAvailable: 1_200_000,
    monthlyIncomePrimary: 28_000,
    monthlyIncomeSecondary: 21_000,
    employmentType: 'שכיר',
    propertyCity: 'ירושלים',
    loanTermYears: 25,
    riskPreference: 'מאוזן',
    notes: 'דירה בירושלים. שכר טרחה גבוה יותר בגלל גודל התיק.',
    closedMonthsAgo: 2,
    commission: 15_000,
  },
  {
    stage: 'signed',
    customerIndex: 9,
    archived: true,
    requestedAmount: 900_000,
    propertyValue: 1_500_000,
    equityAvailable: 600_000,
    monthlyIncomePrimary: 14_000,
    employmentType: 'גמלאי',
    propertyCity: 'חולון',
    loanTermYears: 12,
    riskPreference: 'שמרני',
    notes: 'מחזור לגמלאית. תקופה קצרה בכוונה.',
    closedMonthsAgo: 3,
    commission: 7_000,
  },
  {
    stage: 'signed',
    customerIndex: 10,
    archived: true,
    requestedAmount: 1_700_000,
    propertyValue: 2_450_000,
    equityAvailable: 750_000,
    monthlyIncomePrimary: 24_000,
    employmentType: 'עצמאי',
    propertyCity: 'חיפה',
    loanTermYears: 20,
    riskPreference: 'מוכן לסיכון',
    notes: 'עצמאי. לקח שבועיים לאסוף שומות.',
    closedMonthsAgo: 4,
    commission: 11_000,
  },
  {
    stage: 'signed',
    customerIndex: 11,
    archived: true,
    requestedAmount: 1_300_000,
    propertyValue: 2_000_000,
    equityAvailable: 700_000,
    monthlyIncomePrimary: 16_000,
    monthlyIncomeSecondary: 12_000,
    employmentType: 'שכיר',
    propertyCity: 'כפר סבא',
    loanTermYears: 25,
    riskPreference: 'מאוזן',
    notes: 'התיק הישן בארכיון. אפשר לשחזר אותו מהארכיון ולבדוק שהדיל נשאר.',
    closedMonthsAgo: 5,
    commission: 9_500,
  },
];

export const MORTGAGE_MEETINGS: MortgageDemoMeeting[] = [
  {
    title: 'פגישת ייעוץ — נועה אברהם',
    inDays: 0.05,
    durationMinutes: 60,
    customerIndex: 0,
  },
  {
    title: 'השלמת מסמכים — גיא חדד',
    inDays: 2,
    durationMinutes: 45,
    customerIndex: 2,
  },
  {
    title: 'שיחת עדכון מול הבנקים — עידו פרץ',
    inDays: -1,
    durationMinutes: 30,
    customerIndex: 1,
  },
  {
    title: 'בחירת מסלול — מאיה רוזן',
    inDays: -4,
    durationMinutes: 45,
    customerIndex: 3,
    outcome: 'thinking',
    feedbackNotes:
      'נוטה ללאומי בקבועה לא צמודה. ביקשה עוד יום להשוות מול הפועלים.',
  },
];

export const MORTGAGE_BANKERS: MortgageDemoBanker[] = [
  {
    bankName: 'בנק הפועלים',
    branch: 'הסניף הראשי, תל אביב',
    name: 'רונית אלון',
    phone: '03-5671200',
    email: 'ronit.alon@example.test',
    notes: 'מעדיפה מייל לפני טלפון. מגיבה מהר על תיקים עד שני מיליון.',
  },
  {
    bankName: 'בנק לאומי',
    branch: 'רמת אביב, תל אביב',
    name: 'אמיר חדד',
    phone: '03-6402200',
    email: 'amir.hadad@example.test',
    notes: 'איש הקשר לאישורים עקרוניים. זמין עד ארבע.',
  },
  {
    bankName: 'בנק דיסקונט',
    branch: 'דיזנגוף, תל אביב',
    name: 'יעל כהן',
    phone: '03-5203300',
    email: 'yael.cohen@example.test',
  },
  {
    bankName: 'בנק מזרחי טפחות',
    branch: 'רמת גן',
    name: 'דוד לוי',
    phone: '03-7554400',
    email: 'david.levi@example.test',
    notes: 'חזק בתיקים של עצמאים. מבקש שומה לפני שהוא נותן מספר.',
  },
  {
    bankName: 'הבנק הבינלאומי',
    branch: 'חיפה',
    name: 'ליאת ביטון',
    phone: '04-8605500',
    notes: 'עזבה את הסניף. נשמרת בארכיון כדי שאפשר יהיה לשחזר איש קשר.',
    archived: true,
  },
];
