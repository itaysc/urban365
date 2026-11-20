import { roomsLabel, type RoomsRange } from '@/components/search/roomsRange';
import type { A2UIComponent, AssistantCard } from './assistant';
import { valuationReply } from './valuation-reply';

type Model = Record<string, string | string[]>;

export interface ChatAction {
  id: string;
  label: string;
  hint: string;
  intro: string;
  card: AssistantCard;
}

export interface ChatCategory {
  id: string;
  label: string;
  items: ChatAction[];
}

function savedCard(): AssistantCard {
  return surface('saved', [
    { id: 'root', component: 'Card', child: 'body' },
    { id: 'body', component: 'Column', children: ['title', 'list'] },
    text('title', 'נכסים ששמרתי'),
    { id: 'list', component: 'SavedListings' },
  ]);
}

function surface(id: string, parts: A2UIComponent[], dataModel: Model = {}): AssistantCard {
  return { type: 'a2ui', surfaceId: id, components: parts, dataModel };
}

function text(id: string, value: string, variant: 'title' | 'body' | 'caption' = 'title'): A2UIComponent {
  return { id, component: 'Text', text: value, variant };
}

function field(id: string, label: string, placeholder: string, variant: 'shortText' | 'number' = 'shortText'): A2UIComponent {
  return { id, component: 'TextField', label, placeholder, variant, value: { '@path': `/${id}` } };
}

function choice(id: string, label: string, options: { label: string; value: string }[]): A2UIComponent {
  return { id, component: 'ChoicePicker', label, variant: 'mutuallyExclusive', options, value: { '@path': `/${id}` } };
}

function row(id: string, children: string[]): A2UIComponent {
  return { id, component: 'Row', children };
}

function roomsRange(): A2UIComponent {
  return { id: 'rooms', component: 'RoomsRange', label: 'חדרים' };
}

function button(id: string, name: string, keys: string[]): A2UIComponent {
  return {
    id,
    component: 'Button',
    child: `${id}-label`,
    action: { event: { name, context: Object.fromEntries(keys.map((key) => [key, { '@path': `/${key}` }])) } },
  };
}

function form(id: string, title: string, caption: string, fields: A2UIComponent[], submitLabel: string, action: string, keys: string[]): AssistantCard {
  const nested = new Set(fields.filter((item) => item.component === 'Row').flatMap((item) => item.children ?? []));
  const parts: A2UIComponent[] = [
    { id: 'root', component: 'Card', child: 'body' },
    {
      id: 'body',
      component: 'Column',
      children: ['title', 'caption', ...fields.filter((item) => !nested.has(item.id)).map((item) => item.id), 'submit'],
    },
    text('title', title),
    text('caption', caption, 'caption'),
    ...fields,
    button('submit', action, keys),
    text('submit-label', submitLabel),
  ];
  return surface(id, parts);
}

const yesNo = [
  { label: 'יש', value: 'yes' },
  { label: 'אין', value: 'no' },
];

function valuationCard(): AssistantCard {
  const fields: A2UIComponent[] = [
    row('place', ['city', 'street']),
    field('city', 'עיר', 'למשל חולון'),
    field('street', 'רחוב', 'למשל דב הוז'),
    row('size', ['rooms', 'area']),
    field('rooms', 'חדרים', '4', 'number'),
    field('area', 'שטח במ״ר', '97', 'number'),
    text('home', 'הדירה', 'caption'),
    row('floors', ['floor', 'topFloor']),
    field('floor', 'קומה', '2', 'number'),
    field('topFloor', 'מתוך קומה', '4', 'number'),
    choice('condition', 'מצב הדירה', [
      { label: 'משופצת', value: 'renovated' },
      { label: 'מצב טוב', value: 'good' },
      { label: 'סביר, שיפוץ קל', value: 'fair' },
      { label: 'דורשת שיפוץ', value: 'needs-renovation' },
    ]),
    row('extras', ['balcony', 'mamad']),
    choice('balcony', 'מרפסת', yesNo),
    choice('mamad', 'ממ״ד', yesNo),
    text('building-label', 'הבניין', 'caption'),
    choice('building', 'מצב הבניין', [
      { label: 'מטופח', value: 'well-kept' },
      { label: 'רגיל', value: 'ordinary' },
      { label: 'מוזנח', value: 'neglected' },
    ]),
    row('services', ['lift', 'parking', 'storage']),
    choice('lift', 'מעלית', yesNo),
    choice('parking', 'חניה', yesNo),
    choice('storage', 'מחסן', yesNo),
    text('around', 'הסביבה והרישום', 'caption'),
    choice('aspect', 'נוף', [
      { label: 'פתוח', value: 'open' },
      { label: 'רגיל', value: 'ordinary' },
      { label: 'חסום', value: 'blocked' },
    ]),
    choice('renewal', 'התחדשות', [
      { label: 'תמ״א מאושרת', value: 'approved' },
      { label: 'בעיצומה', value: 'in-works' },
      { label: 'אין', value: 'none' },
    ]),
    row('registry', ['gush', 'chelka']),
    field('gush', 'גוש', '6123', 'number'),
    field('chelka', 'חלקה', '45', 'number'),
  ];
  const keys = [
    'city',
    'street',
    'rooms',
    'area',
    'floor',
    'topFloor',
    'condition',
    'balcony',
    'mamad',
    'building',
    'lift',
    'parking',
    'storage',
    'aspect',
    'renewal',
    'gush',
    'chelka',
  ];
  return form('valuation', 'הערכת שווי', 'מלאו את מה שידוע. אפשר להשאיר ריק מה שאין.', fields, 'חשב טווח שווי', 'submit_valuation', keys);
}

