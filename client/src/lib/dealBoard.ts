import { DEAL_STAGES, type Deal, type DealBoard, type DealStage } from '@/services/crm';

/** The totals strip under each column heading, worked out from the column itself. */
function totalsFor(deals: Deal[]) {
  return {
    count: deals.length,
    value: deals.reduce((sum, deal) => sum + (deal.price ?? 0), 0),
    commission: deals.reduce((sum, deal) => sum + (deal.commission ?? 0), 0),
  };
}

/**
 * The board with one deal moved to another column.
 *
 * Pure, so the card can arrive in its new column on the frame the mouse is released
 * rather than a round trip later. Dragging something and watching it snap back for half
 * a second reads as the drop having failed, and the second attempt is what actually
 * creates the double-move.
 *
 * The totals are recomputed from the columns rather than adjusted by the moved deal's
 * own figures: recomputing cannot drift, and there are never more than a few hundred
 * cards in front of somebody.
 *
 * Returns the board unchanged when there is nothing to do, so a drop onto the column a
 * card is already in costs no render and no request.
 */
export function moveDeal(board: DealBoard, dealId: string, to: DealStage): DealBoard {
  const from = DEAL_STAGES.map((s) => s.value).find((stage) =>
    board.columns[stage]?.some((deal) => deal.id === dealId),
  );

  if (from === undefined || from === to) return board;

  const deal = board.columns[from].find((d) => d.id === dealId);
  if (!deal) return board;

  const columns = { ...board.columns };
  columns[from] = columns[from].filter((d) => d.id !== dealId);
  // Newest first, which is the order the board arrives in.
  columns[to] = [{ ...deal, stage: to }, ...(columns[to] ?? [])];

  const totals = { ...board.totals };
  totals[from] = totalsFor(columns[from]);
  totals[to] = totalsFor(columns[to]);

  return { columns, totals };
}

/** Which column a deal is in, or null if the board does not hold it. */
export function stageOf(board: DealBoard, dealId: string): DealStage | null {
  return (
    DEAL_STAGES.map((s) => s.value).find((stage) =>
      board.columns[stage]?.some((deal) => deal.id === dealId),
    ) ?? null
  );
}
