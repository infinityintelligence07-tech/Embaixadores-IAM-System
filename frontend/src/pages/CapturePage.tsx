import { useEffect, useState } from "react";
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GoogleEntry } from "@/components/auth/GoogleButton";
import { PlatformMark } from "@/components/brand/PlatformMark";
import { ApiError, api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useSurfaceTheme } from "@/lib/theme";
import "./CapturePage.css";

type FormState = {
  nome_completo: string;
  email: string;
  whatsapp: string;
  password: string;
  ranking_consent: boolean;
};

type FieldName = keyof FormState;
type FieldErrors = Partial<Record<FieldName, string>>;

const INITIAL: FormState = {
  nome_completo: "",
  email: "",
  whatsapp: "",
  password: "",
  ranking_consent: false,
};

/** Ordem em que o foco procura o primeiro campo com erro. */
const FIELD_ORDER: FieldName[] = [
  "nome_completo",
  "email",
  "whatsapp",
  "password",
  "ranking_consent",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Só os dígitos do número, sem o 55 do Brasil quando a pessoa digita com ele. */
function phoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
}

function formatPhone(value: string) {
  const digits = phoneDigits(value);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (form.nome_completo.trim().length < 2) errors.nome_completo = "Informe seu nome completo.";

  const email = form.email.trim();
  if (!email) errors.email = "Informe seu e-mail.";
  else if (!EMAIL_RE.test(email)) errors.email = "Esse e-mail parece incompleto. Confira o @ e o domínio.";

  const phone = phoneDigits(form.whatsapp);
  if (!phone) errors.whatsapp = "Informe seu WhatsApp com DDD.";
  else if (phone.length < 10 || phone.length > 11 || phone.startsWith("0")) {
    errors.whatsapp = "Inclua o DDD, como (11) 99999-9999.";
  }

  if (form.password.length < 8) errors.password = "A senha precisa ter pelo menos 8 caracteres.";
  else if (form.password.length > 72) errors.password = "A senha pode ter no máximo 72 caracteres.";

  if (!form.ranking_consent) {
    errors.ranking_consent = "Para participar, autorize a divulgação do seu nome no ranking.";
  }

  return errors;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field__error" id={`${id}-error`}>
      {message}
    </p>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> & {
  id: FieldName;
  label: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
};

function TextField({ id, label, error, hint, trailing, ...input }: TextFieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className={`field__control${trailing ? " has-trailing" : ""}`}>
        <input
          id={id}
          name={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          {...input}
        />
        {trailing}
      </div>
      {hint && !error ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      <FieldError id={id} message={error} />
    </div>
  );
}

export function CapturePage() {
  useSurfaceTheme("arena");
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (location.hash === "#formulario") {
      document.getElementById("formulario")?.scrollIntoView({ block: "start" });
    }
  }, [location.hash]);

  function update<K extends FieldName>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function focusFirstError(found: FieldErrors) {
    const first = FIELD_ORDER.find((key) => found[key]);
    if (!first) return;
    document.getElementById(first)?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setSubmitError("");

    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(found);
      return;
    }

    const email = form.email.trim().toLowerCase();
    setLoading(true);
    try {
      await api.signup({
        nome_completo: form.nome_completo.trim(),
        email,
        whatsapp: formatPhone(form.whatsapp),
        password: form.password,
        ranking_consent: true,
      });
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : err instanceof TypeError
            ? "Sem conexão com o servidor. Verifique a internet e tente de novo."
            : "Não foi possível criar sua conta. Tente de novo.",
      );
      setLoading(false);
      return;
    }

    // A conta já existe: entra na hora e segue para o ranking.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: form.password,
    });
    setLoading(false);
    if (signInError) {
      navigate("/login", {
        state: { reason: "Sua conta foi criada. Entre com o e-mail e a senha que você escolheu." },
      });
      return;
    }
    navigate("/rankings", { replace: true });
  }

  return (
    <div className="lp">
      <div className="lp__scene" aria-hidden="true">
        <img src="/brand/hero-atmosphere.png" alt="" className="lp__atmosphere" />
        <div className="lp__scene-veil" />
        <div className="lp__grain" />
      </div>
      <div className="lp__mark" aria-hidden="true">
        <svg viewBox="0 0 220 300" className="lp__mark-svg">
          <path
            fill="currentColor"
            d="M24 18h172v42H72v54h112v40H72v66h132v42H24V18z"
          />
        </svg>
      </div>

      <header className="lp-top">
        <img src="/brand/iam-logo.png" alt="iAM" className="lp-top__iam" />
        <Link to="/login" className="lp-top__link">
          Entrar
        </Link>
      </header>

      <main className="lp-main">
        <section className="lp-hero">
          <img
            src="/brand/logo.png"
            alt="Embaixadores Acorde Sua Mente"
            className="lp-hero__brand"
          />
          <h1 className="lp-head">
            Nosso propósito vai além
            <br />
            de criar conteúdo!
          </h1>
          <p className="lp-desc">
            Queremos disseminar uma mensagem capaz de transformar vidas. Este
            formulário reúne as pessoas que farão parte desse movimento,
            compartilhando nossos conteúdos e cortes nas redes sociais.
          </p>
          <p className="lp-promise">
            Quanto mais longe a mensagem chegar, mais vidas poderão ser
            impactadas.
          </p>
          <a className="btn btn--primary btn--lg lp-cta" href="#formulario">
            Quero fazer parte
          </a>
        </section>

        <section className="lp-form" id="formulario" aria-labelledby="lp-form-title">
          <header className="lp-form__intro">
            <h2 className="lp-form__title" id="lp-form-title">
              Crie sua conta
            </h2>
            <p className="lp-form__sub">
              Em menos de 1 minuto você já está na área dos embaixadores.
            </p>
            <p className="lp-later">
              <span className="lp-later__marks" aria-hidden="true">
                <PlatformMark platform="instagram" size={26} />
                <PlatformMark platform="tiktok" size={26} />
              </span>
              <span>
                As contas do Instagram e do TikTok você adiciona depois, dentro
                do app, em Conexões. A equipe aprova cada conta para o ranking.
              </span>
            </p>
          </header>

          <GoogleEntry className="lp-google" divider="ou crie com e-mail e senha" />

          <form className="lp-fields" onSubmit={onSubmit} noValidate>
            <fieldset className="lp-fields__set" disabled={loading}>
              <div className="lp-fields__grid">
                <TextField
                  id="nome_completo"
                  label="Nome completo"
                  autoComplete="name"
                  placeholder="Seu nome e sobrenome"
                  value={form.nome_completo}
                  error={errors.nome_completo}
                  onChange={(e) => update("nome_completo", e.target.value)}
                />

                <TextField
                  id="email"
                  label="E-mail"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="voce@email.com"
                  value={form.email}
                  error={errors.email}
                  onChange={(e) => update("email", e.target.value)}
                />

                <TextField
                  id="whatsapp"
                  label="WhatsApp"
                  type="tel"
                  autoComplete="tel-national"
                  inputMode="tel"
                  placeholder="(11) 99999-9999"
                  value={form.whatsapp}
                  error={errors.whatsapp}
                  onChange={(e) => update("whatsapp", e.target.value)}
                  onBlur={() => {
                    const formatted = formatPhone(form.whatsapp);
                    if (formatted !== form.whatsapp) setForm((prev) => ({ ...prev, whatsapp: formatted }));
                  }}
                />

                <TextField
                  id="password"
                  label="Senha"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Mínimo de 8 caracteres"
                  value={form.password}
                  error={errors.password}
                  onChange={(e) => update("password", e.target.value)}
                  trailing={
                    <button
                      type="button"
                      className="field__reveal"
                      aria-controls="password"
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  }
                />
              </div>

              <div className={`lp-consent-wrap${errors.ranking_consent ? " has-error" : ""}`}>
                <label className="lp-consent">
                  <input
                    id="ranking_consent"
                    type="checkbox"
                    checked={form.ranking_consent}
                    aria-invalid={errors.ranking_consent ? true : undefined}
                    aria-describedby={errors.ranking_consent ? "ranking_consent-error" : undefined}
                    onChange={(e) => update("ranking_consent", e.target.checked)}
                  />
                  <span>
                    Autorizo a divulgação do meu nome no ranking e concordo com os{" "}
                    <Link to="/termos">Termos de uso</Link> e a{" "}
                    <Link to="/privacidade">Política de privacidade</Link>.
                  </span>
                </label>
                <FieldError id="ranking_consent" message={errors.ranking_consent} />
              </div>
            </fieldset>

            {submitError ? (
              <div className="form-error" role="alert">
                {submitError}
              </div>
            ) : null}

            <div className="lp-actions">
              <button
                className="btn btn--primary btn--lg lp-submit"
                type="submit"
                disabled={loading}
                aria-busy={loading || undefined}
              >
                {loading ? <span className="btn__spinner" aria-hidden="true" /> : null}
                {loading ? "Criando sua conta..." : "Criar conta e entrar"}
              </button>
              <p className="lp-login-hint">
                Já tem conta? <Link to="/login">Entrar</Link>
              </p>
            </div>
          </form>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-foot__brand">
          <img src="/brand/iam-logo.png" alt="iAM" className="lp-foot__iam" />
          <p>Embaixadores Acorde Sua Mente</p>
        </div>
        <nav className="lp-foot__links" aria-label="Documentos legais">
          <Link to="/termos">Termos de uso</Link>
          <Link to="/privacidade">Política de privacidade</Link>
        </nav>
      </footer>
    </div>
  );
}
