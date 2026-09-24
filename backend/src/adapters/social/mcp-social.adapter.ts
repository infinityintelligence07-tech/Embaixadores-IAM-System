import { Injectable, Logger } from '@nestjs/common';
import {
  SocialMetricsProvider,
  SocialCredentials,
  AuthorizedProfile,
  SocialContentPage,
  AccountMetricsResult,
  ContentMetricsResult,
} from '../../ports/social-metrics.port';
import { ConnectionStatus } from '../../domain/types';

/**
 * MCP social adapter - always returns integration_unavailable.
 * Placeholder for future MCP-based social metrics integration.
 */
@Injectable()
export class McpSocialAdapter implements SocialMetricsProvider {
  readonly platform: 'instagram' | 'tiktok';
  readonly transport = 'mcp' as const;
  
  private readonly logger = new Logger(McpSocialAdapter.name);
  
  constructor(platform: 'instagram' | 'tiktok') {
    this.platform = platform;
  }
  
  private throwUnavailable(): never {
    const error = new Error('MCP integration is not available');
    (error as any).status = ConnectionStatus.IntegrationUnavailable;
    throw error;
  }
  
  async getAuthorizedProfile(_creds: SocialCredentials): Promise<AuthorizedProfile> {
    this.logger.warn(`MCP ${this.platform} adapter: getAuthorizedProfile not available`);
    this.throwUnavailable();
  }
  
  async listContents(
    _creds: SocialCredentials,
    _cursor?: string | null,
  ): Promise<SocialContentPage> {
    this.logger.warn(`MCP ${this.platform} adapter: listContents not available`);
    this.throwUnavailable();
  }
  
  async getAccountMetrics(_creds: SocialCredentials): Promise<AccountMetricsResult> {
    this.logger.warn(`MCP ${this.platform} adapter: getAccountMetrics not available`);
    this.throwUnavailable();
  }
  
  async getContentMetrics(
    _creds: SocialCredentials,
    _platformContentId: string,
  ): Promise<ContentMetricsResult> {
    this.logger.warn(`MCP ${this.platform} adapter: getContentMetrics not available`);
    this.throwUnavailable();
  }
  
  async disconnect(_creds: SocialCredentials): Promise<void> {
    this.logger.warn(`MCP ${this.platform} adapter: disconnect not available`);
    this.throwUnavailable();
  }
}
