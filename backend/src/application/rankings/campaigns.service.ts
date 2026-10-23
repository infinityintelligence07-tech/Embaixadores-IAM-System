import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getPool } from '../../infrastructure/db/pool';
import { INJECTION_TOKENS } from '../../infrastructure/tokens/injection-tokens';
import { SettingsRepository } from '../../ports/repositories.port';
import { ProfileId } from '../../domain/types';
import {
  CampaignState,
  campaignState,
  firstDayOf,
  isStillCounting,
  lastDayOf,
  monthPeriod,
  periodFromDates,
} from '../../domain/campaign-period';

/** `monthly`: todo mês abre um ranking novo sozinho. `campaign`: só as campanhas criadas pela equipe. */
export type RankingMode = 'monthly' | 'campaign';

export interface Campaign {
  id: string;
  name: string;
  kind: 'monthly' | 'campaign';
  startsAt: Date;
  endsAt: Date;
}

export interface CampaignView {
  id: string;
  name: string;
  kind: 'monthly' | 'campaign';
  startsAt: string;
  endsAt: string;
  firstDay: string;
  lastDay: string;
  state: CampaignState;
}

@Injectable()
export class CampaignsService {
  constructor(
    @Inject(INJECTION_TOKENS.SETTINGS_REPOSITORY)
    private readonly settingsRepo: SettingsRepository,
  ) {}

  async getMode(): Promise<RankingMode> {
    // Lido direto: o jsonb já chega como texto, e o SettingsRepository tentaria um JSON.parse a mais.
    const result = await getPool().query<{ value: unknown }>(
      `SELECT value FROM app_settings WHERE key = 'ranking_mode'`,
    );
    return result.rows[0]?.value === 'campaign' ? 'campaign' : 'monthly';
  }

  async setMode(mode: RankingMode, actorId: ProfileId): Promise<RankingMode> {
    await this.settingsRepo.set('ranking_mode', mode, actorId);
    return mode;
  }

  /** No modo mensal, garante a linha do mês corrente. Repetir não cria duplicata. */
  async ensureCurrentMonth(now: Date): Promise<void> {
    if ((await this.getMode()) !== 'monthly') return;
    const period = monthPeriod(now);
    await getPool().query(
      `INSERT INTO campaigns (name, kind, starts_at, ends_at)
       VALUES ($1, 'monthly', $2, $3)
       ON CONFLICT (starts_at) WHERE kind = 'monthly' DO NOTHING`,
      [period.name, period.startsAt, period.endsAt],
    );
  }

  async list(): Promise<Campaign[]> {
    const result = await getPool().query(
      `SELECT id, name, kind, starts_at, ends_at FROM campaigns ORDER BY starts_at DESC, created_at DESC`,
    );
    return result.rows.map(mapRow);
  }

  async findById(id: string): Promise<Campaign | null> {
    const result = await getPool().query(
      `SELECT id, name, kind, starts_at, ends_at FROM campaigns WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Campanhas cujo ranking ainda muda: em andamento, no dia de tolerância depois do fim, ou que
   * nunca foram publicadas (criadas com datas passadas).
   */
  async toCompute(now: Date): Promise<Campaign[]> {
    const result = await getPool().query(
      `SELECT c.id, c.name, c.kind, c.starts_at, c.ends_at,
              EXISTS (
                SELECT 1 FROM ranking_versions rv
                WHERE rv.campaign_id = c.id AND rv.status = 'published'
              ) AS published
       FROM campaigns c
       WHERE c.starts_at <= $1`,
      [now],
    );
    return result.rows
      .map((row) => ({ campaign: mapRow(row), published: row.published === true }))
      .filter(({ campaign, published }) => !published || isStillCounting(campaign, now))
      .map(({ campaign }) => campaign);
  }

  /**
   * Ranking que o embaixador vê primeiro: a campanha da equipe em andamento, senão o mês em
   * andamento, senão a última encerrada. Sem nenhuma, o ranking geral.
   */
  pickDefault(campaigns: Campaign[], now: Date): Campaign | null {
    const started = campaigns.filter((item) => item.startsAt <= now);
    const active = started.filter((item) => campaignState(item, now) === 'active');
    return (
      active.find((item) => item.kind === 'campaign') ??
      active[0] ??
      started.sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0] ??
      null
    );
  }

  async create(
    input: { name?: unknown; startDate?: unknown; endDate?: unknown },
    actorId: ProfileId,
  ): Promise<Campaign> {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length < 2 || name.length > 80) {
      throw new BadRequestException('Dê um nome para a campanha, com até 80 letras.');
    }
    const period = periodFromDates(
      typeof input.startDate === 'string' ? input.startDate : '',
      typeof input.endDate === 'string' ? input.endDate : '',
    );
    if (!period) {
      throw new BadRequestException('Informe início e fim válidos. O fim não pode vir antes do início.');
    }
    const result = await getPool().query(
      `INSERT INTO campaigns (name, kind, starts_at, ends_at, created_by)
       VALUES ($1, 'campaign', $2, $3, $4)
       RETURNING id, name, kind, starts_at, ends_at`,
      [name, period.startsAt, period.endsAt, actorId],
    );
    return mapRow(result.rows[0]);
  }

  async remove(id: string): Promise<Campaign> {
    const result = await getPool().query(
      `DELETE FROM campaigns WHERE id = $1 RETURNING id, name, kind, starts_at, ends_at`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Campanha não encontrada.');
    return mapRow(result.rows[0]);
  }

  toView(campaign: Campaign, now: Date): CampaignView {
    return {
      id: campaign.id,
      name: campaign.name,
      kind: campaign.kind,
      startsAt: campaign.startsAt.toISOString(),
      endsAt: campaign.endsAt.toISOString(),
      firstDay: firstDayOf(campaign),
      lastDay: lastDayOf(campaign),
      state: campaignState(campaign, now),
    };
  }
}

function mapRow(row: {
  id: string;
  name: string;
  kind: string;
  starts_at: Date | string;
  ends_at: Date | string;
}): Campaign {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === 'monthly' ? 'monthly' : 'campaign',
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
  };
}
