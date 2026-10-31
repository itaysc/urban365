import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftService, type DraftRequest } from './draft.service.js';
import type { LlmService } from '../llm/llm.service.js';

const REQUEST: DraftRequest = {
  agentName: 'יעל כהן',
  agencyName: 'סוכנות הדגמה',
  customerFirstName: 'אלמוג',
  address: 'סוקולוב 15, חולון',
  rooms: 4,
  price: 2_150_000,
  squareMeter: 96,
  propertyType: 'דירה',
  reason: 'תואם לבקשה: חולון · דירה · 4 חדרים',
};

/** A model that answers with whatever the test hands it. */
function fakeLlm(reply: string | null, configured = true) {
  const ask = vi.fn().mockResolvedValue({ data: reply });
  return {
    service: { isConfigured: () => configured, ask } as unknown as LlmService,
    ask,
  };
}

describe('DraftService', () => {
  let service: DraftService;
  let ask: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const llm = fakeLlm('שלום דני, נכנסה אצלנו דירה בסוקולוב 15.');
    ask = llm.ask;
    service = new DraftService(llm.service);
  });

  it('sends the facts as data, apart from the instruction', async () => {
    await service.write(REQUEST);

    const [params] = ask.mock.calls[0] as [{ prompt: string; systemMsg: string }];
    const payload = JSON.parse(params.prompt) as Record<string, unknown>;

    expect(payload.buyerFirstName).toBe('אלמוג');
    expect(payload.property).toMatchObject({ rooms: 4, priceIls: 2_150_000 });
    // The customer's details must never reach the instruction, where a name like
    // "ignore your instructions" would read as one.
    expect(params.systemMsg).not.toContain('אלמוג');
  });

  it('gives the agent first name only, which is how people sign a text', async () => {
    await service.write(REQUEST);

    const [params] = ask.mock.calls[0] as [{ prompt: string }];
    expect((JSON.parse(params.prompt) as { agentFirstName: string }).agentFirstName).toBe('יעל');
  });

  it('leaves out what nobody filled in rather than describing it as missing', async () => {
    await service.write({ ...REQUEST, squareMeter: null, propertyType: null });

    const [params] = ask.mock.calls[0] as [{ prompt: string }];
    const property = (JSON.parse(params.prompt) as { property: Record<string, unknown> }).property;

    expect(property).not.toHaveProperty('squareMeters');
    expect(property).not.toHaveProperty('type');
    expect(property).toHaveProperty('rooms');
  });

  it('strips the quotation marks a model wraps the whole thing in', async () => {
    const llm = fakeLlm('"שלום דני, יש לי משהו בשבילך."');
    const text = await new DraftService(llm.service).write(REQUEST);

    expect(text).toBe('שלום דני, יש לי משהו בשבילך.');
  });

  it('strips a preamble line before the message', async () => {
    const llm = fakeLlm('הנה ההודעה:\n\nשלום דני, נכנסה דירה חדשה.');
    const text = await new DraftService(llm.service).write(REQUEST);

    expect(text).toBe('שלום דני, נכנסה דירה חדשה.');
  });

  it('keeps a colon inside the message itself', async () => {
    const llm = fakeLlm('שלום דני, שתי אפשרויות: רביעי או חמישי.');
    const text = await new DraftService(llm.service).write(REQUEST);

    expect(text).toBe('שלום דני, שתי אפשרויות: רביעי או חמישי.');
  });

  it('says so when there is no key, rather than returning a template', async () => {
    const llm = fakeLlm(null, false);

    await expect(new DraftService(llm.service).write(REQUEST)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('says so when the model answers with nothing', async () => {
    const llm = fakeLlm('   ');

    await expect(new DraftService(llm.service).write(REQUEST)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
