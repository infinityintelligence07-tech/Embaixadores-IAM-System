import { CheckCircle2, Clock, Link2, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useSurfaceTheme } from '@/lib/theme';
import { api, type SocialAccount } from '@/lib/api';
import { gateHeadline } from '@/lib/connection';

const steps = [
  {
    id: 'profile',
    title: 'Complete seu perfil',
    description: 'Informe seu nome completo, nome público e foto para identificação no ranking.',
    icon: UserRound,
  },
  {
    id: 'connections',
    title: 'Entre na competição',
    description:
      'Conecte o Instagram e o TikTok com a sua conta. Sem essa autorização, suas views não entram no ranking.',
    icon: Link2,
  },
  {
    id: 'approval',
    title: 'Aguarde aprovação',
    description: 'Nossa equipe revisará seu cadastro antes de liberar o acesso completo.',
    icon: Clock,
  },
];

export function OnboardingPage() {
  useSurfaceTheme('apple');
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [publicName, setPublicName] = useState(profile?.publicName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? '');
  const [rankingConsent, setRankingConsent] = useState(
    Boolean(profile?.onboardingCompleted),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null);
  const [accountsFailed, setAccountsFailed] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .socialAccounts()
      .then((data) => {
        if (active) {
          setAccounts(data);
          setAccountsFailed(false);
        }
      })
      .catch(() => {
        if (active) setAccountsFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const profileDone = Boolean(profile?.fullName && profile?.publicName);
  const connectionsDone = accounts !== null && gateHeadline(accounts) === null;
  const approved = profile?.status === 'approved';

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
      await api.updateProfile({
        fullName,
        publicName,
        avatarUrl: avatarUrl || undefined,
        onboardingCompleted: true,
      });
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="page-title">Seu cadastro</h1>
        <p className="mt-2 text-text-muted">
          Siga os passos abaixo para começar a participar do programa.
        </p>
      </header>

      <ol className="space-y-2.5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const done =
            (step.id === 'profile' && profileDone) ||
            (step.id === 'connections' && connectionsDone) ||
            (step.id === 'approval' && approved);

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
                  {done ? <Badge tone="success">Concluído</Badge> : null}
                </div>
                <h2 className="font-display text-lg text-text">{step.title}</h2>
                <p className="mt-1 text-sm text-text-muted">{step.description}</p>
                {step.id === 'connections' && accountsFailed ? (
                  <p className="mt-2 text-sm text-text-muted" role="status">
                    Não foi possível verificar as conexões agora. Abra a página de conexões para
                    conferir.
                  </p>
                ) : null}
                {step.id === 'connections' ? (
                  <div className="mt-3">
                    <Link
                      to="/conexoes"
                      className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-brand-violet px-4 text-sm font-medium text-white hover:bg-brand-violet/90"
                    >
                      {connectionsDone ? 'Ver conexões' : 'Conectar Instagram e TikTok'}
                    </Link>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {profile?.status === 'pending' ? (
        <Alert variant="info" title="Aguardando aprovação">
          Seu perfil foi enviado. Você receberá acesso completo assim que a equipe
          confirmar sua participação.
        </Alert>
      ) : null}

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

          <Input
            label="URL do avatar"
            name="avatarUrl"
            type="url"
            placeholder="https://..."
            hint="Opcional. Use uma imagem pública."
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
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
              Autorizo a divulgação do meu nome público nos rankings e materiais
              do programa de embaixadores.
            </span>
          </label>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={loading}>
              Salvar perfil
            </Button>
            <Link
              to="/conexoes"
              className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-border bg-surface-card px-4 text-sm font-medium text-text"
            >
              Ir para conexões
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