function searchCard(): AssistantCard {
  return form(
    'search',
    'חיפוש דירות',
    'עיר, חדרים ותקציב מספיקים כדי להתחיל.',
    [
      choice('section', 'מה מחפשים', [
        { label: 'למכירה', value: 'forsale' },
        { label: 'להשכרה', value: 'rent' },
      ]),
      field('city', 'עיר או שכונה', 'למשל תל אביב'),
      roomsRange(),
      field('budget', 'עד מחיר', '3000000', 'number'),
    ],
    'חפש',
    'submit_search',
    ['section', 'city', 'roomsMin', 'roomsMax', 'budget'],
  );
}

function alertCard(): AssistantCard {
  return form(
    'alert',
    'התראה על מודעה חדשה',
    'נשמור את החיפוש ונודיע כשמתפרסמת דירה שמתאימה.',
    [
      field('city', 'עיר או שכונה', 'למשל חולון'),
      row('limits', ['rooms', 'budget']),
      field('rooms', 'חדרים', '4', 'number'),
      field('budget', 'עד מחיר', '2500000', 'number'),
    ],
    'הגדר התראה',
    'submit_alert',
    ['city', 'rooms', 'budget'],
  );
}

function listingCard(): AssistantCard {
  return form(
    'listing',
    'פרסום מודעה',
    'המודעה נשמרת קודם כטיוטה. היא עולה לאוויר אחרי תמונות ואישור.',
    [
      choice('section', 'סוג המודעה', [
        { label: 'למכירה', value: 'forsale' },
        { label: 'להשכרה', value: 'rent' },
      ]),
      row('place', ['city', 'street']),
      field('city', 'עיר', 'למשל חולון'),
      field('street', 'רחוב', 'לא חובה'),
      row('size', ['rooms', 'area']),
      field('rooms', 'חדרים', '4', 'number'),
      field('area', 'שטח במ״ר', '90', 'number'),
      field('price', 'מחיר', '1800000', 'number'),
    ],
    'שמור כטיוטה',
    'submit_listing',
    ['section', 'city', 'street', 'rooms', 'area', 'price'],
  );
}

function streetCard(): AssistantCard {
  return form(
    'street',
    'מחיר ממוצע ברחוב',
    'ממוצע העסקאות שנסגרו ברחוב, לא המחיר שמבקשים במודעות.',
    [field('city', 'עיר', 'למשל חולון'), field('street', 'רחוב', 'למשל ויצמן')],
    'הצג מחירים',
    'submit_street',
    ['city', 'street'],
  );
}

function mortgageCard(): AssistantCard {
  return form(
    'mortgage',
    'החזר חודשי',
    'מחיר, הון עצמי וסוג הרוכש. הריבית והשנים נלקחים מברירת המחדל אם לא נאמרו.',
    [
      field('price', 'מחיר הדירה', '2000000', 'number'),
      field('equity', 'הון עצמי', '500000', 'number'),
      choice('buyer', 'סוג הרוכש', [
        { label: 'דירה ראשונה', value: 'first' },
        { label: 'משפרי דיור', value: 'upgrader' },
        { label: 'להשקעה', value: 'investor' },
      ]),
    ],
    'חשב החזר',
    'submit_mortgage',
    ['price', 'equity', 'buyer'],
  );
}

