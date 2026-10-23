import { CheckCircle2, Clock, Link2, UserRound } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompetitionGate } from '@/components/arena/CompetitionGate';
import { SocialHandleDialog } from '@/components/social/SocialHandleDialog';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useSurfaceTheme } from '@/lib/theme';
import { api, type SocialAccount, type SocialPlatform } from '@/lib/api';
import { connectionDuty } from '@/lib/connection';
import { markOAuthStarted } from '@/lib/oauth-return';

export function OnboardingPage() {
  useSurfaceTheme('apple');
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [publicName, setPublicName] = useState(profile?.publicName ?? '');
  const [rankingConsent, setRankingConsent] = useState(
    Boolean(profile?.onboardingCompleted),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null);
  const [accountsFailed, setAccountsFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [handlePlatform, setHandlePlatform] = useState<SocialPlatform | null>(null);
  const [handleSuggestion, setHandleSuggestion] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await api.socialAccounts());
      setAccountsFailed(false);
    } catch {
      setAccountsFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const confirmed = (accounts ?? []).filter(
    (account) => connectionDuty(account.status) === 'ready',
  );
  const profileDone = Boolean(profile?.onboardingCompleted);
  const connectionsDone = confirmed.length > 0;
  const approved = confirmed.some((account) => account.reviewStatus === 'approved');

  async function connect(platform: SocialPlatform) {
    setBusy(platform);
    setConnectError(null);
    try {
      const start = await api.startOAuth(platform);
      if (start.mode === 'handle') {
        setHandleSuggestion(start.suggestedHandle);
        setHandlePlatform(platform);
        return;
      }
      markOAuthStarted(platform);
      window.location.href = start.url;
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Não foi possível abrir a conexão.');
    } finally {
      setBusy(null);
    }
  }

  async function requestReview(id: string) {
    setBusy(id);
    setConnectError(null);
    try {
      await api.requestAccountReview(id);
      await loadAccounts();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Não foi possível pedir a nova análise.');
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!rankingConsent) {
      setError('Você precisa aceitar a divulgação do seu nome no ranking.');
      return;
    }

    setLoading(true);
    setError(null);
    setSaved(false);

    try {
      await api.updateProfile({ fullName, publicName, onboardingCompleted: true });
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível salvar o perfil. Tente de novo.',
      );
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    {
      id: 'profile',
      title: 'Conta criada',
      description: 'Seu nome aparece no ranking como você escolheu.',
      icon: UserRound,
      done: profileDone,
    },
    {
      id: 'connections',
      title: 'Confirme o seu Instagram ou TikTok',
      description:
        'Informe o @ e coloque o código na bio para provar que a conta é sua. Pode ser uma rede ou as duas.',
      icon: Link2,
      done: connectionsDone,
    },
    {
      id: 'approval',
      title: 'Aprovação da equipe',
      description:
        'A equipe confere a conta. Aprovada, ela entra no ranking. Se precisar de ajuste, você recebe o recado aqui.',
      icon: Clock,
      done: approved,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="page-title">Seu cadastro</h1>
        <p className="mt-2 text-text-muted">
          Falta pouco. Confirme a sua rede e aguarde a equipe liberar o ranking.
        </p>
      </header>

      <ol className="space-y-2.5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.id}
              className="flex gap-4 rounded-[14px] border border-border bg-surface-card p-4"
            >
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-violet/15 text-brand-violet"
                aria-hidden
              >
                <Icon className="size-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Passo {index + 1}</span>
                  {step.done ? <Badge tone="success">Concluído</Badge> : null}
                </div>
                <h2 className="font-display text-lg text-text">{step.title}</h2>
                <p className="mt-1 text-sm text-text-muted">{step.description}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {connectError ? (
        <Alert variant="error" role="alert">
          {connectError}
        </Alert>
      ) : null}
      {accountsFailed ? (
        <Alert variant="warning" role="status">
          Não foi possível carregar as suas redes agora.{' '}
          <button type="button" className="underline" onClick={() => void loadAccounts()}>
            Tentar de novo
          </button>
        </Alert>
      ) : null}

      {accounts ? (
        <CompetitionGate
          accounts={accounts}
          persist
          busy={busy}
          onConnect={(platform) => void connect(platform)}
          onRequestReview={(id) => void requestReview(id)}
        />
      ) : null}

      {approved ? (
        <Alert variant="success" title="Você está na competição">
          Sua conta foi aprovada. <Link to="/dashboard">Ver o ranking</Link>
        </Alert>
      ) : connectionsDone ? (
        <Alert variant="info" title="Aguardando aprovação">
          A equipe vai analisar a sua conta. Enquanto isso você já pode ver o ranking.
        </Alert>
      ) : null}

      {profileDone ? null : (
        <section className="rounded-[14px] border border-border bg-surface-card p-6">
          <h2 className="font-display text-xl text-text">Seus dados</h2>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error ? (
              <Alert variant="error" role="alert">
                {error}
              </Alert>
            ) : null}
            {saved ? (
              <Alert variant="success">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="size-4" aria-hidden />
                  Perfil salvo com sucesso.
                </span>
              </Alert>
            ) : null}

            <Input
              label="Nome completo"
              name="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              hint="Usado internamente pela equipe."
            />

            <Input
              label="Nome público"
              name="publicName"
              required
              value={publicName}
              onChange={(e) => setPublicName(e.target.value)}
              hint="Será exibido nos rankings."
            />

            <label className="flex items-start gap-3 text-sm text-text">
              <input
                type="checkbox"
                checked={rankingConsent}
                onChange={(e) => setRankingConsent(e.target.checked)}
                className="mt-0.5 size-5 rounded border-border accent-brand-violet"
                required
              />
              <span>
                Autorizo a divulgação do meu nome público nos rankings e materiais do programa
                de embaixadores.
              </span>
            </label>

            <Button type="submit" loading={loading}>
              Salvar perfil
            </Button>
          </form>
        </section>
      )}

      <SocialHandleDialog
        platform={handlePlatform}
        account={accounts?.find((item) => item.platform === handlePlatform) ?? null}
        suggestedHandle={handleSuggestion}
        onClose={() => setHandlePlatform(null)}
        onChanged={() => void loadAccounts()}
      />
    </div>
  );
}
