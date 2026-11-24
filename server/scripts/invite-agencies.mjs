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
  const benefits = [
    ['פרסום בחינם.', 'פרסום נכסים באתר לא עולה כלום.'],
    ['שליטה מלאה בנכסים.', 'אתם מעלים, מעדכנים ומורידים מודעות מתי שנוח לכם.'],
    ['פניות ישירות לסוכן.', 'קונה שמתעניין בנכס רואה את מספר הטלפון שלכם ומתקשר אליכם ישירות.'],
    ['CRM למשרד.', 'במקום אחד: הפניות שמגיעות מהאתר, הלקוחות ומה שהם מחפשים, העסקאות, יומן הפגישות והמסמכים של המשרד.'],
    ['הערכת שווי והיסטוריית עסקאות.', 'באתר יש הערכת שווי לדירה לפי עסקאות שנרשמו, ואפשר לראות את היסטוריית העסקאות ברחוב.'],
  ];
  const afterSignup = 'אחרי ההרשמה נאשר את החשבון ותוכלו להתחיל לפרסם. נשמח גם לעזור להעלות את הנכסים הראשונים.';
  const question = 'יש שאלה? פשוט השיבו למייל הזה, אני קורא כל תשובה.';

  const text = [
    greeting,
    '',
    ...intro,
    '',
    'מה תקבלו:',
    ...benefits.map(([title, body]) => `• ${title} ${body}`),
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

  const html = `<div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.7; color: #1e293b;">
<p>${escapeHtml(greeting)}</p>
<p>${intro.join('<br>')}</p>
<p><strong>מה תקבלו:</strong></p>
<ul>
${benefits.map(([title, body]) => `<li><strong>${title}</strong> ${body}</li>`).join('\n')}
</ul>
<p>ההרשמה לוקחת דקה</p>
<p><a href="${SIGNUP}" style="display: inline-block; background: #1d4ed8; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">פתיחת חשבון משרד</a></p>
<p>${afterSignup}</p>
<p>${question}</p>
<p>תודה,<br>איתי<br>Urban365 · <a href="https://urban365.co.il">urban365.co.il</a></p>
</div>`;

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
