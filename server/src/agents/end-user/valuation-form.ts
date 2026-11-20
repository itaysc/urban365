import type { A2UIComponent, AgentCard } from '../core/agent.types.js';
import { readValuation } from './valuation-from-text.js';

const YES_NO = [
  { label: 'כן', value: 'yes' },
  { label: 'לא', value: 'no' },
];

const CONDITION = [
  { label: 'משופצת', value: 'renovated' },
  { label: 'במצב טוב', value: 'good' },
  { label: 'במצב סביר', value: 'fair' },
  { label: 'דורשת שיפוץ', value: 'needs-renovation' },
];

const BUILDING = [
  { label: 'חדש או מטופח', value: 'well-kept' },
  { label: 'רגיל', value: 'ordinary' },
  { label: 'ישן ומוזנח', value: 'neglected' },
];

const ASPECT = [
  { label: 'פתוח ומואר', value: 'open' },
  { label: 'רגיל', value: 'ordinary' },
  { label: 'חסום', value: 'blocked' },
];

const RENEWAL = [
  { label: 'תמ"א שאושרה', value: 'approved' },
  { label: 'אין תוכנית', value: 'none' },
  { label: 'עבודות בעיצומן', value: 'in-works' },
];

/**
 * The valuation sheet as one A2UI v1 surface.
 *
 * Fields the person already named are filled in. The rest stay empty, and
 * submitting only the filled ones is enough.
 */
export function valuationFormCard(said: string): Extract<AgentCard, { type: 'a2ui' }> {
  const stated = readValuation(said);
  const context = Object.fromEntries(
    ['city', 'street', 'rooms', 'area', 'floor', 'topFloor', 'gush', 'chelka', 'condition', 'balcony', 'mamad', 'lift', 'parking', 'storage', 'building', 'aspect', 'renewal'].map(
      (key) => [key, { '@path': `/${key}` }],
    ),
  );

  const components: A2UIComponent[] = [
    { id: 'root', component: 'Card', child: 'form' },
    {
      id: 'form',
      component: 'Column',
      children: ['title', 'place', 'size', 'home', 'floor', 'condition', 'home-yes', 'block', 'building', 'block-yes', 'around', 'aspect', 'renewal', 'parcel', 'submit'],
    },
    { id: 'title', component: 'Text', text: 'הערכת שווי', variant: 'body' },
    { id: 'place', component: 'Row', children: ['city', 'street'] },
    textField('city', 'עיר', 'shortText', 'חולון'),
    textField('street', 'רחוב', 'shortText', 'דב הוז'),
    { id: 'size', component: 'Row', children: ['rooms', 'area'] },
    textField('rooms', 'חדרים', 'number', '4'),
    textField('area', 'שטח במ״ר', 'number', '97'),
    { id: 'home', component: 'Text', text: 'הדירה', variant: 'caption' },
    { id: 'floor', component: 'Row', children: ['floor-no', 'top-floor'] },
    textField('floor-no', 'קומה', 'number', '3'),
    textField('top-floor', 'מתוך קומה', 'number', '8'),
    choice('condition', 'מצב הדירה', CONDITION),
    { id: 'home-yes', component: 'Row', children: ['balcony', 'mamad'] },
    choice('balcony', 'מרפסת', YES_NO),
    choice('mamad', 'ממ"ד', YES_NO),
    { id: 'block', component: 'Text', text: 'הבניין', variant: 'caption' },
    choice('building', 'מצב הבניין', BUILDING),
    { id: 'block-yes', component: 'Row', children: ['lift', 'parking', 'storage'] },
    choice('lift', 'מעלית', YES_NO),
    choice('parking', 'חניה', YES_NO),
    choice('storage', 'מחסן', YES_NO),
    { id: 'around', component: 'Text', text: 'הסביבה והרישום', variant: 'caption' },
    choice('aspect', 'נוף', ASPECT),
    choice('renewal', 'התחדשות עירונית', RENEWAL),
    { id: 'parcel', component: 'Row', children: ['gush', 'chelka'] },
    textField('gush', 'גוש', 'number'),
    textField('chelka', 'חלקה', 'number'),
    { id: 'submit-label', component: 'Text', text: 'חשב טווח שווי' },
    {
      id: 'submit',
      component: 'Button',
      variant: 'primary',
      child: 'submit-label',
      action: { event: { name: 'submit_valuation', context } },
    },
  ];

  return {
    type: 'a2ui',
    surfaceId: 'valuation',
    components,
    dataModel: {
      city: placeName(said),
      street: streetName(said),
      rooms: roomsOf(said),
      area: areaOf(said),
      floor: stated.floor === null ? '' : String(stated.floor),
      topFloor: stated.topFloor === null ? '' : String(stated.topFloor),
      gush: stated.gush === null ? '' : String(stated.gush),
      chelka: stated.chelka === null ? '' : String(stated.chelka),
      condition: stated.condition ? [stated.condition] : [],
      balcony: yesNo(stated.hasBalcony),
      mamad: yesNo(stated.hasMamad),
      lift: yesNo(stated.hasLift),
      parking: yesNo(stated.hasParking),
      storage: yesNo(stated.hasStorage),
      building: stated.buildingState ? [stated.buildingState] : [],
      aspect: stated.aspect ? [stated.aspect] : [],
      renewal: stated.renewal ? [stated.renewal] : [],
    },
  };
}

function textField(id: string, label: string, variant: string, placeholder?: string): A2UIComponent {
  const path = id === 'floor-no' ? '/floor' : id === 'top-floor' ? '/topFloor' : `/${id}`;
  return { id, component: 'TextField', label, variant, ...(placeholder ? { placeholder } : {}), value: { '@path': path } };
}

function choice(id: string, label: string, options: { label: string; value: string }[]): A2UIComponent {
  return {
    id,
    component: 'ChoicePicker',
    label,
    variant: 'mutuallyExclusive',
    options,
    value: { '@path': `/${id}` },
  };
}

function yesNo(value: boolean | null): string[] {
  if (value === true) return ['yes'];
  if (value === false) return ['no'];
  return [];
}

function placeName(text: string): string {
  const named = text.match(/בעיר\s+([א-ת]{2,}(?:\s+[א-ת]{2,})?)/);
  if (named) return named[1];
  const stops = new Set(['דירה', 'דירת', 'רחוב', 'משכנתא', 'מצב', 'בניין', 'קומה']);
  for (const match of text.matchAll(/(?:^|\s)ב([א-ת]{2,}(?:\s+[א-ת]{2,})?)/g)) {
    const [first, second] = match[1].split(/\s+/);
    if (!stops.has(first)) return second ? `${first} ${second}` : first;
  }
  return '';
}

function streetName(text: string): string {
  const match = text.match(/רחוב\s+(.+?)(?:\s+ב[א-ת]|$)/);
  return match?.[1]?.replace(/[.,]$/, '').trim() ?? '';
}

function roomsOf(text: string): string {
  const match = text.match(/(\d+(?:\.\d)?)\s*חדר/);
  return match?.[1] ?? '';
}

function areaOf(text: string): string {
  const match = text.match(/(\d+)\s*מ["״']ר/);
  return match?.[1] ?? '';
}
