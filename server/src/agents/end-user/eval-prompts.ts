/**
 * Questions a person actually asks, and the tool that should be picked first.
 *
 * `server/src/scripts/eval-agent.ts` asks the model. The spec only checks that every
 * expected tool is one the assistant really has — a renamed tool fails here, not in a
 * conversation nobody is watching.
 */
export const EVAL_PROMPTS: { prompt: string; tool: string }[] = [
  { prompt: 'דירות 4 חדרים בתל אביב עד 3 מיליון', tool: 'search_listings' },
  { prompt: 'מה יש להשכרה בחיפה עם מרפסת', tool: 'search_listings' },
  { prompt: 'תמצא לי משהו קטן ברמת גן', tool: 'search_listings' },
  { prompt: 'ספר לי על הנכס cmvu0ayux0046xzh0ifihzgx6', tool: 'get_listing' },
  { prompt: 'איך כותבים את שם השכונה פלורנטין', tool: 'resolve_place' },
  { prompt: 'יש רחוב הרצל בחולון?', tool: 'resolve_place' },
  { prompt: 'כמה עולה דירה בנתניה', tool: 'area_prices' },
  { prompt: 'מה היסטוריית המחירים ברחוב ויצמן בחולון', tool: 'street_price_history' },
  { prompt: 'מה המחיר הממוצע לדירת 4 חדרים ברחוב ויצמן בחולון', tool: 'street_price_history' },
  { prompt: 'מה המחיר למטר בבאר שבע', tool: 'area_prices' },
  { prompt: 'תעריך דירת 4 חדרים, 100 מטר, ברחובות', tool: 'estimate_value' },
  { prompt: 'מה השווי של 3 חדרים 80 מטר בגבעתיים', tool: 'estimate_value' },
  { prompt: 'כמה החזר על דירה של 2 מיליון עם 500 אלף הון עצמי, דירה ראשונה', tool: 'mortgage_plan' },
  { prompt: 'האם 40 אחוז מימון מספיק למשפרי דיור', tool: 'mortgage_plan' },
  { prompt: 'מרוויחים 20 אלף נטו ויש 400 אלף. איזו דירה אפשר', tool: 'affordability' },
  { prompt: 'המשכורת 15 אלף וההוצאות בערך 7. כמה נשאר למשכנתא', tool: 'affordability' },
  { prompt: 'תשווה תמהיל שליש קבועה שליש פריים על מיליון', tool: 'compare_mix' },
  { prompt: 'מה זה לוח שפיצר', tool: 'get_article' },
  { prompt: 'כמה הון עצמי צריך לדירה ראשונה', tool: 'get_article' },
  { prompt: 'תשמור לי את הנכס הזה', tool: 'save_listing' },
  { prompt: 'מה שמרתי עד עכשיו', tool: 'list_saved' },
  { prompt: 'תתריע לי כשיש 4 חדרים בחיפה עד 2 מיליון', tool: 'create_saved_search' },
  { prompt: 'אני רוצה לפרסם דירה למכירה בחולון, 4 חדרים, 1.8 מיליון', tool: 'draft_listing' },
  { prompt: 'תפתח לי את מחשבון המשכנתא', tool: 'open_page' },
];
