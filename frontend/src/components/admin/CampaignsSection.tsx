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

function stateLabel(campaign: Campaign): { label: string; tone: 'ok' | 'wait' | 'stop' } {
  switch (campaign.state) {
    case 'active':
      return { label: 'Em andamento', tone: 'ok' };
    case 'scheduled':
      return { label: 'Agendada', tone: 'wait' };
    case 'finished':
      return { label: 'Encerrada', tone: 'stop' };
    default: {
      const exhaustive: never = campaign.state;
      return exhaustive;
    }
  }
}

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
  const [loading, setLoading] = useState(!preview);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<Campaign | null>(null);

  const load = useCallback(async () => {
    if (preview) return;
    try {
      const result = await api.adminCampaigns();
      setMode(result.mode);
      setItems(result.items);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não foi possível carregar as campanhas.');
    } finally {
      setLoading(false);
    }
  }, [onError, preview]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeMode(next: RankingMode) {
    if (next === mode) return;
    setBusy('mode');
    try {
      await api.adminSetRankingMode(next);
      setMode(next);
      onMessage(
        next === 'monthly'
          ? 'Ranking mensal ligado. Todo dia 1º começa um ranking novo sozinho.'
          : 'Ranking por campanha ligado. Crie as campanhas com início e fim abaixo.',
      );
      await load();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não foi possível mudar o modo.');
    } finally {
      setBusy(null);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy('create');
    try {
      const created = await api.adminCreateCampaign({ name: name.trim(), startDate, endDate });
      onMessage(
        `Campanha "${created.name}" criada. O ranking dela conta os vídeos publicados de ${shortDay(created.firstDay)} a ${shortDay(created.lastDay)}.`,
      );
      setName('');
      setStartDate('');
      setEndDate('');
      await load();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não foi possível criar a campanha.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(campaign: Campaign) {
    setBusy(campaign.id);
    try {
      await api.adminDeleteCampaign(campaign.id);
      onMessage(`Campanha "${campaign.name}" apagada.`);
      await load();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Não foi possível apagar a campanha.');
    } finally {
      setBusy(null);
      setPendingRemoval(null);
    }
  }

  return (
    <section className="admin-panel" aria-label="Rankings">
      <h2>Rankings por período</h2>
      <p className="admin-row admin-meta">
        Cada ranking conta só os vídeos publicados dentro do período. O ranking geral, desde o
        início, continua disponível para todos.
      </p>

      <div className="admin-row">
        <div className="admin-person">
          <strong>Como os rankings começam</strong>
          <span>
            {mode === 'monthly'
              ? 'Mensal: todo dia 1º abre um ranking novo do mês, sem precisar fazer nada.'
              : 'Por campanha: só existem os rankings que vocês criarem, com as datas que escolherem.'}
          </span>
        </div>
        <div className="admin-actions" role="group" aria-label="Modo do ranking">
          <button
            type="button"
            aria-pressed={mode === 'monthly'}
            disabled={busy === 'mode' || preview}
            onClick={() => void changeMode('monthly')}
          >
            Mensal
          </button>
          <button
            type="button"
            aria-pressed={mode === 'campaign'}
            disabled={busy === 'mode' || preview}
            onClick={() => void changeMode('campaign')}
          >
            Por campanha
          </button>
        </div>
      </div>

      <form className="admin-row admin-campaign-form" onSubmit={(event) => void create(event)}>
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
          label="Fim (dia incluído)"
          name="campaignEnd"
          type="date"
          required
          min={startDate || undefined}
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
        <Button type="submit" loading={busy === 'create'} disabled={preview}>
          Criar campanha
        </Button>
      </form>

      {loading ? (
        <div className="admin-row">
          <Spinner label="Carregando campanhas..." />
        </div>
      ) : items.length === 0 ? (
        <p className="admin-row admin-meta">Nenhuma campanha ainda.</p>
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
                  {campaign.kind === 'monthly' ? 'mês automático' : 'campanha'}
                </span>
              </div>
              <div className="admin-actions">
                <button
                  type="button"
                  className="is-stop"
                  disabled={busy === campaign.id || preview}
                  onClick={() => setPendingRemoval(campaign)}
                >
                  Apagar
                </button>
              </div>
            </article>
          );
        })
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={`Apagar "${pendingRemoval?.name ?? ''}"?`}
        description="O ranking dessa campanha some para todos. Views e vídeos continuam guardados."
        confirmLabel="Apagar"
        busy={pendingRemoval !== null && busy === pendingRemoval.id}
        onConfirm={() => {
          if (pendingRemoval) void remove(pendingRemoval);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </section>
  );
}
