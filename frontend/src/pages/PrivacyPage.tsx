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
            Cadastro: nome, nome público e e-mail. Quem entra com o Google compartilha o nome, o
            e-mail e a foto da conta Google. A autenticação é feita pelo Supabase Auth.
          </li>
          <li>
            Cadastro no programa: nome, e-mail e WhatsApp, usados pela equipe IAM para falar com
            o embaixador.
          </li>
          <li>Foto de perfil, quando o embaixador envia uma.</li>
          <li>
            Redes sociais: o @ de cada conta do Instagram e do TikTok que o embaixador adiciona
            em Conexões. A partir dele, lemos apenas dados públicos do perfil, como
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
          <li>
            Mostrar o perfil de cada embaixador aos outros participantes: nome público, foto, o @
            das contas aprovadas e os vídeos que contam no ranking. E-mail e WhatsApp nunca
            aparecem.
          </li>
          <li>Administrar aprovações, suspensões e exclusões auditáveis.</li>
        </ul>
      </LegalSection>
      <LegalSection title="3. Leitura das redes sociais">
        <p>
          O perfil precisa estar público. As visualizações são lidas do perfil público de cada
          conta adicionada, por meio de um fornecedor de dados públicos, várias vezes ao dia. Só
          contam os Reels e vídeos publicados no próprio perfil. A equipe confere cada conta antes
          de ela entrar no ranking. Você pode remover uma conta a qualquer momento em Conexões; a
          partir daí, as views dela deixam de ser lidas.
        </p>
      </LegalSection>
      <LegalSection title="4. Compartilhamento">
        <p>
          Não vendemos dados pessoais. Os dados podem ser processados por fornecedores necessários
          à operação: Supabase (autenticação e banco de dados), Google (entrada com conta Google,
          quando o embaixador escolhe essa opção) e o fornecedor de dados públicos das redes sociais.
        </p>
      </LegalSection>
      <LegalSection title="5. Retenção">
        <ul className={listClass}>
          <li>Registros de métricas: até 180 dias.</li>
          <li>Auditoria e sincronização: até 365 dias.</li>
          <li>Dados das redes sociais: até a remoção da conta em Conexões ou a exclusão do cadastro.</li>
          <li>Rankings publicados podem ser mantidos como histórico.</li>
        </ul>
      </LegalSection>
      <LegalSection title="6. Seus direitos">
        <p>
          Você pode remover contas de rede a qualquer momento em Conexões. A exclusão do cadastro e
          o acesso ou a correção de dados de perfil podem ser pedidos pelos canais oficiais da IAM
          Control / Acorde Sua Mente (domínio iamcontrol.com.br).
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
