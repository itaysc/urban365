import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The cookie naming a browser with no account.
 *
 * Not a session: it grants nothing and carries no privileges. It exists so that the
 * things a person does without signing in — keeping a flat, opening one — belong to
 * somebody rather than to nobody.
 */
export const VISITOR_COOKIE = 'nadlan_visitor';

/** A year. Long enough to be worth having, short enough that an abandoned one expires. */
export const VISITOR_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** A browser we have issued an identifier to. */
export interface Visitor {
  kind: 'visitor';
  visitorId: string;
}

/**
 * The one place the anonymous identifier is written to a browser.
 *
 * Shared rather than repeated because the flags are the point: `httpOnly` so an XSS
 * cannot lift it and nothing in the page can hand it to a third party, `lax` so another
 * site cannot cause it to be sent at all. A second copy of this with one flag missing
 * would be a silent downgrade.
 */
export function setVisitorCookie(res: Response, visitorId: string, isProduction: boolean): void {
  res.cookie(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: VISITOR_TTL_MS,
  });
}

/**
 * Who a browser is, when there is no account.
 *
 * Its own service rather than part of saving, because two features now need it — the
 * saved list and a seller's view counts — and a cycle between their modules is not a
 * reason to keep two copies of the same identity.
 */
@Injectable()
export class VisitorService {
  constructor(private readonly prisma: PrismaService) {}

  /** The browser behind this cookie, if it is one we issued and have not already merged. */
  async existing(id: string | undefined): Promise<Visitor | null> {
    if (!id) return null;
    const visitor = await this.prisma.visitor.findUnique({
      where: { id },
      select: { id: true, mergedIntoProfileId: true },
    });
    // A merged visitor is spent: its saves now belong to an account, and letting the
    // same cookie start a second collection would hide them from the person who made them.
    if (!visitor || visitor.mergedIntoProfileId) return null;
    return { kind: 'visitor', visitorId: visitor.id };
  }

  async create(): Promise<Visitor> {
    const visitor = await this.prisma.visitor.create({ data: {}, select: { id: true } });
    return { kind: 'visitor', visitorId: visitor.id };
  }
}
