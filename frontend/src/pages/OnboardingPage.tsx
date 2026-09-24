import { CheckCircle2, Clock, Link2, UserRound } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

const steps = [
  {
    id: 'profile',
    title: 'Complete seu perfil',
    description: 'Informe seu nome completo, nome público e foto para identificação no ranking.',
    icon: UserRound,
  },
  {
    id: 'connections',
    title: 'Conecte suas redes',
    description: 'Vincule Instagram e/ou TikTok para monitorar seus conteúdos.',
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
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [publicName, setPublicName] = useState(profile?.publicName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? '');
  const [rankingConsent, setRankingConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const profileDone = Boolean(profile?.fullName && profile?.publicName);
  const approved = profile?.status === 'approved';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!rankingConsent) {
      setError('Você precisa aceitar a divulgação do seu nome no ranking.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.updateProfile({
        fullName,
        publicName,
        avatarUrl: avatarUrl || undefined,
      });
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-brand-gold">
          Boas-vindas
        </p>
        <h1 className="font-display text-3xl text-text">Guia de onboarding</h1>
        <p className="mt-2 text-text-muted">
          Siga os passos abaixo para começar a participar do programa.
        </p>
      </header>

      <ol className="space-y-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const done =
            (step.id === 'profile' && profileDone) ||
            (step.id === 'approval' && approved);

          return (
            <li
              key={step.id}
              className="flex gap-4 rounded-2xl border border-border bg-surface-card p-4"
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
                {step.id === 'connections' ? (
                  <Link to="/conexoes" className="mt-3 inline-block">
                    <Button type="button" variant="secondary" size="sm">
                      Conectar redes
                    </Button>
                  </Link>
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

      {profile?.status === 'suspended' ? (
        <Alert variant="warning" role="alert" title="Conta suspensa">
          Entre em contato com a equipe para mais informações.
        </Alert>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface-card p-6">
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
              className="mt-1 size-4 rounded border-border accent-brand-violet"
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
            <Link to="/conexoes">
              <Button type="button" variant="secondary">
                Ir para conexões
              </Button>
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
