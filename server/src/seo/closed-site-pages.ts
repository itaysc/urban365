import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { EMPTY, type Observable } from 'rxjs';

/**
 * The city and listing pages are the public site, rendered as HTML and proxied onto
 * the same domain as the app. While the site is closed they go back to the home page,
 * which is where a guest meets the login. Not cached: the moment the flag flips, the
 * old redirect must not keep answering.
 */
@Injectable()
export class ClosedSitePages implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.config.get<boolean>('app.siteClosed') !== true) return next.handle();

    const http = context.switchToHttp();
    const path = http.getRequest<Request>().path ?? '';
    if (!path.startsWith('/nadlan')) return next.handle();

    const appUrl = (this.config.get<string>('mail.appUrl') ?? '').replace(/\/$/, '');
    const res = http.getResponse<Response>();
    res.setHeader('Cache-Control', 'private, no-store');
    res.redirect(302, `${appUrl}/`);
    return EMPTY;
  }
}
