/**
 * Plain HTML, RTL, no template engine. These are short transactional messages and a
 * dependency would buy nothing — the discipline that matters is that the link is the
 * only variable part.
 */
const shell = (title: string, body: string) => `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${title}</h1>
    ${body}
    <p style="margin-top:28px;font-size:12px;color:#94a3b8">
      אם לא ביקשת את ההודעה הזו, אפשר להתעלם ממנה.
    </p>
  </div>
</body></html>`;

/**
 * For the one kind of text in here that an outsider writes: what a seller types into
 * the public coordination page. Everything else in these templates is written by the
 * agency about its own people, but that note arrives from a stranger with a link, and
 * it lands in an agent's mail client.
 */
const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const button = (href: string, label: string) => `
  <p style="margin:24px 0">
    <a href="${href}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px">${label}</a>
  </p>
  <p style="font-size:12px;color:#64748b;word-break:break-all">${href}</p>`;

export const verifyEmailTemplate = (link: string, firstName: string) => ({
  subject: 'אימות כתובת האימייל',
  html: shell(
    `שלום ${firstName},`,
    `<p style="color:#334155;line-height:1.6">כדי להשלים את ההרשמה, צריך לאמת את כתובת האימייל.</p>
     ${button(link, 'אימות הכתובת')}
     <p style="font-size:12px;color:#64748b">הקישור תקף ל‑24 שעות.</p>`,
  ),
});

export const passwordResetTemplate = (link: string, firstName: string) => ({
  subject: 'איפוס סיסמה',
  html: shell(
    `שלום ${firstName},`,
    `<p style="color:#334155;line-height:1.6">התקבלה בקשה לאיפוס הסיסמה בחשבון שלך.</p>
     ${button(link, 'איפוס הסיסמה')}
     <p style="font-size:12px;color:#64748b">הקישור תקף לשעתיים.</p>`,
  ),
});

/**
 * Sent to the address that *already* has an account when someone tries to sign up with
 * it — the signup response itself stays neutral, so this is how the real owner finds out.
 */
export const accountExistsTemplate = (loginUrl: string, resetUrl: string) => ({
  subject: 'ניסיון הרשמה עם הכתובת שלך',
  html: shell(
    'כבר קיים חשבון עם הכתובת הזו',
    `<p style="color:#334155;line-height:1.6">מישהו ניסה להירשם עם כתובת האימייל שלך. אם זה היית את/ה, אפשר פשוט להתחבר.</p>
     ${button(loginUrl, 'התחברות')}
     <p style="color:#334155;line-height:1.6">שכחת סיסמה? <a href="${resetUrl}">איפוס סיסמה</a></p>`,
  ),
});

export const claimDecisionTemplate = (approved: boolean, agencyName: string, appUrl: string) => ({
  subject: approved ? `הסוכנות ${agencyName} אושרה` : `בקשת השיוך לסוכנות ${agencyName} נדחתה`,
  html: shell(
    approved ? 'הבקשה אושרה' : 'הבקשה נדחתה',
    approved
      ? `<p style="color:#334155;line-height:1.6">החשבון שלך שויך לסוכנות <strong>${agencyName}</strong>, והנכסים שלה זמינים עכשיו בניהול.</p>${button(appUrl, 'כניסה לניהול')}`
      : `<p style="color:#334155;line-height:1.6">בקשת השיוך לסוכנות <strong>${agencyName}</strong> לא אושרה. אפשר לפנות אלינו לבירור.</p>`,
  ),
});

export const agencyInviteTemplate = (
  link: string,
  agencyName: string,
  inviterName: string,
  roleLabel: string,
) => ({
  subject: `הוזמנת להצטרף ל${agencyName}`,
  html: shell(
    'הוזמנת להצטרף לצוות',
    `<p style="color:#334155;line-height:1.6">
       ${inviterName} הזמין אותך להצטרף ל<strong>${agencyName}</strong> בתור ${roleLabel}.
     </p>
     ${button(link, 'הצטרפות לצוות')}
     <p style="font-size:12px;color:#64748b">הקישור חד-פעמי ותקף ל‑3 ימים.</p>`,
  ),
});

