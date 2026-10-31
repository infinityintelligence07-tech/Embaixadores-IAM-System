import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSurfaceTheme } from '@/lib/theme';

const updated = '24 de setembro de 2026';

/** Volta para a tela de onde a pessoa veio (cadastro ou login); sem histórico, vai para o início. */
export function LegalBackLink() {
  const navigate = useNavigate();
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={() => (canGoBack ? navigate(-1) : navigate('/'))}
      className="-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl pl-1.5 pr-3 text-sm font-medium text-text-muted hover:bg-white/5 hover:text-text"
    >
      <ChevronLeft className="size-4" aria-hidden />
      Voltar
    </button>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-7">
      <h2 className="text-lg font-semibold leading-snug tracking-tight text-text">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function LegalLayout({
  title,
  intro,
  children,
  other,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
  other: { to: string; label: string };
}) {
  return (
    <main className="min-h-dvh bg-surface px-5 pb-16 pt-4 text-text sm:px-8">
      <article className="mx-auto w-full max-w-[680px] text-[15px] leading-7 text-text/85 sm:text-base">
        <nav className="flex items-center justify-between gap-4" aria-label="Navegação">
          <LegalBackLink />
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center text-sm font-semibold tracking-tight text-text"
          >
            Embaixadores
          </Link>
        </nav>

        <header className="mt-8 space-y-2 pb-8">
          <h1 className="page-title">{title}</h1>
          <p className="text-sm text-text-muted">Última atualização: {updated}</p>
          <div className="pt-3">{intro}</div>
        </header>

        <div className="space-y-7">{children}</div>

        <footer className="mt-10 rounded-[14px] border border-border bg-surface-card px-5 py-4 text-sm text-text-muted">
          Leia também a{' '}
          <Link
            to={other.to}
            className="font-medium text-[var(--accent-2)] underline-offset-4 hover:underline"
          >
            {other.label}
          </Link>
          .
        </footer>
      </article>
    </main>
  );
}

export function TermsPage() {
  useSurfaceTheme('arena');

  return (
    <LegalLayout
      title="Termos de uso"
      other={{ to: '/privacidade', label: 'Política de privacidade' }}
      intro={
        <p>
          Estes Termos regem o uso da plataforma{' '}
          <strong className="text-text">Embaixadores Acorde Sua Mente</strong>{' '}
          (embaixadores.iamcontrol.com.br), operada pela IAM Control / Acorde Sua Mente.
        </p>
      }
    >
      <LegalSection title="1. Objeto">
        <p>
          A plataforma reúne os embaixadores que publicam os conteúdos e cortes do Acorde Sua Mente.
          Ela permite o cadastro, a conexão do Instagram e do TikTok pelo @ e a classificação em
          rankings públicos, com base nas visualizações dos Reels e vídeos publicados.
        </p>
      </LegalSection>
      <LegalSection title="2. Cadastro e elegibilidade">
        <p>
          O embaixador deve fornecer dados verdadeiros: nome, nome público, e-mail e WhatsApp. A
          conta pode ser criada com e-mail e senha ou com a conta Google. A
          participação nos rankings depende da aprovação da equipe. Contas suspensas não
          participam da classificação.
        </p>
      </LegalSection>
      <LegalSection title="3. Redes sociais">
        <p>
          O embaixador informa o @ do Instagram ou do TikTok onde publica e declara que o perfil é
          dele. O @ informado já conecta a rede. Nunca pedimos a senha da rede social. O perfil
          precisa estar público, porque as visualizações são lidas do perfil público por um
          fornecedor de dados públicos.
        </p>
        <p>
          A equipe confere se o @ é do embaixador antes de o perfil entrar no ranking e pode
          recusar o que não for dele. Cada perfil só pode estar ligado a um embaixador. O
          embaixador pode desconectar a rede a qualquer momento em Conexões.
        </p>
      </LegalSection>
      <LegalSection title="4. Rankings e visualizações">
        <p>
          Os rankings somam as visualizações dos Reels e vídeos publicados no próprio perfil e
          destacam o melhor vídeo, separados por rede. Fotos e carrosséis do Instagram não contam.
          Quando um número ainda não estiver disponível, a plataforma mostra que ele está
          indisponível, sem trocá-lo por uma estimativa.
        </p>
      </LegalSection>
      <LegalSection title="5. Conduta">
        <p>
          É proibido inflar visualizações de forma artificial, usar perfis de outras pessoas sem
          autorização, tentar burlar a leitura dos dados ou prejudicar outros participantes.
        </p>
      </LegalSection>
      <LegalSection title="6. Limitação">
        <p>
          A leitura das visualizações depende de serviços de terceiros, como as próprias redes
          sociais e o fornecedor de dados públicos. Interrupções ou mudanças nesses serviços podem
          atrasar a atualização dos números.
        </p>
      </LegalSection>
      <LegalSection title="7. Contato">
        <p>
          Para dúvidas, utilize os canais oficiais da IAM Control / Acorde Sua Mente associados ao
          domínio iamcontrol.com.br.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
