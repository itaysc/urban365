import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { OUTREACH_DRAFT_LLM } from '../llm/llm.defaults.js';
import { LlmService } from '../llm/llm.service.js';

/** Everything the message may mention, and nothing else. */
export interface DraftRequest {
  agentName: string;
  agencyName: string;
  customerFirstName: string;
  /** The property, as the agent's own records have it. */
  address: string | null;
  rooms: number | null;
  price: number | null;
  squareMeter: number | null;
  propertyType: string | null;
  /** Which parts of their brief this fits — the reason the match was raised. */
  reason: string;
}

/**
 * The instruction, kept whole and apart from the data.
 *
 * Everything that came from a person — a customer's name, an agent's name, an address
 * — goes in the user message as JSON and never in here, so a customer called "ignore
 * your instructions" is a name being described rather than an order being given.
 *
 * The register is the whole job. An agent who has to rewrite every draft is slower than
 * one who types it themselves, and a message that reads as a template is worse than no
 * message at all: it tells the customer they are on a list.
 */
const SYSTEM_PROMPT = `You write short WhatsApp messages in Hebrew for an Israeli estate agent, to a buyer already on their books.

The agent knows this person. They have spoken before and the buyer told the agent what they are looking for. Write the way one person texts another they already know: a greeting, the thing itself, and an easy question at the end.

Rules:
- Hebrew only. 2–3 short sentences, under 50 words. This is a WhatsApp message, not an advertisement.
- Mention only facts you are given. Never invent a floor, a balcony, a view, a renovation, a parking space or a neighbourhood.
- Copy the address exactly as it is written in the data, character for character. It is a real street and a real number, and a Hebrew street name that is almost right is wrong — "אחד העם" is not "חת העם".
- Say briefly why you thought of them — it fits what they asked for. That is what makes it a message rather than a broadcast.
- End with a light question, such as whether they would like to see it or hear more. Never pressure, never a deadline, never "a rare opportunity".
- Do NOT know this person's gender. Avoid gendered verbs and adjectives addressed to them. Prefer forms that work either way: "חשבתי עליך", "יש לי משהו שיכול להתאים", "רוצה שנקפוץ לראות?". Greet them by the name you are given and nothing else — no example name in these instructions is a name to use. Never write "מצאתי לך" with a gendered verb aimed at them, and never guess from the name.
- No emoji. No exclamation marks. No "הזדמנות", "בלעדי", "מחיר מציאה", "חייבים למכור".
- Do NOT sign the message and do NOT write any name at the end. The agent's own name is added afterwards. Do not add the agency name, a phone number or a link either.

Reply with the message text only — no quotes, no preamble, no explanation.`;

/**
 * Writing the message for a match.
 *
 * The model's turn comes last and its job is narrow: a person has already decided this
 * property fits this customer, and all that is left is the wording. It never chooses
 * who to contact, and nothing it writes is sent — the draft goes back to the agent,
 * who edits it or throws it away.
 *
 * That boundary is deliberate. A model that picks the recipient can be confidently
 * wrong about a stranger's life savings; a model that suggests a sentence can only be
 * clumsy, and a person is reading it either way.
 */
@Injectable()
export class DraftService {
  private readonly logger = new Logger(DraftService.name);

  constructor(private readonly llm: LlmService) {}

  async write(request: DraftRequest): Promise<string> {
    if (!this.llm.isConfigured()) {
      // Said plainly rather than returning a canned sentence. A template pretending to
      // be a draft is worse than a button that admits it is switched off.
      throw new ServiceUnavailableException('כתיבת הודעות אינה זמינה כרגע.');
    }

    try {
      const response = await this.llm.ask({
        systemMsg: SYSTEM_PROMPT,
        prompt: JSON.stringify(this.payload(request), null, 2),
        ...OUTREACH_DRAFT_LLM,
      });

      const text = response.data?.trim();
      if (!text) throw new Error('the model returned nothing');

      return this.sign(this.tidy(text), request.agentName.split(' ')[0]);
    } catch (error) {
      this.logger.error(`Draft failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('לא הצלחנו לכתוב טיוטה. אפשר לנסות שוב.');
    }
  }

  /** Only the fields there is something to say about, so nulls are not described. */
  private payload(request: DraftRequest): Record<string, unknown> {
    const property: Record<string, unknown> = {};
    if (request.address) property.address = request.address;
    if (request.propertyType) property.type = request.propertyType;
    if (request.rooms !== null) property.rooms = request.rooms;
    if (request.price !== null) property.priceIls = request.price;
    if (request.squareMeter !== null) property.squareMeters = request.squareMeter;

    return {
      // The agent's own name is deliberately absent. Given one, the model signed with
      // a different name every time — ליאון, אורן, רן — none of them the agent's. It
      // cannot misuse what it is never told, and the real name is appended afterwards
      // from the record rather than generated from anything.
      agencyName: request.agencyName,
      buyerFirstName: request.customerFirstName,
      property,
      whyItFits: request.reason,
    };
  }

  /**
   * The two things a model does anyway, however plainly it is asked not to.
   *
   * Wrapping the whole message in quotation marks, and prefixing it with something like
   * "Here is the message:". Both are cheap to strip and jarring to find in a box an
   * agent is about to send.
   */
  private tidy(text: string): string {
    const withoutPreamble = text.replace(/^[^\n]*:\s*\n+(?=[^\n])/u, '');
    return withoutPreamble.replace(/^["'״׳]+|["'״׳]+$/gu, '').trim();
  }

  /**
   * The agent's own name at the bottom, from the record rather than from the model.
   *
   * Told the agent's name, the model signed with somebody else's — a different
   * invented name on every draft. So it is no longer told, and any name it signs
   * anyway is removed here before the real one is added: a short last line with no
   * sentence punctuation is a signature, and a sentence is not.
   *
   * An agent with no first name on their record gets no signature rather than an
   * empty line, because a message that ends in whitespace looks unfinished.
   */
  private sign(text: string, firstName: string): string {
    const lines = text.split('\n').map((line) => line.trim());
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    const last = lines[lines.length - 1] ?? '';
    const looksLikeSignature = last.length > 0 && last.length <= 20 && !/[.!?،,:]$/u.test(last);
    if (looksLikeSignature && lines.length > 1) lines.pop();

    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    const body = lines.join('\n').trim();
    return firstName ? `${body}\n\n${firstName}` : body;
  }
}