/** A platform admin inviting someone to use the site, with no agency attached. */
export const userInviteTemplate = (link: string, inviterName: string, roleLabel: string) => ({
  subject: 'הוזמנת ל-Urban365',
  html: shell(
    'הוזמנת להשתמש באתר',
    `<p style="color:#334155;line-height:1.6">
       ${inviterName} הזמין אותך להשתמש ב-Urban365 בתור ${roleLabel}.
     </p>
     ${button(link, 'יצירת חשבון')}
     <p style="font-size:12px;color:#64748b">הקישור חד-פעמי ותקף ל‑3 ימים.</p>`,
  ),
});

/**
 * The note is the admin's own words, so it is escaped: a rejection is not a place
 * for markup to land in somebody's inbox.
 */
export const listingDecisionTemplate = (params: {
  approved: boolean;
  firstName: string;
  address: string;
  link?: string;
  note?: string;
}) => {
  const hello = params.firstName.trim()
    ? `<p style="color:#334155;line-height:1.6">שלום ${escape(params.firstName.trim())},</p>`
    : '';
  const where = escape(params.address);

  return {
    subject: params.approved ? 'הנכס שלך אושר ופורסם' : 'הנכס שלך לא אושר',
    html: shell(
      params.approved ? 'הנכס אושר' : 'הנכס לא אושר',
      params.approved
        ? `${hello}
           <p style="color:#334155;line-height:1.6">הנכס ב${where} אושר ועלה לאוויר.</p>
           ${params.link ? button(params.link, 'לצפייה בנכס') : ''}`
        : `${hello}
           <p style="color:#334155;line-height:1.6">הנכס ב${where} לא אושר.</p>
           <p style="color:#334155;line-height:1.6">${escape(params.note ?? '').replaceAll('\n', '<br>')}</p>`,
    ),
  };
};

export const removedFromAgencyTemplate = (agencyName: string) => ({
  subject: `הוסרת מ${agencyName}`,
  html: shell(
    'הגישה שלך הוסרה',
    `<p style="color:#334155;line-height:1.6">
       אינך עוד חבר/ה בצוות של <strong>${agencyName}</strong>. החשבון שלך נשאר פעיל.
     </p>`,
  ),
});

/**
 * A viewing, sent to the customer so they can say whether they are coming.
 *
 * Two buttons rather than one: "confirm" alone makes silence ambiguous, and an agent
 * standing outside an empty flat would rather have been told no.
 */
export const viewingConfirmationTemplate = (params: {
  firstName: string;
  agencyName: string;
  when: string;
  location: string | null;
  confirmUrl: string;
}) => ({
  subject: `אישור פגישה — ${params.when}`,
  html: shell(
    `שלום ${params.firstName},`,
    `<p style="color:#334155;line-height:1.6">
       ${params.agencyName} קבעו איתך פגישה ל<strong>${params.when}</strong>${
         params.location ? `, ב${params.location}` : ''
       }.
     </p>
     <p style="color:#334155;line-height:1.6">אפשר לאשר או לבטל בלחיצה:</p>
     ${button(params.confirmUrl, 'לאישור או ביטול')}`,
  ),
});

/** The same meeting, the day before. Shorter, because by now they know what it is. */
export const viewingReminderTemplate = (params: {
  firstName: string;
  agencyName: string;
  when: string;
  location: string | null;
  confirmUrl: string;
}) => ({
  subject: `תזכורת — פגישה ${params.when}`,
  html: shell(
    `שלום ${params.firstName},`,
    `<p style="color:#334155;line-height:1.6">
       תזכורת לפגישה עם ${params.agencyName} ב<strong>${params.when}</strong>${
         params.location ? `, ב${params.location}` : ''
       }.
     </p>
     ${button(params.confirmUrl, 'אישור או ביטול')}`,
  ),
});

