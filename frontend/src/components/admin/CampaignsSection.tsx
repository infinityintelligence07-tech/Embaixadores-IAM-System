import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError, api, type Campaign, type RankingMode } from '@/lib/api';

function shortDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

function stateLabel(campaign: Campaign): { label: string; tone?: 'ok' } {
  switch (campaign.state) {
    case 'active':
      return { label: 'Em andamento', tone: 'ok' };
    case 'scheduled':
      return { label: 'Agendada' };
    case 'finished':
      return { label: 'Encerrada' };
    default: {
      const exhaustive: never = campaign.state;
      return exhaustive;
    }
  }
}

const MODE_COPY: Record<RankingMode, { title: string; line: string; confirm: string }> = {
  monthly: {
    title: 'Mensal',
    line: 'Todo dia 1º abre sozinho um ranking novo do mês. Campanhas extras também podem ser criadas abaixo.',
    confirm:
      'A partir de agora, todo dia 1º abre sozinho um ranking novo do mês. As campanhas criadas continuam.',
  },
  campaign: {
    title: 'Por campanha',
    line: 'Só existem os rankings que a equipe criar, com as datas escolhidas.',
    confirm:
      'Os rankings mensais deixam de abrir sozinhos. Só existem os rankings das campanhas que a equipe criar.',
  },
};

