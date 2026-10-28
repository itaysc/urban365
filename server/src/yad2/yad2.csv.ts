/**
 * Flattens the API shapes into CSV. Column names are the snake_case form of the field
 * names the API already uses, so the files and the JSON stay in step with one mapping.
 */
import type { AgencyResult, Asset, AgencySummary, TeamMember } from './yad2.types.js';

export type CsvKind = 'assets' | 'team' | 'agency';

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;

const snake = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const cell = (value: Cell): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Row[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(snake).join(','),
    ...rows.map((r) => headers.map((h) => cell(r[h])).join(',')),
  ];
  // Excel needs the BOM to read the Hebrew as UTF-8.
  return `﻿${lines.join('\n')}\n`;
}

/** Images are deliberately left out — only the count. */
function assetRow(asset: Asset): Row {
  const { tags, amenities, imageUrls, coverImageUrl, ...rest } = asset;
  void imageUrls;
  void coverImageUrl;
  return {
    ...rest,
    tags: tags.join('|'),
    // Only what the property actually has; the absent rows exist for the UI grid.
    amenities: amenities.filter((a) => a.present).map((a) => a.label).join('|'),
  };
}

function agencyRow(agency: AgencySummary, meta: AgencyResult['meta']): Row {
  const { counts, openingHours, ...rest } = agency;
  return {
    ...rest,
    assetsForSaleCount: counts.forSale,
    assetsForRentCount: counts.forRent,
    commercialAssetsCount: counts.commercial,
    openingHours: openingHours.map((h) => `${h.day} ${h.open}-${h.close}`).join('; '),
    scrapedSection: meta.section,
    scrapedAt: meta.scrapedAt,
  };
}

const teamRow = (member: TeamMember, agency: AgencySummary): Row => ({
  agencyId: agency.agencyId,
  agencyName: agency.name,
  ...member,
});

export function buildCsv(result: AgencyResult, kind: CsvKind): string {
  switch (kind) {
    case 'assets':
      return toCsv(result.assets.map(assetRow));
    case 'team':
      return toCsv(result.team.map((m) => teamRow(m, result.agency)));
    case 'agency':
      return toCsv([agencyRow(result.agency, result.meta)]);
  }
}

export const csvFilename = (result: AgencyResult, kind: CsvKind): string =>
  `yad2-${result.meta.agencyId}-${result.meta.section}-${kind}.csv`;
