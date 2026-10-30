import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlatformMark } from '@/components/brand/PlatformMark';
import { Input } from '@/components/ui/Input';
import { api, type SocialPlatform } from '@/lib/api';
import { platformLabel } from '@/lib/format';

const PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok'];

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function bareHandle(value: string): string {
  return value.trim().replace(/^@+/, '');
}

/** Primeiro acesso pelo Google: WhatsApp, rede e @ numa tela só. */
export function CompleteSignupCard({ onDone }: { onDone: () => Promise<void> }) {
  const [whatsapp, setWhatsapp] = useState('');
  const [networks, setNetworks] = useState<SocialPlatform[]>([]);
  const [handles, setHandles] = useState<Record<SocialPlatform, string>>({ instagram: '', tiktok: '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const phoneError =
    touched && digits(whatsapp).length < 10 ? 'Informe o WhatsApp com DDD.' : undefined;

  function toggle(platform: SocialPlatform) {
    setNetworks((current) =>
      current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    setError(null);
    if (digits(whatsapp).length < 10) return;
    if (networks.length === 0) {
      setError('Marque Instagram, TikTok ou os dois.');
      return;
    }
    const missing = networks.find((platform) => !bareHandle(handles[platform]));
    if (missing) {
      setError(`Informe o @ do ${platformLabel(missing)}.`);
      return;
    }
    if (!consent) {
      setError('Para participar, autorize a divulgação do seu nome no ranking.');
      return;
    }
    setBusy(true);
    try {
      await api.completeSignup({
        whatsapp,
        redes_sociais: networks,
        instagram_handle: networks.includes('instagram') ? `@${bareHandle(handles.instagram)}` : '',
        tiktok_handle: networks.includes('tiktok') ? `@${bareHandle(handles.tiktok)}` : '',
        ranking_consent: true,
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar. Tente de novo.');
      setBusy(false);
    }
  }

  return (
    <section className="gate" aria-labelledby="complete-signup-title">
      <div>
        <h2 id="complete-signup-title">Falta pouco para entrar na competição</h2>
        <p className="gate-lead">Informe o seu WhatsApp e o @ onde você posta. Não pede senha da rede.</p>
      </div>
      <form className="complete-form" onSubmit={submit} noValidate>
        <Input
          label="WhatsApp"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-9999"
          value={whatsapp}
          onChange={(event) => setWhatsapp(event.target.value)}
          onBlur={() => setTouched(true)}
          error={phoneError}
          disabled={busy}
        />
        <fieldset className="complete-networks">
          <legend>Em qual rede você vai publicar?</legend>
          <div>
            {PLATFORMS.map((platform) => (
              <button
                key={platform}
                type="button"
                className="complete-network"
                aria-pressed={networks.includes(platform)}
                onClick={() => toggle(platform)}
                disabled={busy}
              >
                <PlatformMark platform={platform} size={28} />
                {platformLabel(platform)}
              </button>
            ))}
          </div>
        </fieldset>
        {networks.map((platform) => (
          <Input
            key={platform}
            label={`Seu @ no ${platformLabel(platform)}`}
            name={`${platform}-handle`}
            leading="@"
            placeholder="seuperfil"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={handles[platform]}
            onChange={(event) =>
              setHandles((current) => ({ ...current, [platform]: event.target.value }))
            }
            hint="O perfil precisa estar público."
            disabled={busy}
          />
        ))}
        <label className="complete-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            disabled={busy}
          />
          <span>
            Autorizo a divulgação do meu nome no ranking e concordo com os{' '}
            <Link to="/termos">Termos de uso</Link> e a{' '}
            <Link to="/privacidade">Política de privacidade</Link>.
          </span>
        </label>
        {error ? (
          <p className="complete-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="cta complete-submit" disabled={busy}>
          {busy ? 'Conectando...' : 'Entrar na competição'}
        </button>
      </form>
    </section>
  );
}
