import {
  MORTGAGE_CASE_STAGES,
  type MortgageCase,
  type MortgageCaseBoard,
  type MortgageCaseStage,
} from '@/services/crm';

/** The totals strip under each column heading, the same shape `DealBoard`'s is. */
function totalsFor(cases: MortgageCase[]) {
  return {
    count: cases.length,
    requested: cases.reduce((sum, c) => sum + (c.requestedAmount ?? 0), 0),
  };
}

/**
 * The board with one case moved to another column. Pure, for the same reason
 * `moveDeal` is: a card has to land in its new column the moment the mouse releases,
 * not a round trip later.
 */
export function moveMortgageCase(
  board: MortgageCaseBoard,
  caseId: string,
  to: MortgageCaseStage,
): MortgageCaseBoard {
  const from = MORTGAGE_CASE_STAGES.map((s) => s.value).find((stage) =>
    board.columns[stage]?.some((c) => c.id === caseId),
  );
  if (from === undefined || from === to) return board;

  const found = board.columns[from].find((c) => c.id === caseId);
  if (!found) return board;

  const columns = { ...board.columns };
  columns[from] = columns[from].filter((c) => c.id !== caseId);
  columns[to] = [{ ...found, stage: to }, ...(columns[to] ?? [])];

  const totals = { ...board.totals };
  totals[from] = totalsFor(columns[from]);
  totals[to] = totalsFor(columns[to]);

  return { columns, totals };
}
