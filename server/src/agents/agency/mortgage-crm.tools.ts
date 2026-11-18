import { Injectable } from '@nestjs/common';
import { BankerContactsService } from '../../mortgage-crm/banker-contacts.service.js';
import { MORTGAGE_CASE_STAGES } from '../../mortgage-crm/dto/mortgage-case.dto.js';
import { MortgageCasesService } from '../../mortgage-crm/mortgage-cases.service.js';
import { AgentTool } from '../core/agent-tool.decorator.js';
import type { ToolResult } from '../core/agent.types.js';
import {
  bankerContactCard,
  bankerContactSummary,
  mortgageCaseCard,
  mortgageCaseStageLabel,
  mortgageCaseSummary,
  shekel,
} from './agency-present.js';
import {
  CreateBankerContactToolDto,
  CreateMortgageCaseToolDto,
  FindBankerContactsDto,
  FindMortgageCasesDto,
  MortgageCaseIdDto,
  UpdateMortgageCaseStageDto,
} from './mortgage-crm.dto.js';

/**
 * Mortgage-broker CRM tools for the agency assistant.
 *
 * Lives beside the shared CRM tools so real-estate agencies do not load these into
 * prompts they never need — discovery still registers them for every `agency`
 * audience; the vertical simply never asks about cases it does not have.
 */
@Injectable()
export class MortgageCrmToolsService {
  constructor(
    private readonly cases: MortgageCasesService,
    private readonly bankers: BankerContactsService,
  ) {}

  @AgentTool({
    name: 'mortgage_case_board',
    description: 'לוח תיקי המשכנתא של הסוכנות לפי שלב, עם סכומים מבוקשים.',
    audiences: ['agency'],
    group: 'mortgage-crm',
    scope: 'agency',
    auth: true,
    requires: 'deal:write',
  })
  async mortgageCaseBoard(): Promise<ToolResult> {
    const board = await this.cases.board();
    const lines = MORTGAGE_CASE_STAGES.map((stage) => {
      const total = board.totals[stage];
      if (!total || total.count === 0) return null;
      return `${mortgageCaseStageLabel(stage)}: ${total.count} תיקים${
        total.requested > 0 ? `, ${shekel(total.requested)}` : ''
      }`;
    }).filter(Boolean);

    if (lines.length === 0) return { summary: 'אין תיקי משכנתא פתוחים.' };

    const cards = MORTGAGE_CASE_STAGES.flatMap((stage) =>
      (board.columns[stage] ?? []).slice(0, 3).map(mortgageCaseCard),
    ).slice(0, 10);

    return {
      summary: `לוח תיקי משכנתא: ${lines.join(' | ')}.`,
      cards,
    };
  }

  @AgentTool({
    name: 'find_mortgage_cases',
    description: 'חיפוש תיקי משכנתא לפי שם לקוח/פנייה או לפי שלב.',
    audiences: ['agency'],
    group: 'mortgage-crm',
    scope: 'agency',
    auth: true,
    requires: 'deal:write',
    dto: FindMortgageCasesDto,
  })
  async findMortgageCases(dto: FindMortgageCasesDto): Promise<ToolResult> {
    const board = await this.cases.board();
    let rows = MORTGAGE_CASE_STAGES.flatMap((stage) => board.columns[stage] ?? []);
    if (dto.stage) rows = rows.filter((row) => row.stage === dto.stage);
    const q = dto.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) => {
        const who = `${row.customer?.name ?? ''} ${row.lead?.name ?? ''} ${row.propertyCity ?? ''}`.toLowerCase();
        return who.includes(q);
      });
    }
    if (rows.length === 0) return { summary: 'לא נמצאו תיקי משכנתא מתאימים.' };
    const shown = rows.slice(0, 10);
    return {
      summary: `נמצאו ${rows.length} תיקים. מציג ${shown.length}: ${shown.map(mortgageCaseSummary).join(' | ')}`,
      cards: shown.map(mortgageCaseCard),
    };
  }

  @AgentTool({
    name: 'mortgage_case_details',
    description: 'פרטי תיק משכנתא לפי מזהה, כולל הצעות בנק. בלי טלפון במילול.',
    audiences: ['agency'],
    group: 'mortgage-crm',
    scope: 'agency',
    auth: true,
    requires: 'deal:write',
    dto: MortgageCaseIdDto,
  })
  async mortgageCaseDetails(dto: MortgageCaseIdDto): Promise<ToolResult> {
    const row = await this.cases.findOne(dto.id);
    return {
      summary: mortgageCaseSummary(row),
      cards: [mortgageCaseCard(row)],
    };
  }

  @AgentTool({
    name: 'create_mortgage_case',
    description: 'פתיחת תיק משכנתא חדש. ממתין לאישור במסך לפני השמירה.',
    audiences: ['agency'],
    group: 'mortgage-crm',
    scope: 'agency',
    auth: true,
    requires: 'deal:write',
    confirm: true,
    dto: CreateMortgageCaseToolDto,
  })
  async createMortgageCase(dto: CreateMortgageCaseToolDto): Promise<ToolResult> {
    const row = await this.cases.create(dto);
    return {
      summary: `נפתח תיק משכנתא: ${mortgageCaseSummary(row)}.`,
      cards: [mortgageCaseCard(row)],
    };
  }

  @AgentTool({
    name: 'update_mortgage_case_stage',
    description: 'שינוי שלב בתיק משכנתא. ממתין לאישור במסך.',
    audiences: ['agency'],
    group: 'mortgage-crm',
    scope: 'agency',
    auth: true,
    requires: 'deal:write',
    confirm: true,
    dto: UpdateMortgageCaseStageDto,
  })
  async updateMortgageCaseStage(dto: UpdateMortgageCaseStageDto): Promise<ToolResult> {
    const row = await this.cases.update(dto.id, { stage: dto.stage });
    return {
      summary: `עודכן שלב התיק: ${mortgageCaseSummary(row)}.`,
      cards: [mortgageCaseCard(row)],
    };
  }

  @AgentTool({
    name: 'find_banker_contacts',
    description: 'חיפוש אנשי קשר בבנקים לפי שם בנק או איש קשר. הטלפון רק בכרטיס.',
    audiences: ['agency'],
    group: 'mortgage-crm',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    dto: FindBankerContactsDto,
  })
  async findBankerContacts(dto: FindBankerContactsDto): Promise<ToolResult> {
    const all = await this.bankers.list();
    const q = dto.q?.trim().toLowerCase();
    const rows = q
      ? all.filter((row) =>
          `${row.bankName} ${row.name} ${row.branch ?? ''}`.toLowerCase().includes(q),
        )
      : all;
    if (rows.length === 0) return { summary: 'לא נמצאו אנשי קשר בבנקים.' };
    const shown = rows.slice(0, 15);
    return {
      summary: `נמצאו ${rows.length} אנשי קשר. מציג ${shown.length}: ${shown.map(bankerContactSummary).join(' | ')}`,
      cards: shown.map(bankerContactCard),
    };
  }

  @AgentTool({
    name: 'create_banker_contact',
    description: 'הוספת איש קשר בבנק. ממתין לאישור במסך לפני השמירה.',
    audiences: ['agency'],
    group: 'mortgage-crm',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    confirm: true,
    dto: CreateBankerContactToolDto,
  })
  async createBankerContact(dto: CreateBankerContactToolDto): Promise<ToolResult> {
    const row = await this.bankers.create(dto);
    return {
      summary: `נוסף איש קשר: ${bankerContactSummary(row)}.`,
      cards: [bankerContactCard(row)],
    };
  }
}
