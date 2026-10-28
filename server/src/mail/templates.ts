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
     <p style="font-size:12px;color:#64748b">הקישור תקף לשעה אחת.</p>`,
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