/** To the agent, when the customer answers. Their diary just changed. */
export const viewingResponseTemplate = (params: {
  customerName: string;
  confirmed: boolean;
  when: string;
  appUrl: string;
}) => ({
  subject: `${params.customerName} ${params.confirmed ? 'אישר/ה' : 'ביטל/ה'} את הפגישה ${params.when}`,
  html: shell(
    params.confirmed ? 'הפגישה אושרה' : 'הפגישה בוטלה',
    `<p style="color:#334155;line-height:1.6">
       ${params.customerName} ${params.confirmed ? 'אישר/ה' : 'ביטל/ה'} את הפגישה שנקבעה ל<strong>${params.when}</strong>.
     </p>
     ${button(`${params.appUrl}/app/calendar`, 'ליומן')}`,
  ),
});

/**
 * To whoever owns the property, asking whether a time suits.
 *
 * Addressed as a request rather than a notice: the agent has proposed this time, not
 * decided it, and an email that says "a viewing has been scheduled" to somebody who
 * then has to be home is how an agency loses a seller. The buyer's name is not in it —
 * the seller has no need of it, and until the viewing happens it is not theirs to know.
 */
export const sellerViewingRequestTemplate = (params: {
  firstName: string;
  agencyName: string;
  when: string;
  propertyLabel: string | null;
  confirmUrl: string;
}) => ({
  subject: `בקשה לתיאום ביקור — ${params.when}`,
  html: shell(
    `שלום ${params.firstName},`,
    `<p style="color:#334155;line-height:1.6">
       ${params.agencyName} מבקשים להביא מתעניין לביקור${
         params.propertyLabel ? ` ב${params.propertyLabel}` : ''
       } ב<strong>${params.when}</strong>.
     </p>
     <p style="color:#334155;line-height:1.6">
       הביקור ייקבע רק אחרי שתאשרו. אם המועד לא מתאים, אפשר לכתוב מתי כן.
     </p>
     ${button(params.confirmUrl, 'לאישור המועד')}`,
  ),
});

/** To the agent, when the seller answers. Half the arrangement just moved. */
export const sellerResponseTemplate = (params: {
  sellerName: string;
  confirmed: boolean;
  when: string;
  note: string | null;
  appUrl: string;
}) => ({
  subject: `${params.sellerName} ${params.confirmed ? 'אישר/ה' : 'דחה/תה'} את הביקור ${params.when}`,
  html: shell(
    params.confirmed ? 'בעל הנכס אישר את המועד' : 'בעל הנכס לא אישר את המועד',
    `<p style="color:#334155;line-height:1.6">
       ${params.sellerName} ${params.confirmed ? 'אישר/ה' : 'לא אישר/ה'} את הביקור שהוצע ל<strong>${params.when}</strong>.
     </p>
     ${
       // What they wrote is the reason to read this email at all when the answer is no.
       params.note
         ? `<p style="color:#334155;line-height:1.6;border-right:3px solid #cbd5e1;padding-right:12px">${escape(params.note)}</p>`
         : ''
     }
     ${button(`${params.appUrl}/app/calendar`, 'ליומן')}`,
  ),
});

/** One line of the morning email: what it is about, and why it is there. */
export interface BriefingItem {
  heading: string;
  subject: string;
  reason: string;
}

/**
 * The morning email: what is worth doing today.
 *
 * Sent only when there is something in it. A daily message that sometimes says "nothing
 * today" teaches people to stop opening it, and then the one that matters goes unread
 * with the rest.
 *
 * The items are the same rows as the radar, in the same order and with the same
 * reasons. The email is not a summary of the page — it is the page, far enough along
 * that somebody can decide whether to open it.
 */
export const dailyBriefingTemplate = (params: {
  firstName: string;
  items: BriefingItem[];
  /** How many did not fit, so the count is honest about what is on the page. */
  more: number;
  appUrl: string;
}) => ({
  subject:
    params.items.length === 1
      ? 'דבר אחד שווה לעשות היום'
      : `${params.items.length + params.more} דברים ששווה לעשות היום`,
  html: shell(
    `בוקר טוב ${escape(params.firstName)},`,
    `<p style="color:#334155;line-height:1.6">מה שעלה ביומן ובלקוחות שלך:</p>
     ${params.items
       .map(
         (item) => `
       <div style="border-right:3px solid #3b82f6;padding-right:12px;margin:16px 0">
         <p style="margin:0;color:#64748b;font-size:12px">${escape(item.heading)}</p>
         <p style="margin:2px 0 0;color:#0f172a;font-weight:600">${escape(item.subject)}</p>
         <p style="margin:2px 0 0;color:#475569;font-size:14px">${escape(item.reason)}</p>
       </div>`,
       )
       .join('')}
     ${
       params.more > 0
         ? `<p style="color:#64748b;font-size:14px">ועוד ${params.more} בעמוד ההזדמנויות.</p>`
         : ''
     }
     ${button(`${params.appUrl}/app/radar`, 'לעמוד ההזדמנויות')}
     <p style="font-size:12px;color:#94a3b8">
       אפשר לכבות את המייל היומי בעמוד הפרופיל.
     </p>`,
  ),
});

