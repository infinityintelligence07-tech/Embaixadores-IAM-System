import { Controller, Get, UseGuards, Req, Inject } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { SocialPlatform } from '../../../domain/types';
import { SocialAccountRepository, ContentRepository } from '../../../ports/repositories.port';
import { INJECTION_TOKENS } from '../../../infrastructure/tokens/injection-tokens';

@Controller('api')
@UseGuards(AuthGuard)
export class ContentsController {
  constructor(
    @Inject(INJECTION_TOKENS.SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepo: SocialAccountRepository,
    @Inject(INJECTION_TOKENS.CONTENT_REPOSITORY)
    private readonly contentRepo: ContentRepository,
  ) {}
  
  @Get('contents')
  async listContents(@Req() req: any) {
    const allContents: any[] = [];
    
    for (const platform of [SocialPlatform.Instagram, SocialPlatform.TikTok]) {
      const account = await this.socialAccountRepo.findByProfileAndPlatform(
        req.user.id,
        platform,
      );
      
      if (!account) {
        continue;
      }
      
      const contents = await this.contentRepo.findEligibleByAccount(account.id);
      
      for (const content of contents) {
        allContents.push({
          id: content.id,
          platform: content.platform,
          title: content.title || 'Untitled',
          url: content.permalink || '',
          views: content.latestViews || 0,
          publishedAt: content.publishedAt?.toISOString() || '',
          thumbnailUrl: content.thumbnailUrl,
          excluded: content.excludedAt !== null,
        });
      }
    }
    
    // Sort by views descending
    allContents.sort((a, b) => b.views - a.views);
    
    return allContents;
  }
}
