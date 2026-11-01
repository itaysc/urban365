/** The parts of a brief that may cross to another agency. */
export interface SummarisableBrief {
  lookingSection: string | null;
  lookingCities: string[];
  lookingTypes: string[];
  minRooms: number | null;
  maxRooms: number | null;
  minSquareMeter: number | null;
}

const SECTION: Record<string, string> = {
  forsale: 'לקנייה',
  rent: 'לשכירות',
  commercial: 'מסחרי',
};

/**
 * What a buyer is looking for, in a sentence another agency may read.
 *
 * The price is left out on purpose, and it is the only interesting decision here. A
 * match means the listing is already inside the buyer's budget, so the other agency
 * learns nothing by being told the ceiling — except how much room there is above the
 * asking price, which is exactly what their seller would like to know and exactly what
 * the buyer is entitled to keep. Rooms, city and type say enough to judge the fit.
 */
export function briefSummary(brief: SummarisableBrief): string {
  const parts: string[] = [];

  const rooms =
    brief.minRooms !== null && brief.maxRooms !== null && brief.minRooms !== brief.maxRooms
      ? `${brief.minRooms}–${brief.maxRooms} חדרים`
      : brief.minRooms !== null
        ? `${brief.minRooms} חדרים ומעלה`
        : brief.maxRooms !== null
          ? `עד ${brief.maxRooms} חדרים`
          : null;

  if (brief.lookingTypes.length > 0) parts.push(brief.lookingTypes.join(' / '));
  if (rooms) parts.push(rooms);
  if (brief.minSquareMeter !== null) parts.push(`מ-${brief.minSquareMeter} מ״ר`);
  if (brief.lookingCities.length > 0) parts.push(`ב${brief.lookingCities.join(' / ')}`);
  if (brief.lookingSection && SECTION[brief.lookingSection]) {
    parts.push(SECTION[brief.lookingSection]);
  }

  // A brief with nothing stated still produces a request — the agent chose to send it
  // — so it says so rather than arriving as an empty line.
  return parts.length > 0 ? `מחפש ${parts.join(', ')}` : 'לא פורטו דרישות';
}
