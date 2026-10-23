/** Brasília (UTC-3). O Brasil não tem horário de verão desde 2019. */
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Depois do fim, o ranking ainda recalcula por um dia para as últimas views chegarem. */
export const CAMPAIGN_GRACE_MS = DAY_MS;

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export type CampaignState = 'scheduled' | 'active' | 'finished';

export interface CampaignPeriod {
  startsAt: Date;
  endsAt: Date;
}

/** Mês corrente no horário de Brasília: do dia 1 às 00h até o dia 1 do mês seguinte. */
export function monthPeriod(now: Date): CampaignPeriod & { name: string } {
  const local = new Date(now.getTime() - SAO_PAULO_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    name: `${MONTHS[month]} de ${year}`,
    startsAt: new Date(Date.UTC(year, month, 1) + SAO_PAULO_OFFSET_MS),
    endsAt: new Date(Date.UTC(year, month + 1, 1) + SAO_PAULO_OFFSET_MS),
  };
}

/**
 * Datas digitadas pela equipe (AAAA-MM-DD) valem no horário de Brasília. O último dia conta
 * inteiro: o período termina à meia-noite do dia seguinte.
 */
export function periodFromDates(startDate: string, endDate: string): CampaignPeriod | null {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (start === null || end === null || end < start) return null;
  return {
    startsAt: new Date(start + SAO_PAULO_OFFSET_MS),
    endsAt: new Date(end + DAY_MS + SAO_PAULO_OFFSET_MS),
  };
}

export function campaignState(period: CampaignPeriod, now: Date): CampaignState {
  if (now < period.startsAt) return 'scheduled';
  if (now < period.endsAt) return 'active';
  return 'finished';
}

/** Ainda recebe views novas: começou e não passou do dia de tolerância depois do fim. */
export function isStillCounting(period: CampaignPeriod, now: Date): boolean {
  return (
    period.startsAt <= now && period.endsAt.getTime() + CAMPAIGN_GRACE_MS > now.getTime()
  );
}

/** Último dia (inclusive) do período, em AAAA-MM-DD no horário de Brasília. */
export function lastDayOf(period: CampaignPeriod): string {
  const local = new Date(period.endsAt.getTime() - SAO_PAULO_OFFSET_MS - DAY_MS);
  return local.toISOString().slice(0, 10);
}

export function firstDayOf(period: CampaignPeriod): string {
  return new Date(period.startsAt.getTime() - SAO_PAULO_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const time = Date.UTC(y, m - 1, d);
  const check = new Date(time);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return time;
}
