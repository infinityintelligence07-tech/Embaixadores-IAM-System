import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError, api, type AmbassadorApplication } from '@/lib/api';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

const filters: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovadas' },
  { id: 'rejected', label: 'Rejeitadas' },
  { id: 'all', label: 'Todas' },
];

export function CandidaturasPage() {
  const [applications, setApplications] = useState<AmbassadorApplication[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AmbassadorApplication | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setApplications(await api.applications());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível carregar as candidaturas. Tente de novo.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      filter === 'all'
        ? applications
        : applications.filter((item) => item.status === filter),
    [applications, filter],
  );

  async function updateStatus(id: string, status: AmbassadorApplication['status']) {
    setUpdatingId(id);
    setError('');
    try {
      const updated = await api.updateApplication(id, status);
      setApplications((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível atualizar a candidatura.',
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function remove(id: string) {
    setUpdatingId(id);
    setError('');
    try {
      await api.deleteApplication(id);
      setApplications((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível excluir a candidatura.');
    } finally {
      setUpdatingId(null);
      setPendingRemoval(null);
    }
  }

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-text">Candidaturas</h1>
        <p className="text-sm text-text-muted">
          Aprovar cria o acesso da pessoa neste mesmo sistema.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={filter === item.id ? 'primary' : 'secondary'}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {error ? (
        <Alert variant="error" title="Não foi possível concluir">
          {error}
        </Alert>
      ) : null}

      {loading ? <Spinner label="Carregando candidaturas..." /> : null}

      {!loading && visible.length === 0 ? (
        <EmptyState title="Nenhuma candidatura" description="Nada nesta lista por enquanto." />
      ) : null}

      <div className="space-y-3">
        {visible.map((item) => (
          <article key={item.id} className="rounded-[14px] border border-border bg-surface-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text">{item.nome_completo}</h2>
                <p className="text-sm text-text-muted">{item.email}</p>
                <p className="text-sm text-text-muted">{item.whatsapp}</p>
                <p className="mt-1 text-sm text-text">{item.nome_conta}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={updatingId === item.id || item.status === 'approved'}
                  onClick={() => void updateStatus(item.id, 'approved')}
                >
                  Aprovar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={updatingId === item.id || item.status === 'rejected'}
                  onClick={() => void updateStatus(item.id, 'rejected')}
                >
                  Rejeitar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={updatingId === item.id}
                  onClick={() => setPendingRemoval(item)}
                >
                  Excluir
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={`Excluir a candidatura de ${pendingRemoval?.nome_completo ?? ''}?`}
        description="Os dados dessa candidatura são apagados e não podem ser recuperados."
        confirmLabel="Excluir"
        busy={pendingRemoval !== null && updatingId === pendingRemoval.id}
        onConfirm={() => {
          if (pendingRemoval) void remove(pendingRemoval.id);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </section>
  );
}
