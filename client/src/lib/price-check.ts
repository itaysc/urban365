/** The sentence the server computed for one asking price. The percent is not ours to edit. */
export interface PriceCheck {
  id: string;
  basis: 'sales' | 'asking';
  stance: 'within' | 'above' | 'below';
  gapPercent: number;
  headline: string;
  detail: string;
  questions: string[];
}
