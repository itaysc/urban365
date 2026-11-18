/**
 * Questions a CRM person actually asks, and the tool that should be picked first.
 *
 * `server/src/scripts/eval-agent.ts --agency` asks the model. The spec only checks that
 * every expected tool is one the assistant really has — a renamed tool fails here, not
 * in a conversation nobody is watching.
 */
export const AGENCY_EVAL_PROMPTS: { prompt: string; tool: string }[] = [
  { prompt: 'מה חשוב היום', tool: 'today_overview' },
  { prompt: 'תן לי סקירה של הבוקר', tool: 'today_overview' },
  { prompt: 'תחפש לי את הלקוח ישראל ישראלי', tool: 'find_customers' },
  { prompt: 'מי הלקוחות בחולון', tool: 'find_customers' },
  { prompt: 'תפתח את פרטי הלקוח cmvu0ayux0046xzh0ifihzgx6', tool: 'customer_details' },
  { prompt: 'תוסיף לקוח חדש בשם דנה כהן, טלפון 052-1112233', tool: 'create_customer' },
  { prompt: 'תעדכן את ההערות של הלקוח cmvu0ayux0046xzh0ifihzgx6 ל"מחפש בחולון"', tool: 'update_customer' },
  { prompt: 'אילו פניות חדשות יש', tool: 'find_leads' },
  { prompt: 'תוסיף פנייה חדשה בשם רועי לוי', tool: 'create_lead' },
  { prompt: 'תעביר את הפנייה cmvu0ayux0046xzh0ifihzgx6 לסטטוס ביקור', tool: 'update_lead' },
  { prompt: 'מה המצב בלוח העסקאות', tool: 'deal_board' },
  { prompt: 'תפתח עסקה חדשה לדירה ברחובות', tool: 'create_deal' },
  { prompt: 'תעביר את העסקה cmvu0ayux0046xzh0ifihzgx6 למשא ומתן', tool: 'update_deal_stage' },
  { prompt: 'מה הפגישות שלי השבוע', tool: 'upcoming_meetings' },
  { prompt: 'יש מעקבים שממתינים?', tool: 'follow_ups' },
  { prompt: 'תקבע סיור מחר ב־10:00 עם הלקוח cmvu0ayux0046xzh0ifihzgx6', tool: 'create_meeting' },
  { prompt: 'תרשום שהסיור cmvu0ayux0046xzh0ifihzgx6 הסתיים במעוניין', tool: 'record_viewing_feedback' },
  { prompt: 'תסמן את המעקב cmvu0ayux0046xzh0ifihzgx6 כבוצע', tool: 'complete_follow_up' },
  { prompt: 'מה מתאים לישראל מהנכסים שלנו', tool: 'match_customer_listings' },
  { prompt: 'איזה נכס מפורסם מתאים ללקוח cmvu0ayux0046xzh0ifihzgx6', tool: 'match_customer_listings' },
  { prompt: 'מה הנכסים שפורסמו אצלנו', tool: 'my_listings' },
  { prompt: 'מה המצב בלוח תיקי המשכנתא', tool: 'mortgage_case_board' },
  { prompt: 'תחפש תיק משכנתא על שם ישראל', tool: 'find_mortgage_cases' },
  { prompt: 'תפתח את תיק המשכנתא cmvu0ayux0046xzh0ifihzgx6', tool: 'mortgage_case_details' },
  { prompt: 'תפתח תיק משכנתא חדש ללקוח cmvu0ayux0046xzh0ifihzgx6 על מיליון וחצי', tool: 'create_mortgage_case' },
  { prompt: 'תעביר את תיק המשכנתא cmvu0ayux0046xzh0ifihzgx6 לשלב מסמכים', tool: 'update_mortgage_case_stage' },
  { prompt: 'מי איש הקשר שלנו בבנק לאומי', tool: 'find_banker_contacts' },
  { prompt: 'תוסיף איש קשר בבנק הפועלים בשם רונית, טלפון 03-1234567', tool: 'create_banker_contact' },
];
