import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { CityPageService } from './city-page.service.js';
import { toSlug } from './city-slug.js';

/**
 * The cities we hold listings in, for the app's own footer.
 *
 * The same directory the server-rendered pages are built from, so the links in the
 * React footer and the links in the landing-page footer cannot drift apart — which
 * they would within a month if the app kept its own list.
 *
 * Under `/api/v1` like every other resource, unlike the pages themselves.
 */
@Public()
@Controller('cities')
export class CitiesController {
  constructor(private readonly cities: CityPageService) {}

  @Get()
  // Ten minutes, the same as the directory behind it. The footer is on every page and
  // the answer changes when a scrape run finds a city we had nothing in.
  @Header('Cache-Control', 'public, max-age=600')
  async list() {
    /*
     * Grouped by district on the way out and flattened with the district on each city,
     * because the two callers want it both ways: the footer lists the busiest cities
     * whatever region they are in, and the home page lays them out region by region.
     */
    const groups = await this.cities.byDistrict();

    return groups.flatMap((group) =>
      group.cities.map((entry) => ({
        city: entry.city,
        slug: toSlug(entry.city),
        /** Null for a city whose region we could not work out; it still appears. */
        district: group.name,
        counts: entry.counts,
      })),
    );
  }
}
