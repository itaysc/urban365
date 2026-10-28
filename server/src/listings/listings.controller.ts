import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { SearchListingsDto } from './dto/search-listings.dto.js';
import { ListingsService } from './listings.service.js';

/** The public storefront: searchable without an account. */
@Public()
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  /** Faceted search across every agency we hold. */
  @Get('search')
  search(@Query() query: SearchListingsDto) {
    return this.listings.search(query);
  }

  /** Accepts our listing id, and for one release yad2's token, so old links survive. */
  @Get(':id')
  async byId(@Param('id') id: string) {
    const listing = await this.listings.findById(id);
    if (!listing) throw new NotFoundException(`No listing ${id}.`);
    return listing;
  }
}
