import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { OverviewService } from '../../agency/overview.service.js';
import { MeetingsService } from '../../calendar/meetings.service.js';
import { CustomersService } from '../../crm/customers.service.js';
import type { UpdateCustomerDto } from '../../crm/dto/customer.dto.js';
import type { UpdateDealDto } from '../../crm/dto/deal.dto.js';
import type { UpdateLeadDto } from '../../crm/dto/lead.dto.js';
import { DealsService } from '../../crm/deals.service.js';
import { LeadsService } from '../../crm/leads.service.js';
import { matchBrief, type Brief, type Candidate } from '../../matching/match.js';
import { RequestContextService } from '../../tenancy/request-context.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { AgentTool } from '../core/agent-tool.decorator.js';
import type { AgentCard, ToolResult } from '../core/agent.types.js';
import {
  CreateCustomerToolDto,
  CreateDealToolDto,
  CreateLeadToolDto,
  CreateMeetingToolDto,
  CustomerIdDto,
  FindCustomersDto,
  FindLeadsDto,
  MatchCustomerListingsDto,
  MeetingIdDto,
  MyListingsToolDto,
  RecordFeedbackToolDto,
  UpcomingMeetingsDto,
  UpdateCustomerToolDto,
  UpdateDealStageDto,
  UpdateLeadToolDto,
} from './agency.dto.js';
import {
  customerCard,
  customerSummary,
  dealCard,
  dealStageLabel,
  dealSummary,
  leadCard,
  leadSummary,
  meetingCard,
  meetingSummary,
  shekel,
} from './agency-present.js';

/**
 * CRM tools for the agency assistant.
 *
 * Every method is thin: the existing services own permissions, assignee scope, and
 * row-level security. Summaries never carry a phone or email; those sit on the cards.
 */
@Injectable()
export class AgencyToolsService {
  constructor(
    private readonly customers: CustomersService,
    private readonly leads: LeadsService,
    private readonly deals: DealsService,
    private readonly meetings: MeetingsService,
    private readonly overview: OverviewService,
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
  ) {}

  @AgentTool({
    name: 'today_overview',
    description:
      'סקירת היום בסוכנות: סיורים היום, מעקבים שממתינים, משוב חסר, פניות פתוחות ועסקאות בפייפליין.',
    audiences: ['agency'],
    group: 'overview',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
  })
  async todayOverview(): Promise<ToolResult> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [stats, todayMeetings, followUps, awaiting] = await Promise.all([
      this.overview.get(),
      this.meetings.list({ from: start.toISOString(), to: end.toISOString() }),
      this.meetings.followUps(),
      this.meetings.awaitingFeedback(),
    ]);

    const { today, listings, pipeline } = stats;
    const parts = [
      `היום: ${today.viewingsToday} סיורים, ${today.viewingsThisWeek} השבוע`,
      `${today.awaitingFeedback} ממתינים למשוב`,
      `${today.openLeads} פניות פתוחות`,
      `${today.openSuggestions} התאמות במכ״ם`,
      today.coBrokerageWaiting > 0 ? `${today.coBrokerageWaiting} בקשות שיתוף ממתינות` : null,
      `פייפליין: ${pipeline.openCount} עסקאות פתוחות (${shekel(pipeline.openValue)})`,
      `נכסים: ${listings.published} מפורסמים, ${listings.draft} טיוטות`,
      followUps.length > 0 ? `${followUps.length} מעקבים לטיפול` : null,
    ].filter(Boolean);

    const cards: AgentCard[] = [
      ...todayMeetings.items.slice(0, 5).map(meetingCard),
      ...followUps.slice(0, 5).map(meetingCard),
      ...awaiting.slice(0, 5).map(meetingCard),
    ];

