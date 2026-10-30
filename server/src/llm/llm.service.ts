import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmConfig } from '../config/configuration.js';
import { OpenAIIntegration } from './providers/openai.integration.js';
import {
  LLMIntegration,
  type LLMAskParams,
  type LLMIntegrationInterface,
  type LLMResponse,
} from './llm.types.js';

/**
 * One way in to whatever model we are using.
 *
 * Integrations are built once and kept, because a client is a connection pool and a new
 * one per request is a new pool per request. They are built *lazily* so a server with no
 * key still boots — the same stance the Google sign-in takes, and for the same reason:
 * a missing optional credential is a feature that is switched off, not a broken server.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly config: LlmConfig;
  private readonly integrations = new Map<LLMIntegration, LLMIntegrationInterface>();

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<LlmConfig>('llm');
  }

  /** Whether there is a key at all. Callers that can do without one check this first. */
  isConfigured(integration: LLMIntegration = LLMIntegration.OPENAI): boolean {
    return integration === LLMIntegration.OPENAI && this.config.openaiApiKey.trim() !== '';
  }

  private integrationFor(integration: LLMIntegration): LLMIntegrationInterface {
    const cached = this.integrations.get(integration);
    if (cached) return cached;

    if (!this.isConfigured(integration)) {
      throw new ServiceUnavailableException(`${integration} is not configured.`);
    }

    const built = new OpenAIIntegration(this.config.openaiApiKey, this.config.openaiBaseUrl);
    this.integrations.set(integration, built);
    return built;
  }

  /**
   * Ask a model something.
   *
   * Callers pass a preset from `llm.defaults.ts` rather than loose numbers, so the
   * shape of a call says which task it belongs to.
   */
  async ask(params: LLMAskParams): Promise<LLMResponse> {
    const integration = params.integration ?? LLMIntegration.OPENAI;
    const started = Date.now();

    const response = await this.integrationFor(integration).ask({ ...params, integration });

    this.logger.debug(
      `${integration}/${response.model} ${response.usage.totalTokens} tokens in ${Date.now() - started}ms`,
    );

    return response;
  }
}
