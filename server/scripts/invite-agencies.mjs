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
 * After you enter the addresses, each one gets a private preview of its office.
 * An address that already has one in data/agency-previews.json uses it. For the
 * rest it asks for the office's Yad2 page, and makes the preview the way
 * npm run import:preview does: Chrome on port 9222 showing Yad2, and
 * server/.prod.env. That writes the office and its drafts into production, in test
 * mode too, since the link has to open. Press Enter instead, and that address gets
 * the general invitation. An address already in data/agency-invites-sent.json is
 * sent again only if you answer yes.
 *
 *   node scripts/invite-agencies.mjs
 *
 * It first asks prod or test. In test, each letter is the one that office would
 * get, but it goes to support@urban365.co.il instead, with the office's address in
 * the subject. Nothing is written to the sent log, and it does not ask about
 * earlier sends.
 *
 * RESEND_API_KEY is read from the environment, or from server/.env when unset.
 * Each address that went out is appended to data/agency-invites-sent.json.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resend } from 'resend';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const serverDir = resolve(root, 'server');
const agenciesFile = resolve(root, 'data/yad2-agencies.json');
const sentFile = resolve(root, 'data/agency-invites-sent.json');
const previewsFile = resolve(root, 'data/agency-previews.json');

const FROM = 'איתי מ-Urban365 <info@urban365.co.il>';
const SIGNUP = 'https://urban365.co.il/agency/signup';
const SUBJECT = 'הזמנה אישית להצטרף ל-Urban365';
const TEST_INBOX = 'support@urban365.co.il';
let testing = false;
const PREVIEW_LINK = /^https:\/\/urban365\.co\.il\/preview\/[A-Za-z0-9_-]+$/;

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

