import { Link } from 'react-router-dom';

const updated = '24 de setembro de 2026';

export function TermsPage() {
  return (
    <main className="min-h-dvh bg-bg px-4 py-10 text-text">
      <article className="mx-auto max-w-2xl space-y-6">
        <p className="text-sm text-[var(--color-muted)]">
          <Link to="/login" className="text-gold underline-offset-2 hover:underline">
            Voltar
          </Link>
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-gold">
          Termos de Uso
        </h1>
        <p className="text-sm text-[var(--color-muted)]">Última atualização: {updated}</p>
        <p>
          Estes Termos regem o uso da plataforma <strong>Embaixadores Acorde Sua Mente</strong>{' '}
          (https://embaixadores.iamcontrol.com.br), operada pela IAM Control / Acorde Sua Mente.
        </p>
        <h2 className="text-xl text-violet">1. Objeto</h2>
        <p>
          A plataforma permite o cadastro de embaixadores, conexão autorizada de contas Instagram e
          TikTok via OAuth, sincronização de métricas de conteúdos (Reels/vídeos) e classificação em
          rankings públicos com base em critérios transparentes de visualizações.
        </p>
        <h2 className="text-xl text-violet">2. Cadastro e elegibilidade</h2>
        <p>
          O usuário deve fornecer dados verdadeiros (nome, nome público, e-mail). A participação nos
          rankings depende de aprovação administrativa. Contas suspensas não participam da
          classificação.
        </p>
        <h2 className="text-xl text-violet">3. Contas sociais</h2>
        <p>
          A vinculação de Instagram/TikTok exige autorização OAuth do titular. Digitar apenas o
          @username não é suficiente. Cada conta social só pode ser associada a um embaixador. O
          usuário pode desconectar a qualquer momento.
        </p>
        <h2 className="text-xl text-violet">4. Rankings e métricas</h2>
        <p>
          Os rankings usam a soma das visualizações dos vídeos monitorados e o melhor vídeo
          individual, separados por plataforma. Métricas oficiais de conta, quando indisponíveis,
          são exibidas como “Indisponível” e não são substituídas silenciosamente pela soma dos
          vídeos.
        </p>
        <h2 className="text-xl text-violet">5. Conduta</h2>
        <p>
          É proibido fraudar métricas, usar contas de terceiros sem autorização, tentar burlar
          sincronização ou prejudicar outros participantes.
        </p>
        <h2 className="text-xl text-violet">6. Limitação</h2>
        <p>
          A disponibilidade depende de APIs de terceiros (Meta, TikTok, Supabase). Interrupções ou
          mudanças nessas APIs podem afetar a coleta de dados.
        </p>
        <h2 className="text-xl text-violet">7. Contato</h2>
        <p>
          Dúvidas: utilize os canais oficiais da IAM Control / Acorde Sua Mente associados ao domínio
          iamcontrol.com.br.
        </p>
        <p className="text-sm text-[var(--color-muted)]">
          Ver também a{' '}
          <Link to="/privacidade" className="text-gold underline-offset-2 hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </article>
    </main>
  );
}
