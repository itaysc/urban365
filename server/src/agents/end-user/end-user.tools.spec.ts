import { dtoToJsonSchema } from '../core/dto-schema.js';
import { toolsOn } from '../core/agent-tool.decorator.js';
import { estimateTokens } from '../core/tokens.js';
import { toolSchemaTokens, visibleToolSpecs } from '../core/tool-selection.js';
import { endUserAgent } from './end-user.agent.js';
import { EVAL_PROMPTS } from './eval-prompts.js';
import { endUserSystemPrompt } from './end-user.prompt.js';
import { EndUserToolsService } from './end-user.tools.js';
import { pendingToolIntake } from './tool-intake.js';
import { valuationFormCard } from './valuation-form.js';
import { asksForOneFlat, describeInfluence, pendingValuationQuestion, readValuation, userSkipped, valuationInputs } from './valuation-from-text.js';

describe('end-user assistant', () => {
  const tools = toolsOn(EndUserToolsService);

  it('registers a description and a schema for every tool', () => {
    expect(tools.length).toBeGreaterThanOrEqual(13);
    for (const tool of tools) {
      expect(tool.description.trim().length).toBeGreaterThan(0);
      if (tool.dto) expect(() => dtoToJsonSchema(tool.dto!, tool.omit)).not.toThrow();
    }
  });

  it('keeps the tool schemas inside the budget', () => {
    const specs = visibleToolSpecs(
      tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        group: tool.group,
        parameters: tool.dto ? dtoToJsonSchema(tool.dto, tool.omit) : { type: 'object' as const, properties: {} },
      })),
      [],
      endUserAgent.budget.groupThreshold,
    );

    expect(toolSchemaTokens(specs)).toBeLessThanOrEqual(endUserAgent.budget.toolSchemaTokens);
  });

  it('keeps the system prompt to the index, not the articles', () => {
    const prompt = endUserSystemPrompt();
    expect(estimateTokens(prompt)).toBeLessThan(1_200);
    expect(prompt).not.toContain('החיפוש מתחיל במקום');
  });

  it('asks for every form field the seller did not mention', () => {
    const said =
      'אני רוצה למכור דירת 4 חדרים ברחוב דב הוז בחולון. זה בניין שעבר תמ״ לפני 10 שנים. יש מרפסת 10 מטר. ממ״ד וחניה פרטית חצי מקורה. גודל הדירה 97 מ״ר. הדירה במצב סביר, דורשת שיפוץ קל. מה מחיר הדירה?';

    const stated = readValuation(said);

    expect(stated.hasMamad).toBe(true);
    expect(stated.hasParking).toBe(true);
    expect(stated.hasBalcony).toBe(true);
    expect(stated.hasStorage).toBeNull();
    expect(stated.hasLift).toBeNull();
    expect(stated.floor).toBeNull();
    expect(stated.condition).toBe('fair');
    expect(stated.renewal).toBe('none');
    expect(stated.missing).toEqual(
      expect.arrayContaining([
        'קומה',
        'מתוך כמה קומות הבניין',
        'מעלית (כן או לא)',
        'מחסן (כן או לא)',
        'מצב הבניין: חדש או מטופח, רגיל, או ישן ומוזנח',
        'נוף: פתוח, רגיל, או חסום',
        'גוש וחלקה, אם יש',
      ]),
    );
    expect(stated.missing.join('\n')).not.toMatch(/מספר חדרים|שטח רשום|רחוב$|מרפסת|ממ"ד|חניה|מצב הדירה|התחדשות/);
    expect(pendingValuationQuestion([said], undefined)).toContain('כדי לתת הערכת מחיר טובה יותר');
    const form = valuationFormCard(said);
    expect(form.components.map((component) => component.label).filter(Boolean)).toEqual(
      expect.arrayContaining(['קומה', 'מעלית', 'מחסן', 'מצב הבניין', 'נוף']),
    );
    expect(form.dataModel.address).toBe('דב הוז, חולון');
    const sheet =
      'אני רוצה הערכת שווי לדירה. בעיר חולון, רחוב דב הוז 9, 4 חדרים, 97 מ״ר, קומה 2 מתוך 4, הדירה במצב סביר, יש מרפסת, אין ממ״ד, יש חניה';
    expect(valuationInputs(sheet)).toEqual({ city: 'חולון', street: 'דב הוז 9', rooms: 4, area: 97 });
    expect(readValuation(sheet).hasParking).toBe(true);
    expect(readValuation(sheet).hasMamad).toBe(false);
    expect(readValuation(sheet).floor).toBe(2);
    expect(readValuation(sheet).topFloor).toBe(4);
    expect(form.dataModel.rooms).toBe('4');
    expect(form.dataModel.area).toBe('97');
    expect(form.dataModel.balcony).toEqual(['yes']);
    expect(form.dataModel.condition).toEqual(['fair']);
    expect(userSkipped('אין לי מעלית')).toBe(false);
    expect(userSkipped('אין לי')).toBe(true);
    expect(userSkipped('אין לי את הפרטים')).toBe(true);
    expect(asksForOneFlat('מה המחיר הממוצע לדירת 4 חדרים ברחוב ויצמן')).toBe(false);
  });

  it('stops asking once the rest of the form has been said', () => {
    const first =
      'אני רוצה למכור דירת 4 חדרים ברחוב דב הוז בחולון. יש מרפסת, ממ״ד וחניה. 97 מ״ר, מצב סביר, עבר תמ״א. מה מחיר הדירה?';
    const rest = 'קומה 3 מתוך 8, אין מעלית, אין מחסן, נוף רגיל, בניין רגיל, גוש 10 חלקה 20';

    const stated = readValuation(`${first}\n${rest}`);

    expect(stated.floor).toBe(3);
    expect(stated.topFloor).toBe(8);
    expect(stated.hasLift).toBe(false);
    expect(stated.hasStorage).toBe(false);
    expect(stated.missing).toEqual([]);
    expect(pendingValuationQuestion([first, rest], 'כדי לתת הערכת מחיר טובה יותר, הפרטים הבאים יעזרו')).toBeNull();
  });

  it('does not ask again after a partial answer', () => {
    const first =
      'אני רוצה למכור דירת 4 חדרים ברחוב דב הוז בחולון. יש מרפסת, ממ״ד וחניה. 97 מ״ר, מצב סביר, עבר תמ״א. מה מחיר הדירה?';
    const answer = 'קומה 2 מתוך 4, יש מעלית, אין מחסן, נוף רגיל די חסומת, הבניין במצב שמור';
    const stated = readValuation(`${first}\n${answer}`);

    expect(stated.floor).toBe(2);
    expect(stated.topFloor).toBe(4);
    expect(stated.hasLift).toBe(true);
    expect(stated.hasStorage).toBe(false);
    expect(stated.aspect).toBe('blocked');
    expect(stated.buildingState).toBe('well-kept');
    expect(stated.missing).toContain('גוש וחלקה, אם יש');
    expect(pendingValuationQuestion([first, answer], 'כדי לתת הערכת מחיר טובה יותר, הפרטים הבאים יעזרו')).toBeNull();
  });

  it('updates a finished valuation instead of asking again', () => {
    const first =
      'אני רוצה למכור דירת 4 חדרים ברחוב דב הוז בחולון. יש מרפסת, ממ״ד וחניה. 97 מ״ר, מצב סביר, עבר תמ״א. מה מחיר הדירה?';
    const added = 'נוף חסום, בניין במצב טוב';
    const stated = readValuation(`${first}\n${added}`);

    expect(stated.condition).toBe('fair');
    expect(stated.aspect).toBe('blocked');
    expect(stated.buildingState).toBe('well-kept');
    expect(pendingValuationQuestion([first, added], 'הטווח הוא 2,320,000 עד 2,670,000.', true)).toBeNull();

    const influence = describeInfluence(
      {
        low: 2_320_000,
        high: 2_670_000,
        parts: [
          { label: 'חניה', factor: 1.03 },
          { label: 'מרפסת', factor: 1.013 },
          { label: 'ממ"ד', factor: 1.04 },
          { label: 'מצב הדירה', factor: 0.96 },
        ],
      },
      {
        low: 2_280_000,
        high: 2_620_000,
        parts: [
          { label: 'חניה', factor: 1.03 },
          { label: 'מרפסת', factor: 1.013 },
          { label: 'ממ"ד', factor: 1.04 },
          { label: 'מצב הדירה', factor: 0.96 },
          { label: 'נוף', factor: 0.96 },
          { label: 'הבניין', factor: 1.025 },
        ],
      },
    );
    expect(influence).toContain('2,320,000');
    expect(influence).toContain('נוף −4.0%');
    expect(influence).toContain('הבניין +2.5%');
    expect(influence).not.toContain('חניה');

    const unchanged = describeInfluence(
      { low: 2_320_000, high: 2_670_000, parts: [{ label: 'נוף', factor: 0.96 }] },
      { low: 2_320_000, high: 2_670_000, parts: [{ label: 'נוף', factor: 0.96 }] },
    );
    expect(unchanged).toBe('הפרטים הנוספים לא מזיזים את ההערכה הקודמת.');
  });

  it('asks each starter for the params its tool still needs', () => {
    const mortgage = pendingToolIntake(['אני רוצה לבדוק מה יהיה ההחזר החודשי שלי במשכנתא'], undefined);
    expect(mortgage).toContain('מחיר הדירה');
    expect(mortgage).toContain('הון עצמי');
    expect(mortgage).toContain('דירה ראשונה');

    const search = pendingToolIntake(['אני מחפש דירה'], undefined);
    expect(search).toContain('עיר או שכונה');
    expect(search).toContain('מספר חדרים');
    expect(search).toContain('תקציב');

    const alert = pendingToolIntake(['אני רוצה התראה כשמתפרסמת דירה חדשה'], undefined);
    expect(alert).toContain('כדי להגדיר התראה');

    const street = pendingToolIntake(['אני רוצה לדעת מה המחיר הממוצע ברחוב'], undefined);
    expect(street).toContain('שם הרחוב');
    expect(street).toContain('עיר');

    const worth = readValuation('אני רוצה הערכת שווי לדירה שלי. הדירה במצב סביר');
    expect(worth.missing).toContain('עיר');
    expect(pendingValuationQuestion(['אני רוצה הערכת שווי לדירה שלי'], undefined)).toContain('מלאו את מה שידוע');
    expect(pendingValuationQuestion(['אני רוצה הערכת שווי לדירה. בעיר חולון, 4 חדרים'], undefined)).toBeNull();
    expect(pendingToolIntake(['אני מחפש דירה למכירה, בעיר תל אביב, 4 חדרים, עד 3000000'], undefined)).toBeNull();
    expect(pendingToolIntake(['אני רוצה התראה כשמתפרסמת דירה חדשה, בעיר חולון, 4 חדרים, עד 2500000'], undefined)).toBeNull();
    expect(
      pendingToolIntake(
        ['אני רוצה לבדוק מה יהיה ההחזר החודשי שלי במשכנתא. מחיר הדירה 2000000 ש״ח, הון עצמי 500000 ש״ח, דירה ראשונה'],
        undefined,
      ),
    ).toBeNull();
    expect(pendingToolIntake(['אני רוצה לדעת מה המחיר הממוצע ברחוב ויצמן בעיר חולון'], undefined)).toBeNull();
    expect(valuationFormCard('אני רוצה הערכת שווי לדירה שלי').dataModel.address).toBe('');

    expect(
      pendingToolIntake(
        ['אני רוצה לבדוק מה יהיה ההחזר החודשי שלי במשכנתא', '2 מיליון, 500 אלף הון עצמי, דירה ראשונה'],
        'כדי לחשב את ההחזר החודשי, הפרטים הבאים יעזרו',
      ),
    ).toBeNull();
    expect(pendingToolIntake(['דירות 4 חדרים בתל אביב עד 3 מיליון'], undefined)).toBeNull();
    expect(pendingToolIntake(['מה המחיר הממוצע לדירת 4 חדרים ברחוב ויצמן בחולון'], undefined)).toBeNull();
  });

  it('points every evaluation prompt at a tool that exists', () => {
    const names = new Set(tools.map((tool) => tool.name));
    expect(EVAL_PROMPTS.length).toBeGreaterThanOrEqual(20);
    for (const item of EVAL_PROMPTS) expect(names.has(item.tool)).toBe(true);
  });
});