    return {
      summary: parts.join('. ') + '.',
      cards: cards.length > 0 ? cards : undefined,
    };
  }

  @AgentTool({
    name: 'find_customers',
    description: 'חיפוש לקוחות של הסוכנות לפי שם או עיר בתיק. מחזיר שמות וסטטוס, בלי טלפון במילול.',
    audiences: ['agency'],
    group: 'customers',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    dto: FindCustomersDto,
  })
  async findCustomers(dto: FindCustomersDto): Promise<ToolResult> {
    const page = await this.customers.list({
      q: dto.q,
      kind: dto.kind,
      page: 1,
      pageSize: dto.pageSize ?? 10,
    });
    if (page.items.length === 0) return { summary: 'לא נמצאו לקוחות מתאימים.' };
    return {
      summary: `נמצאו ${page.total} לקוחות. מציג ${page.items.length}: ${page.items.map(customerSummary).join(' | ')}`,
      cards: page.items.map(customerCard),
    };
  }

  @AgentTool({
    name: 'customer_details',
    description: 'פרטי לקוח לפי מזהה, כולל עסקאות ופגישות שלו. הטלפון רק בכרטיס.',
    audiences: ['agency'],
    group: 'customers',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    dto: CustomerIdDto,
  })
  async customerDetails(dto: CustomerIdDto): Promise<ToolResult> {
    const customer = await this.customers.get(dto.id);
    const [deals, meetings] = await Promise.all([
      this.deals.forCustomer(customer.id),
      this.meetings.forCustomer(customer.id),
    ]);
    const dealLine =
      deals.length === 0
        ? 'אין עסקאות'
        : `עסקאות: ${deals.map((deal) => dealSummary(deal)).join(' ; ')}`;
    const meetingLine =
      meetings.length === 0
        ? 'אין פגישות'
        : `פגישות: ${meetings.slice(0, 5).map((row) => meetingSummary(row)).join(' ; ')}`;
    return {
      summary: `${customerSummary(customer)}. ${dealLine}. ${meetingLine}.`,
      cards: [
        customerCard(customer),
        ...deals.slice(0, 5).map(dealCard),
        ...meetings.slice(0, 5).map(meetingCard),
      ],
    };
  }

  @AgentTool({
    name: 'create_customer',
    description: 'יצירת לקוח חדש בסוכנות. הכלי ממתין לאישור במסך לפני השמירה.',
    audiences: ['agency'],
    group: 'customers',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    confirm: true,
    dto: CreateCustomerToolDto,
  })
  async createCustomer(dto: CreateCustomerToolDto): Promise<ToolResult> {
    const row = await this.customers.create(dto);
    return {
      summary: `נוצר לקוח: ${customerSummary(row)}.`,
      cards: [customerCard(row)],
    };
  }

  @AgentTool({
    name: 'update_customer',
    description: 'עדכון לקוח קיים לפי מזהה. ממתין לאישור במסך לפני השמירה.',
    audiences: ['agency'],
    group: 'customers',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    confirm: true,
    dto: UpdateCustomerToolDto,
  })
  async updateCustomer(dto: UpdateCustomerToolDto): Promise<ToolResult> {
    const { id, ...fields } = dto;
    const row = await this.customers.update(id, fields as UpdateCustomerDto);
    return {
      summary: `עודכן לקוח: ${customerSummary(row)}.`,
      cards: [customerCard(row)],
    };
  }

  @AgentTool({
    name: 'find_leads',
    description: 'חיפוש פניות בתיבת הסוכנות לפי שם או סטטוס.',
    audiences: ['agency'],
    group: 'leads',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    dto: FindLeadsDto,
  })
  async findLeads(dto: FindLeadsDto): Promise<ToolResult> {
    const page = await this.leads.list({
      q: dto.q,
      status: dto.status,
      page: 1,
      pageSize: dto.pageSize ?? 10,
    });
    if (page.items.length === 0) return { summary: 'לא נמצאו פניות מתאימות.' };
    return {
      summary: `נמצאו ${page.total} פניות. מציג ${page.items.length}: ${page.items.map(leadSummary).join(' | ')}`,
      cards: page.items.map(leadCard),
    };
  }

  @AgentTool({
    name: 'create_lead',
    description: 'יצירת פנייה חדשה. ממתין לאישור במסך לפני השמירה.',
    audiences: ['agency'],
    group: 'leads',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    confirm: true,
    dto: CreateLeadToolDto,
  })
  async createLead(dto: CreateLeadToolDto): Promise<ToolResult> {
    const row = await this.leads.create(dto);
    return {
      summary: `נוצרה פנייה: ${leadSummary(row)}.`,
      cards: [leadCard(row)],
    };
  }

  @AgentTool({
    name: 'update_lead',
    description: 'עדכון פנייה לפי מזהה, כולל שינוי סטטוס. ממתין לאישור במסך.',
    audiences: ['agency'],
    group: 'leads',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    confirm: true,
    dto: UpdateLeadToolDto,
  })
  async updateLead(dto: UpdateLeadToolDto): Promise<ToolResult> {
    const { id, ...fields } = dto;
    const row = await this.leads.update(id, fields as UpdateLeadDto);
    return {
      summary: `עודכנה פנייה: ${leadSummary(row)}.`,
      cards: [leadCard(row)],
    };
  }

  @AgentTool({
    name: 'deal_board',
    description: 'לוח העסקאות הפתוחות של הסוכנות, לפי שלב.',
    audiences: ['agency'],
    group: 'deals',
    scope: 'agency',
    auth: true,
    requires: 'deal:write',
  })
  async dealBoard(): Promise<ToolResult> {
    const board = await this.deals.board();
    const lines = Object.entries(board.totals).map(([stage, total]) => {
      const label = dealStageLabel(stage);
      return `${label}: ${total.count} עסקאות, שווי ${shekel(total.value)}`;
    });
    const cards = Object.values(board.columns)
      .flat()
      .slice(0, 12)
      .map(dealCard);
    return {
      summary: lines.join(' | '),
      cards,
    };
  }

  @AgentTool({
    name: 'create_deal',
    description: 'יצירת עסקה חדשה. ממתין לאישור במסך לפני השמירה.',
    audiences: ['agency'],
    group: 'deals',
    scope: 'agency',
    auth: true,
    requires: 'deal:write',
    confirm: true,
    dto: CreateDealToolDto,
  })
  async createDeal(dto: CreateDealToolDto): Promise<ToolResult> {
    const row = await this.deals.create(dto);
    return {
      summary: `נוצרה עסקה: ${dealSummary(row)}.`,
      cards: [dealCard(row)],
    };
  }

  @AgentTool({
    name: 'update_deal_stage',
    description: 'העברת עסקה לשלב אחר בלוח. ממתין לאישור במסך.',
    audiences: ['agency'],
    group: 'deals',
    scope: 'agency',
    auth: true,
    requires: 'deal:write',
    confirm: true,
    dto: UpdateDealStageDto,
  })
  async updateDealStage(dto: UpdateDealStageDto): Promise<ToolResult> {
    const patch = {
      stage: dto.stage,
      ...(dto.lostReason ? { lostReason: dto.lostReason } : {}),
    } as UpdateDealDto;
    const row = await this.deals.update(dto.id, patch);
    return {
      summary: `עודכנה עסקה: ${dealSummary(row)}.`,
      cards: [dealCard(row)],
    };
  }

  @AgentTool({
    name: 'upcoming_meetings',
    description: 'פגישות קרובות ביומן הסוכנות לימים הקרובים.',
    audiences: ['agency'],
    group: 'calendar',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    dto: UpcomingMeetingsDto,
  })
  async upcomingMeetings(dto: UpcomingMeetingsDto): Promise<ToolResult> {
    const days = dto.days ?? 7;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + days);
    const result = await this.meetings.list({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const list = result.items;
    if (list.length === 0) return { summary: `אין פגישות ב-${days} הימים הקרובים.` };
    return {
      summary: `${list.length} פגישות: ${list.slice(0, 10).map(meetingSummary).join(' | ')}`,
      cards: list.slice(0, 10).map(meetingCard),
    };
  }

  @AgentTool({
    name: 'follow_ups',
    description: 'מעקבים שמגיע זמנם אחרי סיורים.',
    audiences: ['agency'],
    group: 'calendar',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
  })
  async followUps(): Promise<ToolResult> {
    const rows = await this.meetings.followUps();
    if (rows.length === 0) return { summary: 'אין מעקבים שממתינים עכשיו.' };
    return {
      summary: `${rows.length} מעקבים: ${rows.map(meetingSummary).join(' | ')}`,
      cards: rows.map(meetingCard),
    };
  }

  @AgentTool({
    name: 'create_meeting',
    description: 'קביעת פגישה או סיור ביומן. ממתין לאישור במסך לפני השמירה.',
    audiences: ['agency'],
    group: 'calendar',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    confirm: true,
    dto: CreateMeetingToolDto,
  })
  async createMeeting(dto: CreateMeetingToolDto): Promise<ToolResult> {
    const row = await this.meetings.create(dto);
    return {
      summary: `נקבעה פגישה: ${meetingSummary(row)}.`,
      cards: [meetingCard(row)],
    };
  }

  @AgentTool({
    name: 'record_viewing_feedback',
    description: 'רישום סיכום סיור: מעוניין, שוקל, לא מעוניין או לא הגיע. ממתין לאישור במסך.',
    audiences: ['agency'],
    group: 'calendar',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    confirm: true,
    dto: RecordFeedbackToolDto,
  })
  async recordViewingFeedback(dto: RecordFeedbackToolDto): Promise<ToolResult> {
    const row = await this.meetings.recordFeedback(dto.id, {
      outcome: dto.outcome,
      notes: dto.notes,
      followUpInDays: dto.followUpInDays,
    });
    return {
      summary: `נרשם סיכום סיור: ${meetingSummary(row)}.`,
      cards: [meetingCard(row)],
    };
  }

  @AgentTool({
    name: 'complete_follow_up',
    description: 'סימון מעקב אחרי סיור כבוצע. ממתין לאישור במסך.',
    audiences: ['agency'],
    group: 'calendar',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    confirm: true,
    dto: MeetingIdDto,
  })
  async completeFollowUp(dto: MeetingIdDto): Promise<ToolResult> {
    const row = await this.meetings.completeFollowUp(dto.id);
    return {
      summary: `המעקב סומן כבוצע: ${meetingSummary(row)}.`,
      cards: [meetingCard(row)],
    };
  }

  @AgentTool({
    name: 'match_customer_listings',
    description:
      'התאמת נכסים מפורסמים של הסוכנות לתיק לקוח (עיר, חדרים, תקציב וכו׳). לשאלות כמו "מה מתאים לישראל".',
    audiences: ['agency'],
    group: 'matching',
    scope: 'agency',
    auth: true,
    requires: 'lead:write',
    dto: MatchCustomerListingsDto,
  })
  async matchCustomerListings(dto: MatchCustomerListingsDto): Promise<ToolResult> {
    const customer = await this.customers.get(dto.customerId);
    if (customer.kind === 'seller') {
      return {
        summary: `${customer.name} רשום כמוכר בלבד — אין תיק חיפוש להתאים אליו נכסים.`,
        cards: [customerCard(customer)],
      };
    }

    const brief: Brief = {
      lookingSection: customer.lookingSection,
      lookingCities: customer.lookingCities,
      lookingTypes: customer.lookingTypes,
      minRooms: customer.minRooms,
      maxRooms: customer.maxRooms,
      minPrice: customer.minPrice,
      maxPrice: customer.maxPrice,
      minSquareMeter: customer.minSquareMeter,
    };

    const agencyId = this.context.requireAgencyId();
    const listings = await this.prisma.client.listing.findMany({
      where: { agencyId, status: 'published', delistedAt: null },
      select: {
        id: true,
        section: true,
        city: true,
        propertyType: true,
        rooms: true,
        price: true,
        squareMeter: true,
        street: true,
      },
      take: 500,
    });

    if (listings.length === 0) {
      return {
        summary: `אין נכסים מפורסמים בסוכנות להתאים ל-${customer.name}.`,
        cards: [customerCard(customer)],
      };
    }

    const limit = dto.limit ?? 5;
    const matches = listings
      .map((listing) => {
        const match = matchBrief(brief, listing as Candidate);
        if (!match) return null;
        return { listing, ...match };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (matches.length === 0) {
      return {
        summary: `לא נמצא נכס מפורסם שתואם את התיק של ${customer.name}.`,
        cards: [customerCard(customer)],
      };
    }

    const lines = matches.map((row) => {
      const place = [row.listing.street, row.listing.city].filter(Boolean).join(', ') || 'נכס';
      return `${place} (ציון ${row.score}, מזהה ${row.listing.id}): ${row.reason}`;
    });

    return {
      summary: `ל-${customer.name} נמצאו ${matches.length} התאמות: ${lines.join(' | ')}`,
      cards: [
        customerCard(customer),
        ...matches.map((row) => ({
          type: 'listing' as const,
          id: row.listing.id,
          href: `/app/listings/${row.listing.id}`,
          title: [row.listing.street, row.listing.city].filter(Boolean).join(', ') || 'נכס',
          price: row.listing.price,
          rooms: row.listing.rooms,
          sqm: row.listing.squareMeter,
          city: row.listing.city,
        })),
      ],
    };
  }

  @AgentTool({
    name: 'my_listings',
    description: 'נכסים של הסוכנות לפי סטטוס או חיפוש חופשי.',
    audiences: ['agency'],
    group: 'listings',
    scope: 'agency',
    auth: true,
    requires: 'listing:write',
    dto: MyListingsToolDto,
  })
  async myListings(dto: MyListingsToolDto): Promise<ToolResult> {
    const agencyId = this.context.requireAgencyId();
    const pageSize = dto.pageSize ?? 10;
    const where: Prisma.ListingWhereInput = {
      agencyId,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.q?.trim()
        ? {
            OR: [
              { city: { contains: dto.q.trim(), mode: 'insensitive' } },
              { street: { contains: dto.q.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.listing.count({ where }),
      this.prisma.client.listing.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: pageSize,
        select: {
          id: true,
          token: true,
          status: true,
          price: true,
          rooms: true,
          squareMeter: true,
          city: true,
          street: true,
        },
      }),
    ]);
    if (rows.length === 0) return { summary: 'לא נמצאו נכסים.' };
    const lines = rows.map((row) => {
      const place = [row.street, row.city].filter(Boolean).join(', ') || 'בלי כתובת';
      return `${place} (${row.status}, מזהה ${row.id})${row.price != null ? `, ${shekel(row.price)}` : ''}${
        row.rooms != null ? `, ${row.rooms} חדרים` : ''
      }`;
    });
    return {
      summary: `נמצאו ${total} נכסים. מציג ${rows.length}: ${lines.join(' | ')}`,
      cards: rows.map((row) => ({
        type: 'listing' as const,
        id: row.id,
        href: `/app/listings/${row.id}`,
        title: [row.street, row.city].filter(Boolean).join(', ') || 'נכס',
        price: row.price,
        rooms: row.rooms,
        sqm: row.squareMeter,
        city: row.city,
      })),
    };
  }
}
