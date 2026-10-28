import type { Section } from '@/types/yad2';

export const SECTIONS: Section[] = ['forsale', 'rent', 'commercial'];

export const isSection = (value: string | null): value is Section =>
  value !== null && SECTIONS.includes(value as Section);

/**
 * Accepts "6816047" or any yad2 agency URL. Mirrors the server's own parser — the
 * client needs the id up front to put it in the route.
 */
export function parseAgencyInput(input: string): { agencyId: string; section: Section | null } {
  const trimmed = input.trim();

  const fromUrl = trimmed.match(/\/agency\/(\d+)(?:\/(forsale|rent|commercial))?/);
  if (fromUrl) return { agencyId: fromUrl[1], section: (fromUrl[2] as Section) ?? null };

  if (/^\d+$/.test(trimmed)) return { agencyId: trimmed, section: null };

  throw new Error(`לא זוהה מספר סוכנות בקלט "${input}".`);
}
