import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ListingsModule } from '../listings/listings.module.js';
import { SavesModule } from '../saves/saves.module.js';
import { SellerModule } from '../seller/seller.module.js';
import { ValuationModule } from '../valuation/valuation.module.js';
import { VisitorModule } from '../visitor/visitor.module.js';
import { AgentCatalog } from './agent-catalog.js';
import { AgentsController } from './agents.controller.js';
import { AgentRuntime } from './core/agent-runtime.js';
import { ConversationStore } from './core/conversation.store.js';
import { ToolDiscoveryService } from './core/tool-discovery.service.js';
import { ToolRegistry } from './core/tool-registry.js';
import { EndUserToolsService } from './end-user/end-user.tools.js';

@Module({
  imports: [DiscoveryModule, ListingsModule, SavesModule, SellerModule, ValuationModule, VisitorModule],
  controllers: [AgentsController],
  providers: [
    ToolRegistry,
    ToolDiscoveryService,
    ConversationStore,
    AgentRuntime,
    AgentCatalog,
    EndUserToolsService,
  ],
})
export class AgentsModule {}
