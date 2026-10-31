import type { RankingCategory } from '@/lib/api';
import { categoryPhrase, formatViews, humanizeReason, ordinal } from '@/lib/format';

export interface ChaseInput {
  eligible: boolean;
  reason: string | null;
  position: number | null;
  total: number;
  gapToAbove: number | null;
  myScore: number | null;
  belowGap: number | null;
  category: RankingCategory;
}

export interface ChaseCopy {
  context: string;
  detail: string;
  progress: number | null;
}

export function describeChase(input: ChaseInput): ChaseCopy {
  const context = `${sentence(categoryPhrase(input.category))}, somando todas as suas contas.`;

  if (!input.eligible || input.position == null) {
    return {
      context,
      detail: humanizeReason(input.reason),
      progress: null,
    };
  }

  // A posição já está em destaque no título; aqui entra só o tamanho do grupo.
  const field =
    input.total > 1
      ? `${sentence(categoryPhrase(input.category))}, entre ${new Intl.NumberFormat('pt-BR').format(input.total)} embaixadores.`
      : `${sentence(categoryPhrase(input.category))}. Só você no ranking por enquanto.`;

  if (input.position === 1) {
    const lead =
      input.belowGap != null && input.belowGap > 0
        ? `Você lidera. A 2ª posição está a ${formatViews(input.belowGap)} views.`
        : 'Você lidera este ranking.';
    return {
      context: field,
      detail: lead,
      progress: 1,
    };
  }

  if (input.gapToAbove != null && input.gapToAbove > 0) {
    const mine = input.myScore ?? 0;
    const denom = mine + input.gapToAbove;
    return {
      context: field,
      detail: `Faltam ${formatViews(input.gapToAbove)} views para a ${ordinal(input.position - 1)} posição.`,
      progress: denom > 0 ? mine / denom : 0,
    };
  }

  return {
    context: field,
    detail: 'Empate em views. A ordem segue o critério de desempate.',
    progress: 1,
  };
}

function sentence(value: string): string {
  return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);
}
