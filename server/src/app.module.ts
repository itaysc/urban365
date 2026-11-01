import { CalendarModule } from './calendar/calendar.module.js';
import { MatchingModule } from './matching/matching.module.js';
import { DemoModule } from './demo/demo.module.js';
import { CoBrokerageModule } from './cobrokerage/cobrokerage.module.js';
import { AlertsModule } from './alerts/alerts.module.js';
import { LlmModule } from './llm/llm.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { BuyerModule } from './buyer/buyer.module.js';
import { CrmModule } from './crm/crm.module.js';
import { StorageModule } from './storage/storage.module.js';
import { AgencyModule } from './agency/agency.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CsrfGuard } from './auth/guards/csrf.guard.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import configuration from './config/configuration.js';
import { HealthModule } from './health/health.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { SavesModule } from './saves/saves.module.js';
import { SellerModule } from './seller/seller.module.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';
import { TenantInterceptor } from './tenancy/tenant.interceptor.js';
import { Yad2Module } from './yad2/yad2.module.js';

@Module({
  imports: [
    StorageModule,
    BuyerModule,
    CrmModule,
    CalendarModule,
    MatchingModule,
    DemoModule,
    CoBrokerageModule,
    AlertsModule,
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // In-memory, so per-instance and reset on deploy — correct for one Railway instance.
    // A Postgres-backed limiter would put write amplification on the attacked path.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    // AsyncLocalStorage rather than request-scoped providers: request scope is viral,
    // and the scrape job runs detached from any request where it would simply throw.
    ClsModule.forRoot({ global: true, middleware: { mount: false } }),
    PrismaModule,
    LlmModule,
    TenancyModule,
    MailModule,
    AuthModule,
    HealthModule,
    Yad2Module,
    ListingsModule,
    SavesModule,
    SellerModule,
    AgencyModule,
    AdminModule,
  ],
  // Order matters: rate limit, then CSRF, then identity, then authorization.
  // A global JwtAuthGuard makes authentication the default; open routes say @Public().
  providers: [
    // Runs after the guards, so req.principal already exists when the context is built.
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
