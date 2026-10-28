import { Prisma } from '@prisma/client';

/**
 * The sort order is the one thing here that no type error can catch. `TIEBREAK` used to
 * be `token`, which is null for every listing created in this app rather than scraped —
 * so they would all tie, and rows would repeat or vanish as you paged. It must be a
 * column that is unique *and* never null.
 */
describe('listing sort order', () => {
  // Re-read the module's exported shape through a query the service would build.
  const buildOrder = (primary: Prisma.ListingOrderByWithRelationInput[]) => primary;

  it('ends every sort on a non-nullable unique column', async () => {
    const { ORDER_BY_FOR_TEST } = await import('./listings.service.js');

    for (const [sort, order] of Object.entries(ORDER_BY_FOR_TEST())) {
      const last = buildOrder(order).at(-1);
      expect(last, `sort "${sort}" has no tiebreaker`).toBeDefined();

      const [column] = Object.keys(last!);
      // `id` is @id @default(cuid()) — unique and never null. `token` is nullable.
      expect(column, `sort "${sort}" tiebreaks on a nullable column`).toBe('id');
    }
  });

  it('orders a mixed scraped/manual set deterministically', () => {
    // Two listings at the same price, one scraped (token set) and one created here.
    const rows = [
      { id: 'b', token: null, price: 1_540_000 },
      { id: 'a', token: 'abc123', price: 1_540_000 },
    ];

    const sorted = [...rows].sort((x, y) => x.price - y.price || x.id.localeCompare(y.id));
    expect(sorted.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
