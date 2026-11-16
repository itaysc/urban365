import { Global, Module } from '@nestjs/common';
import { AgentExclude } from '../agents/core/agent-exclude.js';
import { MailService } from './mail.service.js';

@Global()
@AgentExclude()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