/**
 * To the other agency, when something moves on a shared deal.
 *
 * Says what happened and sends them to the page, rather than repeating the message
 * itself: the thread lives in the product on purpose, and an email that quotes it
 * invites a reply by email, where neither agency can find it six weeks later.
 */
export const coBrokerageUpdateTemplate = (params: {
  fromAgency: string;
  property: string;
  what: 'accepted' | 'declined' | 'message';
  appUrl: string;
}) => {
  const headline =
    params.what === 'accepted'
      ? 'אישרו את שיתוף הפעולה'
      : params.what === 'declined'
        ? 'לא אישרו את שיתוף הפעולה'
        : 'הגיבו לכם';

  return {
    subject: `${escape(params.fromAgency)} ${headline} — ${escape(params.property)}`,
    html: shell(
      `${escape(params.fromAgency)} ${headline}`,
      `<p style="color:#334155;line-height:1.6">
         בנוגע לנכס ב<strong>${escape(params.property)}</strong>.
       </p>
       ${button(`${params.appUrl}/app/cobrokerage`, 'לעמוד שיתופי הפעולה')}`,
    ),
  };
};

/** One listing in an alert: enough to decide whether to open the link. */
export interface AlertListing {
  address: string;
  rooms: number | null;
  price: number | null;
  squareMeter: number | null;
}

/**
 * To a buyer, when something they asked about appears.
 *
 * Named after their own search, because that is what they will recognise — "4 חדרים
 * בחולון" means something to them and a list of filters does not. The link goes to the
 * saved searches page rather than to one listing: they asked about a search, and the
 * one that interests them may be the third.
 */
export const savedSearchAlertTemplate = (params: {
  firstName: string;
  searchName: string;
  listings: AlertListing[];
  more: number;
  appUrl: string;
}) => {
  const line = (l: AlertListing) =>
    [
      l.rooms !== null ? `${l.rooms} חדרים` : null,
      l.squareMeter !== null ? `${l.squareMeter} מ״ר` : null,
      l.price !== null ? `${l.price.toLocaleString('he-IL')} ₪` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return {
    subject:
      params.listings.length === 1
        ? `נכס חדש שמתאים ל"${escape(params.searchName)}"`
        : `${params.listings.length + params.more} נכסים חדשים שמתאימים ל"${escape(params.searchName)}"`,
    html: shell(
      `שלום ${escape(params.firstName)},`,
      `<p style="color:#334155;line-height:1.6">
         נכנסו נכסים חדשים שמתאימים לחיפוש השמור שלכם —
         <strong>${escape(params.searchName)}</strong>.
       </p>
       ${params.listings
         .map(
           (l) => `
         <div style="border-right:3px solid #3b82f6;padding-right:12px;margin:16px 0">
           <p style="margin:0;color:#0f172a;font-weight:600">${escape(l.address)}</p>
           <p style="margin:2px 0 0;color:#475569;font-size:14px">${escape(line(l))}</p>
         </div>`,
         )
         .join('')}
       ${
         params.more > 0
           ? `<p style="color:#64748b;font-size:14px">ועוד ${params.more} באתר.</p>`
           : ''
       }
       ${button(`${params.appUrl}/alerts`, 'לחיפושים השמורים')}
       <p style="font-size:12px;color:#94a3b8">
         אפשר לכבות את ההתראה או למחוק את החיפוש באותו עמוד.
       </p>`,
    ),
  };
};
