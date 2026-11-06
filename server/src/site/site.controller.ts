import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator.js';

/**
 * Asked before anyone is signed in, which is the whole point: the client has to know
 * whether to blur the home page before it has a session to ask with.
 */
@Public()
@Controller('site')
export class SiteController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  state() {
    return { closed: this.config.get<boolean>('app.siteClosed') === true };
  }
}
