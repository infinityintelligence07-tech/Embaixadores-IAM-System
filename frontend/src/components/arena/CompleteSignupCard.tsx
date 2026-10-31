import { FormEvent, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';

type Field = 'whatsapp' | 'consent';
type Errors = Partial<Record<Field, string>>;

function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits;
}

function formatPhone(value: string): string {
  const digits = phoneDigits(value);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

function phoneError(value: string): string | undefined {
  const digits = phoneDigits(value);
  if (!digits) return 'Informe o seu WhatsApp com DDD.';
  if (digits.length < 10 || digits.length > 11 || digits.startsWith('0')) {
    return 'Confira o WhatsApp: use DDD e número, como (11) 98765-4321.';
  }
  return undefined;
}

/** Primeiro acesso pelo Google: só WhatsApp e consentimento. As contas vêm depois, em Conexões. */
export function CompleteSignupCard({ onDone }: { onDone: () => Promise<void> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [whatsapp, setWhatsapp] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function clear(field: Field) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validate(): Errors {
    const next: Errors = {};
    const phone = phoneError(whatsapp);
    if (phone) next.whatsapp = phone;
    if (!consent) next.consent = 'Para participar, autorize a divulgação do seu nome no ranking.';
    return next;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    const found = validate();
    setErrors(found);
    const first = (['whatsapp', 'consent'] as const).find((field) => found[field]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    setBusy(true);
    try {
      await api.completeSignup({ whatsapp: formatPhone(whatsapp), ranking_consent: true });
      await onDone();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Não foi possível salvar. Tente de novo.');
      setBusy(false);
    }
  }

  return (
    <section className="gate gate-split" aria-labelledby="complete-signup-title">
      <div>
        <h2 id="complete-signup-title">Complete o seu cadastro</h2>
        <p className="gate-lead">
          Falta só o seu WhatsApp, para a equipe falar com você. As contas do Instagram e do TikTok
          você adiciona logo depois, em Conexões.
        </p>
      </div>
      <form ref={formRef} className="complete-form" onSubmit={submit} noValidate>
        <Input
          label="WhatsApp"
          name="whatsapp"
          data-field="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 98765-4321"
          value={whatsapp}
          onChange={(event) => {
            setWhatsapp(event.target.value);
            clear('whatsapp');
          }}
          onBlur={() => {
            if (!whatsapp.trim()) return;
            setWhatsapp(formatPhone(whatsapp));
            const message = phoneError(whatsapp);
            if (message) setErrors((current) => ({ ...current, whatsapp: message }));
          }}
          error={errors.whatsapp}
          disabled={busy}
        />
        <div>
          <label className="complete-consent">
            <input
              type="checkbox"
              data-field="consent"
              checked={consent}
              onChange={(event) => {
                setConsent(event.target.checked);
                clear('consent');
              }}
              aria-invalid={Boolean(errors.consent) || undefined}
              disabled={busy}
            />
            <span>
              Autorizo a divulgação do meu nome no ranking e concordo com os{' '}
              <Link to="/termos">Termos de uso</Link> e a <Link to="/privacidade">Política de privacidade</Link>.
            </span>
          </label>
          {errors.consent ? (
            <p className="complete-error" role="alert">
              {errors.consent}
            </p>
          ) : null}
        </div>
        {serverError ? (
          <p className="complete-error" role="alert">
            {serverError}
          </p>
        ) : null}
        <button type="submit" className="cta complete-submit" disabled={busy}>
          {busy ? 'Salvando...' : 'Concluir cadastro'}
        </button>
      </form>
    </section>
  );
}
