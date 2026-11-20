/** Turns the valuation form's data model into the sentence the assistant already understands. */
export function valuationReply(data: Record<string, unknown>): string {
  const text = (key: string) => (typeof data[key] === 'string' ? data[key].trim() : '');
  const choice = (key: string) => (Array.isArray(data[key]) && typeof data[key][0] === 'string' ? data[key][0] : '');
  const parts: string[] = [];

  if (text('city')) parts.push(`בעיר ${text('city')}`);
  if (text('street')) parts.push(`רחוב ${text('street')}`);
  if (text('rooms')) parts.push(`${text('rooms')} חדרים`);
  if (text('area')) parts.push(`${text('area')} מ״ר`);
  if (text('floor') && text('topFloor')) parts.push(`קומה ${text('floor')} מתוך ${text('topFloor')}`);
  else if (text('floor')) parts.push(`קומה ${text('floor')}`);
  else if (text('topFloor')) parts.push(`${text('topFloor')} קומות`);

  const condition: Record<string, string> = {
    renovated: 'הדירה משופצת',
    good: 'הדירה במצב טוב',
    fair: 'הדירה במצב סביר',
    'needs-renovation': 'הדירה דורשת שיפוץ יסודי',
  };
  if (condition[choice('condition')]) parts.push(condition[choice('condition')]);

  const yesNo = (key: string, noun: string) => {
    if (choice(key) === 'yes') parts.push(`יש ${noun}`);
    if (choice(key) === 'no') parts.push(`אין ${noun}`);
  };
  yesNo('balcony', 'מרפסת');
  yesNo('mamad', 'ממ״ד');
  yesNo('lift', 'מעלית');
  yesNo('parking', 'חניה');
  yesNo('storage', 'מחסן');

  const building: Record<string, string> = {
    'well-kept': 'הבניין מטופח',
    ordinary: 'הבניין רגיל',
    neglected: 'הבניין מוזנח',
  };
  if (building[choice('building')]) parts.push(building[choice('building')]);

  const aspect: Record<string, string> = {
    open: 'נוף פתוח',
    ordinary: 'נוף רגיל',
    blocked: 'נוף חסום',
  };
  if (aspect[choice('aspect')]) parts.push(aspect[choice('aspect')]);

  const renewal: Record<string, string> = {
    approved: 'תמ״א מאושרת',
    none: 'אין תוכנית התחדשות',
    'in-works': 'התחדשות בעיצומה',
  };
  if (renewal[choice('renewal')]) parts.push(renewal[choice('renewal')]);

  if (text('gush') && text('chelka')) parts.push(`גוש ${text('gush')} חלקה ${text('chelka')}`);
  return parts.join(', ');
}
