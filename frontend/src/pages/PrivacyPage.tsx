import { useSurfaceTheme } from '@/lib/theme';
import { LegalLayout, LegalSection } from './TermsPage';

const listClass = 'list-disc space-y-2 pl-5 marker:text-text-muted';

export function PrivacyPage() {
  useSurfaceTheme('arena');

  return (
    <LegalLayout
      title="Política de privacidade"
      other={{ to: '/termos', label: 'Termos de uso' }}
      intro={
        <p>
          Esta política descreve como a plataforma{' '}
          <strong className="text-text">Embaixadores Acorde Sua Mente</strong>{' '}
          (embaixadores.iamcontrol.com.br) trata dados pessoais e dados públicos das redes sociais
          informadas pelo embaixador.
        </p>
      }
    >
      <LegalSection title="1. Dados que coletamos">
        <ul className={listClass}>
          <li>
            Cadastro: nome, nome público e e-mail. Quem entra com o Google, quando essa opção estiver
            disponível, compartilha o nome e o e-mail da conta Google. A autenticação é feita pelo Supabase Auth.
          </li>
          <li>
            Candidatura: nome, e-mail, WhatsApp e o @ do Instagram ou TikTok, usados pela equipe
            IAM para analisar o pedido de entrada.
          </li>
          <li>Foto de perfil, quando o embaixador envia uma.</li>
          <li>
            Redes sociais: a partir do @ informado, lemos apenas dados públicos do perfil, como
            identificador, nome de usuário, foto, endereço do perfil, Reels e vídeos publicados e as
            visualizações de cada um. Nunca pedimos a senha da rede social.
          </li>
          <li>Uso da plataforma: registros técnicos de acesso, das coletas de views e das ações da equipe.</li>
        </ul>
      </LegalSection>
      <LegalSection title="2. Finalidades">
        <ul className={listClass}>
          <li>Operar cadastro, login e perfil de embaixador.</li>
          <li>Sincronizar conteúdos e métricas autorizadas.</li>
          <li>
            Calcular e exibir rankings (nome público, avatar e pontuação são divulgados na
            plataforma).
          </li>
          <li>Administrar aprovações, suspensões e exclusões auditáveis.</li>
        </ul>
      </LegalSection>
      <LegalSection title="3. Leitura das redes sociais">
        <p>
          O perfil precisa estar público. As visualizações são lidas do perfil público do @
          informado, por meio de um fornecedor de dados públicos, várias vezes ao dia. Só contam os
          Reels e vídeos publicados no próprio perfil. A equipe confere se o @ é do embaixador antes
          de o perfil entrar no ranking. Você pode desconectar a rede a qualquer momento em
          Conexões; a partir daí, as views dela deixam de ser lidas.
        </p>
      </LegalSection>
      <LegalSection title="4. Compartilhamento">
        <p>
          Não vendemos dados pessoais. Os dados podem ser processados por fornecedores necessários
          à operação: Supabase (autenticação e banco de dados), Google (entrada com conta Google,
          quando disponível e escolhida) e o fornecedor de dados públicos das redes sociais.
        </p>
      </LegalSection>
      <LegalSection title="5. Retenção">
        <ul className={listClass}>
          <li>Registros de métricas: até 180 dias.</li>
          <li>Auditoria e sincronização: até 365 dias.</li>
          <li>Dados das redes sociais: até a desconexão ou a exclusão da conta.</li>
          <li>Rankings publicados podem ser mantidos como histórico.</li>
        </ul>
      </LegalSection>
      <LegalSection title="6. Seus direitos">
        <p>
          Você pode solicitar desconexão de redes, exclusão de conta e acesso ou correção de dados
          de perfil pelos canais oficiais da IAM Control / Acorde Sua Mente (domínio
          iamcontrol.com.br).
        </p>
      </LegalSection>
      <LegalSection title="7. Contato">
        <p>
          Para questões de privacidade, utilize os canais oficiais associados a iamcontrol.com.br.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