/** The office's Yad2 page by address, where the agency file has one. */
function yad2ByAddress() {
  if (!existsSync(agenciesFile)) return new Map();
  const data = JSON.parse(readFileSync(agenciesFile, 'utf8'));
  const rows = [...(data.featuredOnYad2 ?? []), ...(data.additionalPublicInboxes ?? [])];
  const pages = new Map();
  for (const row of rows) {
    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
    const yad2Id = typeof row.yad2Url === 'string' ? yad2IdOf(row.yad2Url) : null;
    if (email && yad2Id && !pages.has(email)) pages.set(email, yad2Id);
  }
  return pages;
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

/** Latest send time for each address, or an empty map when nothing has gone out. */
function alreadySent() {
  if (!existsSync(sentFile)) return new Map();
  const raw = readFileSync(sentFile, 'utf8').trim();
  if (!raw) return new Map();
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch {
    console.error(`Could not read ${sentFile}.`);
    process.exit(1);
  }
  if (!Array.isArray(rows)) return new Map();
  const sent = new Map();
  for (const row of rows) {
    const email = typeof row?.email === 'string' ? row.email.trim().toLowerCase() : '';
    if (!email) continue;
    const at = typeof row.sentAt === 'string' ? row.sentAt : '';
    const prev = sent.get(email);
    if (!prev || at > prev) sent.set(email, at);
  }
  return sent;
}

/** What npm run import:preview wrote down: one row per office, with its link. */
function readPreviews() {
  if (!existsSync(previewsFile)) return [];
  const raw = readFileSync(previewsFile, 'utf8').trim();
  return raw ? JSON.parse(raw) : [];
}

function previewForEmail(email) {
  const key = email.toLowerCase();
  return readPreviews().find((row) => Array.isArray(row.emails) && row.emails.includes(key)) ?? null;
}

/** Ties an address to an office's preview, so the next run finds it without asking. */
function rememberPreviewEmail(yad2Id, email) {
  const rows = readPreviews();
  const row = rows.find((entry) => entry.yad2Id === yad2Id);
  if (!row) return;
  const key = email.toLowerCase();
  row.emails = [...new Set([...(row.emails ?? []), key])];
  writeFileSync(previewsFile, `${JSON.stringify(rows, null, 2)}\n`);
}

function yad2IdOf(input) {
  const fromUrl = input.match(/\/agency\/(\d+)/);
  if (fromUrl) return fromUrl[1];
  return /^\d+$/.test(input) ? input : null;
}

let built = false;

/** Runs the preview import for one office and returns its row, or null when it failed. */
function makePreview(yad2Id) {
  if (!built) {
    console.log('Building the server for the preview import…');
    const build = spawnSync('npm', ['run', 'build'], { cwd: serverDir, stdio: ['ignore', 'inherit', 'inherit'] });
    if (build.status !== 0) return null;
    built = true;
  }
  // stdin stays with this script: the import must not read the answers typed here.
  const run = spawnSync(
    'node',
    ['dist/scripts/import-yad2-preview.js', '--yad2', yad2Id, '--section', 'all', '--yes'],
    { cwd: serverDir, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (run.status !== 0) return null;
  return readPreviews().find((row) => row.yad2Id === yad2Id) ?? null;
}

function wantsAgain(answer) {
  const value = answer.trim().toLowerCase();
  if (value === 'yes' || value === 'y') return true;
  if (value === 'no' || value === 'n') return false;
  return null;
}

function remember(entry) {
  const rows = existsSync(sentFile) ? JSON.parse(readFileSync(sentFile, 'utf8')) : [];
  rows.push(entry);
  writeFileSync(sentFile, `${JSON.stringify(rows, null, 2)}\n`);
}

function letter(name, preview = null) {
  const greeting = name ? `שלום לצוות ${name},` : 'שלום,';
  const who = 'אני איתי, ממייסדי Urban365, אתר חדש לנכסים למכירה ולהשכרה בישראל.';
  const intro = preview
    ? [
        who,
        'הכנו עמוד פרטי שמראה איך הנכסים שאתם מפרסמים היום ייראו אצלנו. הוא לא מופיע באתר ולא בגוגל, ורק מי שיש לו את הקישור רואה אותו.',
      ]
    : [
        who,
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
  const afterSignup = preview
    ? 'אם זה נראה לכם טוב, פותחים חשבון מהעמוד עצמו. אחרי שנאשר, הנכסים עולים לאתר עם הטלפון של המשרד, ואנחנו מוסיפים את התמונות. בלי האישור שלכם שום דבר לא מתפרסם. אם לא מעוניינים, השיבו למייל ונמחק את העמוד.'
    : 'אחרי ההרשמה נאשר את החשבון ותוכלו להתחיל לפרסם. נשמח גם לעזור להעלות את הנכסים הראשונים.';
  const question = 'יש שאלה? פשוט השיבו למייל הזה, אני קורא כל תשובה.';
  const lead = preview ? 'העמוד שלכם' : 'ההרשמה לוקחת דקה';
  const link = preview ?? SIGNUP;
  const button = preview ? 'לצפייה בעמוד' : 'פתיחת חשבון משרד';
  const groups = preview
    ? [['למשרד', forOffice]]
    : [
        ['למשרד', forOffice],
        ['למי שמחפש או מוכר דירה', forPeople],
      ];
  const subject = preview
    ? name
      ? `הכנו תצוגה מקדימה של ${name} ב-Urban365`
      : 'הכנו תצוגה מקדימה של המשרד שלכם ב-Urban365'
    : SUBJECT;

  // With a preview the page is the point of the letter, so it comes before the list.
  const lines = (rows) => rows.map(([title, body]) => `• ${title} ${body}`);
  const featuresText = groups.flatMap(([label, rows]) => [label, ...lines(rows), '']);
  const callText = [lead, link, afterSignup, ''];
  const text = [
    greeting,
    '',
    ...intro,
    '',
    ...(preview ? [...callText, ...featuresText] : [...featuresText, ...callText]),
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

  const featuresHtml = `<tr>
<td style="padding:8px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl">
${groups.map(([label, rows]) => group(label, rows)).join('\n')}
</table>
</td>
</tr>
`;
  const callHtml = `<tr>
<td style="padding:18px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1e293b;text-align:right;">
${lead}
</td>
</tr>
<tr>
<td align="right" style="padding:14px 28px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl">
<tr>
<td align="center" bgcolor="#1d4ed8" style="border-radius:6px;">
<a href="${link}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${button}</a>
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
`;

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
${preview ? callHtml + featuresHtml : featuresHtml + callHtml}<tr>
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

  return { subject, text, html };
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
  const rl = createInterface({ input: stdin, output: stdout });
  // One iterator for every answer. A fresh `question` after the first drops a line
  // that is already waiting, and the script exits without a yes or a no.
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt) => {
    stdout.write(prompt);
    const { value, done } = await lines.next();
    return done ? null : value;
  };
  try {
    for (;;) {
      const mode = await ask(`prod (send to the offices) or test (send to ${TEST_INBOX})? `);
      if (mode === null) {
        console.error('No answer. Not sending.');
        process.exit(1);
      }
      const value = mode.trim().toLowerCase();
      if (value === 'prod' || value === 'p') break;
      if (value === 'test' || value === 't') {
        testing = true;
        break;
      }
      console.log('Answer prod or test.');
    }

    const raw = await ask('Addresses to invite, separated by commas: ');
    if (raw === null) {
      console.error('No addresses given.');
      process.exit(1);
    }
    const { addresses, rejected } = parseAddresses(raw);
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

    if (testing) console.log(`\nTest mode: every letter goes to ${TEST_INBOX}.`);

    const sent = testing ? new Map() : alreadySent();
    const kept = [];
    for (const row of batch) {
      const at = sent.get(row.email.toLowerCase());
      if (!at) {
        kept.push(row);
        continue;
      }
      const when = at.slice(0, 10);
      let again = null;
      while (again === null) {
        const reply = await ask(
          `Already sent to ${row.email}${when ? ` on ${when}` : ''}. Send again? (yes/no) `,
        );
        if (reply === null) {
          console.error('No answer. Not sending.');
          process.exit(1);
        }
        again = wantsAgain(reply);
        if (again === null) console.log('Answer yes or no.');
      }
      if (again) kept.push(row);
      else console.log(`skipped ${row.email}`);
    }
    if (kept.length === 0) {
      console.log('Nothing to send.');
      return;
    }

    const yad2Pages = yad2ByAddress();
    for (const row of kept) {
      row.preview = null;
      const known = previewForEmail(row.email);
      if (known) {
        row.preview = known.url;
        row.name ??= known.name ?? null;
        console.log(`${row.email}: using the preview of ${known.name} (${known.url})`);
        continue;
      }

      const listed = yad2Pages.get(row.email.toLowerCase());
      if (listed) {
        console.log(`${row.email}: making the preview from Yad2 ${listed}, from the agency file.`);
        const made = readPreviews().find((entry) => entry.yad2Id === listed) ?? makePreview(listed);
        if (made) {
          rememberPreviewEmail(listed, row.email);
          row.preview = made.url;
          row.name ??= made.name ?? null;
          console.log(`${row.email}: preview of ${made.name} (${made.url})`);
          continue;
        }
        console.log(`Could not make the preview for Yad2 ${listed}.`);
      }

      for (;;) {
        const reply = await ask(
          `Yad2 page of ${row.email}, to make its preview (number or URL, Enter for the general letter): `,
        );
        if (reply === null) {
          console.error('No answer. Not sending.');
          process.exit(1);
        }
        const value = reply.trim();
        if (value === '') break;

        if (PREVIEW_LINK.test(value)) {
          row.preview = value;
          row.name ??= readPreviews().find((entry) => entry.url === value)?.name ?? null;
          break;
        }

        const yad2Id = yad2IdOf(value);
        if (!yad2Id) {
          console.log('That is not a Yad2 office number or link.');
          continue;
        }
        const made =
          readPreviews().find((entry) => entry.yad2Id === yad2Id) ?? makePreview(yad2Id);
        if (!made) {
          console.log(`Could not make a preview for Yad2 ${yad2Id}. Try again, or press Enter for the general letter.`);
          continue;
        }
        rememberPreviewEmail(yad2Id, row.email);
        row.preview = made.url;
        row.name ??= made.name ?? null;
        console.log(`${row.email}: preview of ${made.name} (${made.url})`);
        break;
      }
    }

    const first = letter(kept[0].name, kept[0].preview);
    console.log(`\n${first.subject}\n\n${first.text}\n`);

    for (const row of kept) {
      const id = await deliver(row.email, row.name, row.preview);
      if (testing) {
        await sleep(800);
        continue;
      }
      remember({
        email: row.email,
        name: row.name,
        ...(row.preview ? { preview: row.preview } : {}),
        resendId: id,
        sentAt: new Date().toISOString(),
      });
      await sleep(800);
    }
  } finally {
    rl.close();
  }
}

async function deliver(to, name, preview) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is missing. Set it, or put it in server/.env.');
    process.exit(1);
  }
  const { subject, text, html } = letter(name, preview);
  const { data, error } = await new Resend(key).emails.send({
    from: FROM,
    to: testing ? TEST_INBOX : to,
    subject: testing ? `[בדיקה: ${to}] ${subject}` : subject,
    text,
    html,
    replyTo: 'info@urban365.co.il',
  });
  if (error) {
    console.error(`Resend rejected ${to}: ${error.message}`);
    process.exit(1);
  }
  console.log(testing ? `sent the letter for ${to} to ${TEST_INBOX} (${data?.id ?? 'ok'})` : `sent ${to} (${data?.id ?? 'ok'})`);
  return data?.id ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