function affordCard(): AssistantCard {
  return form(
    'afford',
    'איזו דירה אפשר לקנות',
    'ההחזר נעצר סביב ארבעים אחוז מההכנסה נטו. ההון קובע את הרצפה.',
    [
      field('income', 'הכנסה נטו בחודש', '20000', 'number'),
      field('equity', 'הון עצמי', '500000', 'number'),
      choice('buyer', 'סוג הרוכש', [
        { label: 'דירה ראשונה', value: 'first' },
        { label: 'משפרי דיור', value: 'upgrader' },
        { label: 'להשקעה', value: 'investor' },
      ]),
    ],
    'חשב תקציב',
    'submit_afford',
    ['income', 'equity', 'buyer'],
  );
}

function article(id: string, title: string, paragraphs: string[], points: string[], href: string, cta: string): AssistantCard {
  const paragraphIds = paragraphs.map((_, index) => `p${index}`);
  const pointIds = points.map((_, index) => `point${index}`);
  const parts: A2UIComponent[] = [
    { id: 'root', component: 'Card', child: 'body' },
    {
      id: 'body',
      component: 'Column',
      children: ['title', ...paragraphIds, ...(pointIds.length ? ['points'] : []), 'more', 'link'],
    },
    text('title', title),
    ...paragraphs.map((paragraph, index) => text(`p${index}`, paragraph, 'body')),
    { id: 'points', component: 'List', children: pointIds },
    ...points.map((point, index) => text(`point${index}`, point, 'body')),
    text('more', 'המדריך המלא באתר.', 'caption'),
    { id: 'link', component: 'Button', href, child: 'link-label' },
    text('link-label', cta),
  ];
  return surface(id, parts);
}

const SELL_ARTICLE = {
  title: 'איך מוכרים דירה',
  paragraphs: [
    'מכירה מתחילה במחיר שאפשר להגן עליו, לא במודעה. המחיר נשען על עסקאות דומות שנסגרו, לא על מה שהשכן ביקש. הערכת שווי נותנת טווח. המחיר שמפרסמים נבחר בתוכו: בשוק מהיר קרוב לראש, בשוק איטי באמצע או מתחתיו.',
    'אחר כך המודעה עצמה. קונה משווה כמה דירות באותו ערב, ומה שחסר בתמונות או בפרטים מוציא את הדירה מהרשימה הקצרה. שטח רשום, קומה מתוך כמה, מעלית, חניה, ממ״ד, מצב הדירה וארנונה הם לא קישוט. הם מה ששואלים בשיחה הראשונה.',
    'פרסום באתר נשמר קודם כטיוטה. הוא עולה לאוויר רק אחרי שיש תמונות והפרטים אושרו בדף העריכה. הערכת השווי באתר אינה שמאות מקרקעין.',
  ],
  points: [
    'קודם טווח שווי מעסקאות, ורק אחר כך מחיר למודעה.',
    'תמונות באור יום, של כל חדר, בלי פילטר שמסתיר מצב.',
    'נסח טאבו, אישור זכויות וחשבון ארנונה מוכנים לפני שמגיע קונה.',
    'מחיר מעל הטווח לא משאיר מקום למיקוח. הוא מסנן את מי שהיה בא לראות.',
  ],
};

const BUY_ARTICLE = {
  title: 'איך קונים ומחפשים דירה',
  paragraphs: [
    'חיפוש שמתחיל בלוח נגמר בדירות יפות שאי אפשר לממן. הסדר ההפוך קצר יותר. קודם ההון העצמי: לדירה ראשונה הוא צריך לכסות לפחות רבע מהמחיר, למשפרי דיור כשלושים אחוז, ולהשקעה חצי. אחר כך ההחזר החודשי, שנעצר בפועל סביב ארבעים אחוז מההכנסה נטו. הנמוך מבין השניים הוא התקציב.',
    'עם תקציב, עיר ומספר חדרים החיפוש נהיה קצר. שווה לשמור אותו כהתראה, כי מודעה טובה יורדת לפני שמספיקים לגלול. מחיר במודעה הוא מה שהמוכר מבקש, לא מה ששולם. לפני שמתאהבים, משווים לעסקאות ברחוב.',
    'החיפוש באתר מראה מה שמוצע עכשיו. הוא לא אומר שהמחיר הוגן. בשביל זה משווים לעסקאות, לא למודעה ממול.',
  ],
  points: [
    'תקציב קודם, מודעות אחר כך.',
    'עיר, חדרים ותקרת מחיר מספיקים כדי להתחיל.',
    'התראה על חיפוש שמור תופסת מודעה חדשה בלי לפתוח את הלוח כל ערב.',
    'ביקור בדירה בודק מצב, אור, רעש ומעלית. את זה אין במודעה.',
  ],
};

