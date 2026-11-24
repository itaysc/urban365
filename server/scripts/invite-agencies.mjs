/**
 * Invites offices you name to open an account.
 *
 * On startup it asks for a comma-separated list of addresses and uses only
 * those. It does not read the agency file to decide who is written to. When an
 * address is in data/yad2-agencies.json, that office's name goes in the letter.
 * An address that is not in the file is still sent, with no office name.
 *
 * Sends through the same Resend account the API uses. The domain on the From
 * address has to be verified there; info@urban365.co.il is an address on that
 * domain, not a separate mailbox. Replies come back through Cloudflare's
 * forward because that is where the domain's mail is delivered.
 *
 * After you enter the addresses, it sends them.
 *
 *   node scripts/invite-agencies.mjs
 *
 * RESEND_API_KEY is read from the environment, or from server/.env when unset.
 * Each address that went out is appended to data/agency-invites-sent.json.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resend } from 'resend';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const agenciesFile = resolve(root, 'data/yad2-agencies.json');
const sentFile = resolve(root, 'data/agency-invites-sent.json');

const FROM = 'איתי מ-Urban365 <info@urban365.co.il>';
const SIGNUP = 'https://urban365.co.il/agency/signup';
const SUBJECT = 'הזמנה אישית להצטרף ל-Urban365';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Office name by address, used only to fill in a letter. Never to choose who is written to. */
function namesByAddress() {
  if (!existsSync(agenciesFile)) return new Map();
  const data = JSON.parse(readFileSync(agenciesFile, 'utf8'));
  const rows = [...(data.featuredOnYad2 ?? []), ...(data.additionalPublicInboxes ?? [])];
  const names = new Map();
  for (const row of rows) {
    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
    if (email && row.name && !names.has(email)) names.set(email, row.name);
  }
  return names;
}

function parseAddresses(raw) {
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const seen = new Set();
  const addresses = [];
  const rejected = [];
  for (const part of parts) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) {
      rejected.push(part);
      continue;
    }
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push(part);
  }
  return { addresses, rejected };
}

async function askForAddresses() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question('Addresses to invite, separated by commas: ');
    return answer;
  } finally {
    rl.close();
  }
}

function remember(entry) {
  const rows = existsSync(sentFile) ? JSON.parse(readFileSync(sentFile, 'utf8')) : [];
  rows.push(entry);
  writeFileSync(sentFile, `${JSON.stringify(rows, null, 2)}\n`);
}