export function CampaignsSection({
  preview,
  onMessage,
  onError,
}: {
  preview: boolean;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<RankingMode>('monthly');
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pendingMode, setPendingMode] = useState<RankingMode | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Campaign | null>(null);

  const load = useCallback(async () => {
    if (preview) {
      const demo = await import('@/components/admin/previewData');
      setItems(demo.previewCampaigns);
      setLoading(false);
      return;
    }
    try {
      const result = await api.adminCampaigns();
      setMode(result.mode);
      setItems(result.items);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [preview]);

  useEffect(() => {
    void load();
  }, [load]);

  const datesInvalid = startDate !== '' && endDate !== '' && endDate < startDate;

  async function changeMode(next: RankingMode) {
    setBusy('mode');
    try {
      if (!preview) await api.adminSetRankingMode(next);
      setMode(next);
      onMessage(
        next === 'monthly'
          ? 'Ranking mensal ligado. Todo dia 1º começa um ranking novo sozinho.'
          : 'Ranking por campanha ligado. Crie as campanhas com início e fim abaixo.',
      );
      if (!preview) await load();
    } catch (err) {
      onError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível mudar o modo. Confira a internet e tente de novo.',
      );
    } finally {
      setBusy(null);
      setPendingMode(null);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (datesInvalid) return;
    setBusy('create');
    try {
      const created: Campaign = preview
        ? {
            id: `demo-${Date.now()}`,
            name: name.trim(),
            kind: 'campaign',
            startsAt: startDate,
            endsAt: endDate,
            firstDay: startDate,
            lastDay: endDate,
            state: 'scheduled',
          }
        : await api.adminCreateCampaign({ name: name.trim(), startDate, endDate });
      onMessage(
        `Campanha "${created.name}" criada. O ranking dela conta as views ganhas de ${shortDay(created.firstDay)} a ${shortDay(created.lastDay)}.`,
      );
      setName('');
      setStartDate('');
      setEndDate('');
      if (preview) setItems((current) => [created, ...current]);
      else await load();
    } catch (err) {
      onError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível criar a campanha. Confira os dados e tente de novo.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(campaign: Campaign) {
    setBusy(campaign.id);
    try {
      if (!preview) await api.adminDeleteCampaign(campaign.id);
      onMessage(`Campanha "${campaign.name}" apagada.`);
      if (preview) setItems((current) => current.filter((item) => item.id !== campaign.id));
      else await load();
    } catch (err) {
      onError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível apagar a campanha. Confira a internet e tente de novo.',
      );
    } finally {
      setBusy(null);
      setPendingRemoval(null);
    }
  }

  return (
    <div className="admin-stack">
      <section className="admin-panel" aria-labelledby="ranking-mode-title">
        <div className="admin-panel-head">
          <h2 id="ranking-mode-title">Como os rankings começam</h2>
          <p>
            Cada ranking conta as views ganhas dentro do período, de qualquer vídeo, mesmo postado
            antes. Assim, um vídeo que viraliza depois ainda pontua no período em que cresceu. O
            ranking geral, desde o início, continua disponível para todos.
          </p>
        </div>
        <div className="admin-row">
          <div className="admin-person">
            <strong>Modo atual: {MODE_COPY[mode].title.toLowerCase()}</strong>
            <span>{MODE_COPY[mode].line}</span>
          </div>
          <div className="admin-segment" role="group" aria-label="Modo do ranking">
            {(['monthly', 'campaign'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                disabled={busy === 'mode' || loading || loadFailed}
                onClick={() => {
                  if (option !== mode) setPendingMode(option);
                }}
              >
                {MODE_COPY[option].title}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-panel" aria-labelledby="campaigns-title">
        <div className="admin-panel-head">
          <h2 id="campaigns-title">Campanhas</h2>
          <p>Crie um ranking com início e fim. O dia final também conta.</p>
        </div>

        <form className="admin-campaign-form" onSubmit={(event) => void create(event)}>
          <Input
            label="Nome da campanha"
            name="campaignName"
            required
            maxLength={80}
            placeholder="Ex.: Imersão Prosperar"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label="Início"
            name="campaignStart"
            type="date"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <Input
            label="Fim"
            name="campaignEnd"
            type="date"
            required
            min={startDate || undefined}
            value={endDate}
            error={datesInvalid ? 'O fim precisa ser depois do início.' : undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
          <Button
            type="submit"
            loading={busy === 'create'}
            disabled={!name.trim() || !startDate || !endDate || datesInvalid}
          >
            Criar campanha
          </Button>
        </form>

        {loading ? (
          <div className="admin-row">
            <Spinner label="Carregando campanhas..." />
          </div>
        ) : loadFailed ? (
          <div className="admin-empty" role="alert">
            <strong>Não foi possível carregar as campanhas</strong>
            <p>Confira a internet e tente de novo. Se continuar, avise o suporte técnico.</p>
            <div className="admin-actions">
              <button type="button" onClick={() => void load()}>
                Tentar de novo
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="admin-empty" role="status">
            <strong>Nenhuma campanha ainda</strong>
            <p>Preencha o nome, o início e o fim acima para criar a primeira.</p>
          </div>
        ) : (
          items.map((campaign) => {
            const state = stateLabel(campaign);
            return (
              <article key={campaign.id} className="admin-row">
                <div className="admin-person">
                  <strong>
                    {campaign.name}
                    <span className="admin-status" data-tone={state.tone}>
                      <i />
                      {state.label}
                    </span>
                  </strong>
                  <span>
                    {shortDay(campaign.firstDay)} a {shortDay(campaign.lastDay)} ·{' '}
                    {campaign.kind === 'monthly'
                      ? 'Ranking do mês, aberto sozinho'
                      : 'Campanha criada pela equipe'}
                  </span>
                </div>
                <div className="admin-actions">
                  <button
                    type="button"
                    className="is-stop"
                    disabled={busy === campaign.id}
                    onClick={() => setPendingRemoval(campaign)}
                  >
                    Apagar
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      <ConfirmDialog
        open={pendingMode !== null}
        title={
          pendingMode === 'campaign'
            ? 'Mudar para ranking por campanha?'
            : 'Mudar para ranking mensal?'
        }
        description={pendingMode ? MODE_COPY[pendingMode].confirm : undefined}
        confirmLabel="Mudar o modo"
        tone="primary"
        busy={busy === 'mode'}
        onConfirm={() => {
          if (pendingMode) void changeMode(pendingMode);
        }}
        onCancel={() => setPendingMode(null)}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={`Apagar "${pendingRemoval?.name ?? ''}"?`}
        description="O ranking dessa campanha some para todos. Views e vídeos continuam guardados."
        confirmLabel="Apagar campanha"
        busy={pendingRemoval !== null && busy === pendingRemoval.id}
        onConfirm={() => {
          if (pendingRemoval) void remove(pendingRemoval);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