export const CHAT_CATEGORIES: ChatCategory[] = [
  {
    id: 'buy',
    label: 'קנייה',
    items: [
      { id: 'search', label: 'חיפוש דירות', hint: 'עיר, חדרים ותקציב', intro: 'אפשר לחפש מכאן.', card: searchCard() },
      { id: 'saved', label: 'נכסים ששמרתי', hint: 'חמישה בכל פעם', intro: 'הנה מה ששמרת.', card: savedCard() },
      { id: 'alert', label: 'התראה על מודעות', hint: 'כשמתפרסמת דירה מתאימה', intro: 'נגדיר התראה.', card: alertCard() },
      {
        id: 'buy-guide',
        label: 'איך קונים ומחפשים',
        hint: 'מדריך קצר',
        intro: 'הנה הסדר שלפני שפותחים את הלוח.',
        card: article('buy-guide', BUY_ARTICLE.title, BUY_ARTICLE.paragraphs, BUY_ARTICLE.points, '/blog/איך-קונים-דירה', 'למדריך המלא'),
      },
      {
        id: 'salary',
        label: 'איזו דירה המשכורת קונה',
        hint: 'מההכנסה לתקציב',
        intro: 'המשכורת קובעת החזר, לא מחיר דירה.',
        card: article(
          'salary',
          'איזו דירה המשכורת קונה',
          [
            'ההחזר החודשי נעצר סביב ארבעים אחוז מההכנסה נטו. מזה יוצא סכום שאפשר ללוות, וממנו מחיר דירה. ההון העצמי קובע את הרצפה השנייה: רבע לדירה ראשונה, כשלושים אחוז למשפרי דיור, חצי להשקעה.',
            'הנמוך מבין השניים הוא התקציב. דירה יפה מעליו לא נכנסת לחיפוש.',
          ],
          [],
          '/blog/איזו-דירה-המשכורת-קונה',
          'למדריך המלא',
        ),
      },
    ],
  },
  {
    id: 'sell',
    label: 'מכירה',
    items: [
      { id: 'listing', label: 'פרסום מודעה', hint: 'נשמרת קודם כטיוטה', intro: 'נפתח טיוטת מודעה.', card: listingCard() },
      { id: 'sell-value', label: 'הערכת שווי', hint: 'טווח לפני שקובעים מחיר', intro: 'כדי לתת הערכת מחיר טובה יותר, מלאו את מה שידוע.', card: valuationCard() },
      { id: 'street-sell', label: 'מחיר ממוצע ברחוב', hint: 'עסקאות שנסגרו', intro: 'נבדוק מה נסגר ברחוב.', card: streetCard() },
      {
        id: 'sell-guide',
        label: 'איך מוכרים דירה',
        hint: 'מדריך קצר',
        intro: 'הנה הסדר שלפני שמפרסמים.',
        card: article('sell-guide', SELL_ARTICLE.title, SELL_ARTICLE.paragraphs, SELL_ARTICLE.points, '/blog/איך-מוכרים-דירה', 'למדריך המלא'),
      },
    ],
  },
  {
    id: 'mortgage',
    label: 'משכנתא',
    items: [
      { id: 'payment', label: 'החזר חודשי', hint: 'מחיר, הון וסוג רוכש', intro: 'נחשב את ההחזר.', card: mortgageCard() },
      { id: 'afford', label: 'מה אפשר לקנות', hint: 'מההכנסה ומההון', intro: 'נבדוק איזה מחיר נכנס.', card: affordCard() },
      {
        id: 'equity-guide',
        label: 'כמה הון עצמי צריך',
        hint: 'לפי סוג הרוכש',
        intro: 'ההון תלוי במי שקונה.',
        card: article(
          'equity-guide',
          'כמה הון עצמי צריך לדירה',
          [
            'דירה ראשונה צריכה הון של לפחות רבע מהמחיר. משפרי דיור כשלושים אחוז, ודירה להשקעה חצי. זה הרצפה של המימון, לא ההמלצה.',
            'ההחזר החודשי נבדק בנפרד, סביב ארבעים אחוז מההכנסה נטו. אם ההון מספיק וההחזר לא, התקציב יורד.',
          ],
          [],
          '/blog/כמה-הון-עצמי-צריך-לדירה',
          'למדריך המלא',
        ),
      },
      {
        id: 'spitzer',
        label: 'מה זה לוח שפיצר',
        hint: 'איך ההחזר בנוי',
        intro: 'ההחזר החודשי לא מתחלק שווה בין קרן לריבית.',
        card: article(
          'spitzer',
          'מה זה לוח שפיצר',
          [
            'בלוח שפיצר ההחזר החודשי קבוע. בהתחלה רובו ריבית ומעט קרן, ועם השנים הקרן תופסת יותר. לכן פירעון מוקדם בשנים הראשונות מקצר פחות ממה שנדמה.',
            'ההחזר שמחשבים כאן הוא לפי הלוח הזה, במסלול קבוע לא צמוד, בלי ביטוחים ובלי עמלות.',
          ],
          [],
          '/blog/מה-זה-לוח-שפיצר',
          'למדריך המלא',
        ),
      },
    ],
  },
  {
    id: 'value',
    label: 'הערכת שווי',
    items: [
      { id: 'value', label: 'הערכת שווי לדירה', hint: 'אותו חישוב כמו בדף', intro: 'כדי לתת הערכת מחיר טובה יותר, מלאו את מה שידוע.', card: valuationCard() },
      { id: 'street', label: 'מחיר ממוצע ברחוב', hint: 'לפי עסקאות', intro: 'נבדוק מה נסגר ברחוב.', card: streetCard() },
      {
        id: 'value-guide',
        label: 'איך מעריכים שווי',
        hint: 'עסקאות, לא מודעות',
        intro: 'שווי נשען על מה ששולם.',
        card: article(
          'value-guide',
          'איך מעריכים שווי דירה',
          [
            'הטווח נבנה מעסקאות דומות שנסגרו באותו אזור, לא ממחיר המודעות שמסביב. דירה עם חניה, מרפסת או ממ״ד לא זהה לדירה בלי, וההתאמה מזיזה את המחיר באחוזים.',
            'מה שלא נאמר נשאר לא ידוע. הוא לא מעלה ולא מוריד, והטווח מתרחב. הערכה באתר אינה שמאות מקרקעין.',
          ],
          [],
          '/blog/איך-מעריכים-שווי-דירה',
          'למדריך המלא',
        ),
      },
    ],
  },
  {
    id: 'info',
    label: 'מידע',
    items: [
      {
        id: 'asking',
        label: 'מחיר מבוקש ומחיר עסקה',
        hint: 'למה הם לא אותו דבר',
        intro: 'מה שמבקשים ומה ששולם הם שני מספרים.',
        card: article(
          'asking',
          'מחיר מבוקש ומחיר עסקה',
          [
            'מחיר במודעה הוא מה שהמוכר מבקש היום. מחיר עסקה הוא מה ששולם, והוא מתפרסם באיחור של חודשים. אי אפשר לערבב אותם לתוך אותו ממוצע.',
            'הערכת שווי משתמשת בעסקאות. חיפוש דירות מראה את מה שמבקשים עכשיו.',
          ],
          [],
          '/blog/מחיר-מבוקש-ומחיר-עסקה',
          'למדריך המלא',
        ),
      },
      {
        id: 'markets',
        label: 'שוק של מוכרים ושל קונים',
        hint: 'איפה עומד המחיר בטווח',
        intro: 'הטווח לא אומר איפה לפרסם.',
        card: article(
          'markets',
          'שוק של מוכרים ושוק של קונים',
          [
            'כשיש מעט דירות והרבה קונים, מחיר המודעה נצמד לראש הטווח. כשהלוח מלא, הוא יורד לאמצע ולפעמים מתחתיו. אותו שווי, מחיר פרסום אחר.',
            'המספרים באתר לא מחליטים לבד. הם אומרים איפה העסקאות היו.',
          ],
          [],
          '/blog/שוק-של-מוכרים-ושוק-של-קונים',
          'למדריך המלא',
        ),
      },
      {
        id: 'new-build',
        label: 'קבלן מול יד שנייה',
        hint: 'מה משווים',
        intro: 'דירה מקבלן ודירה יד שנייה לא נמדדות אותו דבר.',
        card: article(
          'new-build',
          'דירה מקבלן מול יד שנייה',
          [
            'מחיר קבלן כולל לפעמים מע״מ, הצמדה ומפרט שעוד לא נבנה. מחיר יד שנייה הוא דירה שאפשר לראות. השוואה בלי להפריד ביניהם מערבבת שני שווקים.',
            'עסקאות יד שנייה הן מה שנסגר. מחיר קבלן במודעה הוא מחירון, עד שמישהו חותם.',
          ],
          [],
          '/blog/דירה-מקבלן-מול-יד-שניה',
          'למדריך המלא',
        ),
      },
    ],
  },
];

