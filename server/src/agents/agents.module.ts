import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AgencyModule } from '../agency/agency.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { CrmModule } from '../crm/crm.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { SavesModule } from '../saves/saves.module.js';
import { SellerModule } from '../seller/seller.module.js';
import { ValuationModule } from '../valuation/valuation.module.js';
import { VisitorModule } from '../visitor/visitor.module.js';
import { AgencyToolsService } from './agency/agency.tools.js';
import { AgentCatalog } from './agent-catalog.js';
import { AgentsController } from './agents.controller.js';
import { AgentRuntime } from './core/agent-runtime.js';
import { ConversationStore } from './core/conversation.store.js';
import { ToolDiscoveryService } from './core/tool-discovery.service.js';
import { ToolRegistry } from './core/tool-registry.js';
import { EndUserToolsService } from './end-user/end-user.tools.js';

@Module({
  imports: [
    DiscoveryModule,
    ListingsModule,
    SavesModule,
    SellerModule,
    ValuationModule,
    VisitorModule,
    CrmModule,
    CalendarModule,
    AgencyModule,
  ],
  controllers: [AgentsController],
  providers: [
    ToolRegistry,
    ToolDiscoveryService,
    ConversationStore,
    AgentRuntime,
    AgentCatalog,
    EndUserToolsService,
    AgencyToolsService,
  ],
})
export class AgentsModule {}