function letter(name) {
  const greeting = name ? `שלום לצוות ${name},` : 'שלום,';
  const intro = [
    'אני איתי, ממייסדי Urban365, אתר חדש לנכסים למכירה ולהשכרה בישראל.',
    'אנחנו בשלב ההשקה ופותחים את האתר בהדרגה למשרדי תיווך שאנחנו מזמינים אישית. נשמח שתהיו בין הראשונים.',
  ];
  const forOffice = [
    ['פרסום בחינם.', 'פרסום נכסים באתר לא עולה כלום, ואתם מעלים, מעדכנים ומורידים את המודעות.'],
    ['הטלפון של הסוכן.', 'הפנייה מגיעה אליכם, לא למרכזייה.'],
    ['CRM במקום אחד.', 'פניות, לקוחות, עסקאות, יומן ומסמכים.'],
    ['הזדמנויות.', 'נכס של משרד אחר שמתאים ללקוח שלכם, ואפשר להציע שיתוף פעולה.'],
    ['מחירי שוק.', 'לפי עסקאות שנרשמו, לא לפי מחירי המודעות.'],
  ];
  const forPeople = [
    ['הערכת שווי לדירה.', 'טווח מחיר לפי עסקאות שנרשמו.'],
    ['היסטוריית עסקאות.', 'אפשר לראות מה נמכר ברחוב.'],
    ['מחשבון משכנתא.', 'החזר חודשי לפני שפונים למשרד.'],
    ['חיפוש שנשמר.', 'שומרים נכס, ומקבלים התראה כשמודעה חדשה מתאימה.'],
  ];
  const afterSignup = 'אחרי ההרשמה נאשר את החשבון ותוכלו להתחיל לפרסם. נשמח גם לעזור להעלות את הנכסים הראשונים.';
  const question = 'יש שאלה? פשוט השיבו למייל הזה, אני קורא כל תשובה.';

  const lines = (rows) => rows.map(([title, body]) => `• ${title} ${body}`);
  const text = [
    greeting,
    '',
    ...intro,
    '',
    'למשרד',
    ...lines(forOffice),
    '',
    'למי שמחפש או מוכר דירה',
    ...lines(forPeople),
    '',
    'ההרשמה לוקחת דקה',
    SIGNUP,
    afterSignup,
    '',
    question,
    '',
    'תודה,',
    'איתי',
    'Urban365 · urban365.co.il',
  ].join('\n');

  const row = ([title, body]) => `<tr>
<td style="padding:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1e293b;text-align:right;">
<strong>${title}</strong> ${body}
</td>
</tr>`;
  const group = (label, rows) => `<tr>
<td style="padding:18px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;font-weight:bold;color:#1d4ed8;text-align:right;">
${label}
</td>
</tr>
${rows.map(row).join('\n')}`;

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<body style="margin:0;padding:0;background:#f6f8fc;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="background:#f6f8fc;">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="width:560px;max-width:560px;background:#ffffff;border:1px solid #e2e8f0;">
<tr>
<td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1e293b;text-align:right;">
${escapeHtml(greeting)}
</td>
</tr>
<tr>
<td style="padding:0 28px 4px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1e293b;text-align:right;">
${intro.join('<br>')}
</td>
</tr>
<tr>
<td style="padding:8px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl">
${group('למשרד', forOffice)}
${group('למי שמחפש או מוכר דירה', forPeople)}
</table>
</td>
</tr>
<tr>
<td style="padding:18px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1e293b;text-align:right;">
ההרשמה לוקחת דקה
</td>
</tr>
<tr>
<td align="right" style="padding:14px 28px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl">
<tr>
<td align="center" bgcolor="#1d4ed8" style="border-radius:6px;">
<a href="${SIGNUP}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">פתיחת חשבון משרד</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:16px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#1e293b;text-align:right;">
${afterSignup}
</td>
</tr>
<tr>
<td style="padding:12px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#1e293b;text-align:right;">
${question}
</td>
</tr>
<tr>
<td style="padding:18px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#1e293b;text-align:right;">
תודה,<br>איתי<br>Urban365 · <a href="https://urban365.co.il" style="color:#1d4ed8;text-decoration:none;">urban365.co.il</a>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

  return { text, html };
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function main() {
  loadEnv(resolve(root, 'server/.env'));

  const { addresses, rejected } = parseAddresses(await askForAddresses());
  if (rejected.length > 0) {
    console.error(`Not an address: ${rejected.join(', ')}`);
    process.exit(1);
  }
  if (addresses.length === 0) {
    console.error('No addresses given.');
    process.exit(1);
  }

  const names = namesByAddress();
  const batch = addresses.map((email) => ({ email, name: names.get(email.toLowerCase()) ?? null }));

  console.log(`${batch.length} address${batch.length === 1 ? '' : 'es'}:`);
  for (const row of batch) console.log(`  ${row.email}${row.name ? `  ${row.name}` : ''}`);
  console.log(`\n${letter(batch[0].name).text}\n`);

  for (const row of batch) {
    const id = await deliver(row.email, row.name);
    remember({ email: row.email, name: row.name, resendId: id, sentAt: new Date().toISOString() });
    await sleep(800);
  }
}

async function deliver(to, name) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is missing. Set it, or put it in server/.env.');
    process.exit(1);
  }
  const { text, html } = letter(name);
  const { data, error } = await new Resend(key).emails.send({
    from: FROM,
    to,
    subject: SUBJECT,
    text,
    html,
    replyTo: 'info@urban365.co.il',
  });
  if (error) {
    console.error(`Resend rejected ${to}: ${error.message}`);
    process.exit(1);
  }
  console.log(`sent ${to} (${data?.id ?? 'ok'})`);
  return data?.id ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
