/**
 * Short Hebrew labels for confirm cards. Kept here so the model never invents the
 * wording that the person has to approve.
 */
const LABELS: Record<string, string> = {
  create_customer: 'ליצור לקוח',
  update_customer: 'לעדכן לקוח',
  create_lead: 'ליצור פנייה',
  update_lead: 'לעדכן פנייה',
  create_deal: 'ליצור עסקה',
  update_deal_stage: 'לשנות שלב בעסקה',
  create_meeting: 'לקבוע פגישה',
  record_viewing_feedback: 'לרשום סיכום סיור',
  complete_follow_up: 'לסמן מעקב כבוצע',
  create_mortgage_case: 'לפתוח תיק משכנתא',
  update_mortgage_case_stage: 'לשנות שלב בתיק משכנתא',
  create_banker_contact: 'להוסיף איש קשר בבנק',
};

export function confirmLabel(toolName: string): string {
  return LABELS[toolName] ?? `לבצע: ${toolName}`;
}

/** One line the person can scan, with no phone or email. */
export function confirmDetail(toolName: string, args: unknown): string {
  if (typeof args !== 'object' || args === null) return confirmLabel(toolName);
  const row = args as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof row.name === 'string' && row.name.trim()) bits.push(row.name.trim());
  if (typeof row.bankName === 'string' && row.bankName.trim()) bits.push(row.bankName.trim());
  if (typeof row.title === 'string' && row.title.trim()) bits.push(row.title.trim());
  if (typeof row.id === 'string' && row.id.trim()) bits.push(`מזהה ${row.id.trim()}`);
  if (typeof row.stage === 'string' && row.stage.trim()) bits.push(`שלב ${row.stage.trim()}`);
  if (typeof row.outcome === 'string' && row.outcome.trim()) bits.push(row.outcome.trim());
  if (typeof row.startsAt === 'string' && row.startsAt.trim()) bits.push(row.startsAt.trim().slice(0, 16).replace('T', ' '));
  if (typeof row.requestedAmount === 'number') bits.push(`${row.requestedAmount.toLocaleString('he-IL')} ₪`);
  return bits.length > 0 ? bits.join(' · ') : confirmLabel(toolName);
}
