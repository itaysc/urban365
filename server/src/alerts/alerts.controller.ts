import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { SaveSearchDto, UpdateSavedSearchDto } from './dto/saved-search.dto.js';
import { SavedSearchesService } from './saved-searches.service.js';

/**
 * A buyer's saved searches.
 *
 * No `TenantGuard`: these belong to a person, not to an agency, and a buyer has no
 * agency at all. The global auth guard still requires a session, and the row policy
 * compares the user.
 */
@Controller('my/searches')
export class SavedSearchesController {
  constructor(private readonly searches: SavedSearchesService) {}

  @Get()
  list() {
    return this.searches.list();
  }

  @Post()
  create(@Body() dto: SaveSearchDto) {
    return this.searches.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSavedSearchDto) {
    return this.searches.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.searches.remove(id);
  }
}
