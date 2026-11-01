import type { Prisma } from '@prisma/client';

const LISTING = {
  select: {
    id: true,
    city: true,
    street: true,
    houseNumber: true,
    rooms: true,
    price: true,
    squareMeter: true,
    propertyType: true,
    coverImageUrl: true,
  },
} as const;

const AGENCY = { select: { id: true, name: true, phone: true, logoUrl: true } } as const;

/**
 * The thread, oldest first.
 *
 * `agencyId` rather than the agency object: the only question on screen is "was this
 * us or them", and the names are already on the request. The author's first name is
 * there because a deal is worked by a person, and "רונית from the other agency said"
 * reads as a conversation where "the other agency said" reads as a system.
 */
const MESSAGES = {
  select: {
    id: true,
    body: true,
    createdAt: true,
    agencyId: true,
    author: { select: { firstName: true, lastName: true } },
  },
  orderBy: { createdAt: 'asc' },
} as const;

/** Both sides see the same stage: it is the deal's, not either agency's. */
const SHARED = {
  id: true,
  status: true,
  stage: true,
  message: true,
  commissionSplit: true,
  briefSummary: true,
  createdAt: true,
  respondedAt: true,
  messages: MESSAGES,
} as const;

/** What the agency that has the buyer sees: all of it, including their own customer. */
export const SEEKER_SELECT = {
  ...SHARED,
  listing: LISTING,
  holdingAgency: AGENCY,
  customer: { select: { id: true, name: true, phone: true } },
  // Our own read mark, so the page can say what is new for us. The other side's is
  // deliberately absent: when they last looked is not our business.
  seekerReadAt: true,
} satisfies Prisma.CoBrokerageRequestSelect;

/**
 * What the agency being asked sees — and what it does not.
 *
 * `customer` is absent, and that absence is the whole feature. Row-level security has
 * no column dimension: the row is legitimately theirs to read, so nothing in the
 * database stops the buyer coming back with it. This select is what stops it, which is
 * why it is spelled out here rather than derived from the one above, and why a test
 * asserts its shape rather than trusting the next person to notice.
 *
 * `briefSummary` is the substitute: what the buyer wants, never who they are and never
 * what they can afford. The listing's own price already proves they can afford it; the
 * room above it is the buyer's to keep.
 */
export const HOLDER_SELECT = {
  ...SHARED,
  listing: LISTING,
  seekingAgency: AGENCY,
  holderReadAt: true,
} satisfies Prisma.CoBrokerageRequestSelect;

/** The field names, for the test that holds the line above. */
export const SEEKER_FIELDS = Object.keys(SEEKER_SELECT);
export const HOLDER_FIELDS = Object.keys(HOLDER_SELECT);