function textOf(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value.trim() : '';
}

function choiceOf(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
}

function roomsPhrase(data: Record<string, unknown>): string {
  const single = textOf(data, 'rooms');
  const minText = textOf(data, 'roomsMin');
  const maxText = textOf(data, 'roomsMax');
  if (!minText && !maxText) return single ? `${single} חדרים` : '';
  const range: RoomsRange = {
    min: minText ? Number(minText) : undefined,
    max: maxText ? Number(maxText) : undefined,
  };
  const label = roomsLabel(range);
  return label ? `${label} חדרים` : '';
}

function buyerPhrase(value: string): string {
  if (value === 'upgrader') return 'משפרי דיור';
  if (value === 'investor') return 'דירה להשקעה';
  if (value === 'first') return 'דירה ראשונה';
  return '';
}

/** Turns a submitted sheet into the sentence the agent already knows how to read. */
export function actionText(name: string, data: Record<string, unknown>): string {
  if (name === 'submit_valuation') {
    const body = valuationReply(data);
    return body ? `אני רוצה הערכת שווי לדירה. ${body}` : '';
  }
  if (name === 'submit_search') {
    const rent = choiceOf(data, 'section') === 'rent';
    const parts = [`אני מחפש דירה ${rent ? 'להשכרה' : 'למכירה'}`];
    const city = textOf(data, 'city');
    const rooms = roomsPhrase(data);
    const budget = textOf(data, 'budget');
    if (city) parts.push(`בעיר ${city}`);
    if (rooms) parts.push(rooms);
    if (budget) parts.push(`עד ${budget}`);
    return parts.join(', ');
  }
  if (name === 'submit_alert') {
    const parts = ['אני רוצה התראה כשמתפרסמת דירה חדשה'];
    const city = textOf(data, 'city');
    const rooms = textOf(data, 'rooms');
    const budget = textOf(data, 'budget');
    if (city) parts.push(`בעיר ${city}`);
    if (rooms) parts.push(`${rooms} חדרים`);
    if (budget) parts.push(`עד ${budget}`);
    return parts.join(', ');
  }
  if (name === 'submit_listing') {
    const city = textOf(data, 'city');
    const rooms = textOf(data, 'rooms');
    const price = textOf(data, 'price');
    if (!city || !rooms || !price) return '';
    const rent = choiceOf(data, 'section') === 'rent';
    const street = textOf(data, 'street');
    const area = textOf(data, 'area');
    return [
      `אני רוצה לפרסם דירה ${rent ? 'להשכרה' : 'למכירה'} בעיר ${city}`,
      `${rooms} חדרים`,
      street ? `ברחוב ${street}` : '',
      area ? `${area} מ״ר` : '',
      `מחיר ${price}`,
    ]
      .filter(Boolean)
      .join(', ');
  }
  if (name === 'submit_mortgage') {
    const price = textOf(data, 'price');
    const equity = textOf(data, 'equity');
    const buyer = buyerPhrase(choiceOf(data, 'buyer'));
    if (!price || !equity || !buyer) return '';
    return `אני רוצה לבדוק מה יהיה ההחזר החודשי שלי במשכנתא. מחיר הדירה ${price} ש״ח, הון עצמי ${equity} ש״ח, ${buyer}`;
  }
  if (name === 'submit_afford') {
    const income = textOf(data, 'income');
    const equity = textOf(data, 'equity');
    const buyer = buyerPhrase(choiceOf(data, 'buyer'));
    if (!income || !equity || !buyer) return '';
    return `מרוויחים ${income} נטו בחודש ויש הון עצמי ${equity} ש״ח. ${buyer}. איזו דירה אפשר לקנות`;
  }
  if (name === 'submit_street') {
    const city = textOf(data, 'city');
    const street = textOf(data, 'street');
    if (!city || !street) return '';
    return `אני רוצה לדעת מה המחיר הממוצע ברחוב ${street} בעיר ${city}`;
  }
  return '';
}
