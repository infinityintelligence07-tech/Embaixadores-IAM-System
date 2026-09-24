import { Link } from 'react-router-dom';

const updated = '24 de setembro de 2026';

export function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-bg px-4 py-10 text-text">
      <article className="mx-auto max-w-2xl space-y-6">
        <p className="text-sm text-[var(--color-muted)]">
          <Link to="/login" className="text-gold underline-offset-2 hover:underline">
            Voltar
          </Link>
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-gold">
          Política de Privacidade
        </h1>
        <p className="text-sm text-[var(--color-muted)]">Última atualização: {updated}</p>
        <p>
          Esta política descreve como a plataforma <strong>Embaixadores Acorde Sua Mente</strong>{' '}
          (https://embaixadores.iamcontrol.com.br) trata dados pessoais e dados obtidos via
          integrações sociais.
        </p>
        <h2 className="text-xl text-violet">1. Dados que coletamos</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Cadastro: nome, nome público, e-mail (autenticação via Supabase Auth).</li>
          <li>
            Contas sociais (com seu consentimento OAuth): identificador da plataforma, username,
            avatar, URL do perfil, lista de vídeos/Reels e contadores de visualizações disponíveis
            pela API oficial.
          </li>
          <li>Uso da plataforma: logs técnicos, sincronizações e auditoria administrativa.</li>
        </ul>
        <h2 className="text-xl text-violet">2. Finalidades</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Operar cadastro, login e perfil de embaixador.</li>
          <li>Sincronizar conteúdos e métricas autorizadas.</li>
          <li>
            Calcular e exibir rankings (nome público, avatar e pontuação são divulgados na
            plataforma).
          </li>
          <li>Administrar aprovações, suspensões e exclusões auditáveis.</li>
        </ul>
        <h2 className="text-xl text-violet">3. Integração TikTok</h2>
        <p>
          Usamos Login Kit e Display API do TikTok para autenticar a titularidade da conta e ler
          perfil e vídeos públicos autorizados (escopos <code>user.info.basic</code> e{' '}
          <code>video.list</code>). Tokens ficam criptografados no servidor e não são expostos no
          frontend. Você pode revogar o acesso desconectando a conta na plataforma ou nas
          configurações do TikTok.
        </p>
        <h2 className="text-xl text-violet">4. Compartilhamento</h2>
        <p>
          Não vendemos dados pessoais. Dados podem ser processados por provedores necessários à
          operação (ex.: Supabase para autenticação/banco; Meta/TikTok conforme autorização do
          usuário).
        </p>
        <h2 className="text-xl text-violet">5. Retenção</h2>
        <p>
          Snapshots de métricas: até 180 dias. Auditoria/sync: até 365 dias. Credenciais sociais:
          até desconexão ou exclusão da conta. Rankings publicados podem ser retidos para histórico.
        </p>
        <h2 className="text-xl text-violet">6. Seus direitos</h2>
        <p>
          Você pode solicitar desconexão de redes, exclusão de conta e acesso/correção de dados de
          perfil pelos canais oficiais da IAM Control / Acorde Sua Mente (domínio iamcontrol.com.br).
        </p>
        <h2 className="text-xl text-violet">7. Contato</h2>
        <p>
          Para questões de privacidade, utilize os canais oficiais associados a iamcontrol.com.br.
        </p>
        <p className="text-sm text-[var(--color-muted)]">
          Ver também os{' '}
          <Link to="/termos" className="text-gold underline-offset-2 hover:underline">
            Termos de Uso
          </Link>
          .
        </p>
      </article>
    </main>
  );
}
