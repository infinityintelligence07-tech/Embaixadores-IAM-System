import { useEffect, useRef, useState } from "react";
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GoogleEntry } from "@/components/auth/GoogleButton";
import { ApiError, api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useSurfaceTheme } from "@/lib/theme";
import "./CapturePage.css";

const NETWORKS = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
] as const;

type FormState = {
  nome_completo: string;
  email: string;
  whatsapp: string;
  instagram_handle: string;
  tiktok_handle: string;
  redes_sociais: string[];
  password: string;
  ranking_consent: boolean;
};

type FieldName = keyof FormState;
type FieldErrors = Partial<Record<FieldName, string>>;

const INITIAL: FormState = {
  nome_completo: "",
  email: "",
  whatsapp: "",
  instagram_handle: "",
  tiktok_handle: "",
  redes_sociais: [],
  password: "",
  ranking_consent: false,
};

/** Ordem em que o foco procura o primeiro campo com erro. */
const FIELD_ORDER: FieldName[] = [
  "nome_completo",
  "email",
  "whatsapp",
  "password",
  "redes_sociais",
  "instagram_handle",
  "tiktok_handle",
  "ranking_consent",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HANDLE_RE = /^[A-Za-z0-9._]+$/;

/** Aceita "@perfil", "perfil" ou o link do perfil colado do app. */
function cleanHandle(value: string) {
  return value
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.|m\.)?(instagram|tiktok)\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "");
}

function normalizeHandle(value: string) {
  const clean = cleanHandle(value);
  return clean ? `@${clean}` : "";
}

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

function handleError(value: string, network: string): string | undefined {
  const clean = cleanHandle(value);
  if (!clean) return `Informe o @ do ${network}.`;
  if (/\s/.test(clean)) return "O @ não tem espaços. Copie como aparece no perfil.";
  if (!HANDLE_RE.test(clean)) return "Use só letras, números, ponto e sublinhado.";
  return undefined;
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

  const hasInstagram = form.redes_sociais.includes("instagram");
  const hasTiktok = form.redes_sociais.includes("tiktok");
  if (!hasInstagram && !hasTiktok) errors.redes_sociais = "Escolha Instagram, TikTok ou os dois.";
  if (hasInstagram) errors.instagram_handle = handleError(form.instagram_handle, "Instagram");
  if (hasTiktok) errors.tiktok_handle = handleError(form.tiktok_handle, "TikTok");

  if (!form.ranking_consent) {
    errors.ranking_consent = "Para participar, autorize a divulgação do seu nome no ranking.";
  }

  for (const key of Object.keys(errors) as FieldName[]) {
    if (!errors[key]) delete errors[key];
  }
  return errors;
}

function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="net-icon">
      <rect
        x="2.75"
        y="2.75"
        width="18.5"
        height="18.5"
        rx="5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      <circle
        cx="12"
        cy="12"
        r="4.35"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      <circle cx="17.55" cy="6.45" r="1.25" fill="currentColor" />
    </svg>
  );
}

function IconTikTok() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="net-icon">
      <path
        fill="currentColor"
        d="M14.35 3h2.55c.18 1.62 1.2 3.05 2.6 3.8v2.45a6.9 6.9 0 0 1-3.25-1.05v6.2c0 3.45-2.7 6.15-6.15 6.15S4 17.85 4 14.4c0-3.25 2.5-5.95 5.7-6.2v2.55c-1.55.25-2.7 1.55-2.7 3.2 0 1.8 1.45 3.25 3.25 3.25s3.25-1.45 3.25-3.25V3z"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 8.4l2.9 2.9 6.1-6.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  instagram: <IconInstagram />,
  tiktok: <IconTikTok />,
};

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
  prefix?: string;
  trailing?: ReactNode;
};

function TextField({ id, label, error, hint, prefix, trailing, ...input }: TextFieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className={`field__control${prefix ? " has-prefix" : ""}${trailing ? " has-trailing" : ""}`}>
        {prefix ? (
          <span className="field__prefix" aria-hidden="true">
            {prefix}
          </span>
        ) : null}
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
  const formRef = useRef<HTMLFormElement>(null);
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

  function toggleNetwork(id: string) {
    const exists = form.redes_sociais.includes(id);
    update(
      "redes_sociais",
      exists ? form.redes_sociais.filter((item) => item !== id) : [...form.redes_sociais, id],
    );
    if (exists) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id === "instagram" ? "instagram_handle" : "tiktok_handle"];
        return next;
      });
    }
  }

  function focusFirstError(found: FieldErrors) {
    const first = FIELD_ORDER.find((key) => found[key]);
    if (!first) return;
    const target =
      first === "redes_sociais"
        ? formRef.current?.querySelector<HTMLElement>(".net-tile")
        : document.getElementById(first);
    target?.focus();
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

    const hasInstagram = form.redes_sociais.includes("instagram");
    const hasTiktok = form.redes_sociais.includes("tiktok");
    const email = form.email.trim().toLowerCase();
    setLoading(true);
    try {
      await api.signup({
        nome_completo: form.nome_completo.trim(),
        email,
        whatsapp: formatPhone(form.whatsapp),
        redes_sociais: form.redes_sociais,
        instagram_handle: hasInstagram ? normalizeHandle(form.instagram_handle) : "",
        tiktok_handle: hasTiktok ? normalizeHandle(form.tiktok_handle) : "",
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

  const hasInstagram = form.redes_sociais.includes("instagram");
  const hasTiktok = form.redes_sociais.includes("tiktok");

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
              Em menos de 1 minuto você já está na área dos embaixadores. A
              equipe aprova o perfil para o ranking.
            </p>
          </header>

          <GoogleEntry className="lp-google" divider="ou crie com e-mail e senha" />

          <form ref={formRef} className="lp-fields" onSubmit={onSubmit} noValidate>
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

              <fieldset
                className={`lp-networks${errors.redes_sociais ? " has-error" : ""}`}
                aria-describedby={errors.redes_sociais ? "redes_sociais-error" : undefined}
              >
                <legend>Em qual rede você vai publicar?</legend>
                <p className="lp-networks__hint">Pode escolher as duas.</p>
                <div className="net-grid">
                  {NETWORKS.map((network) => {
                    const selected = form.redes_sociais.includes(network.id);
                    return (
                      <button
                        key={network.id}
                        type="button"
                        className={`net-tile${selected ? " is-on" : ""}`}
                        aria-pressed={selected}
                        onClick={() => toggleNetwork(network.id)}
                      >
                        {ICONS[network.id]}
                        <span className="net-tile__label">{network.label}</span>
                        <span className="net-tile__check" aria-hidden="true">
                          {selected ? <IconCheck /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <FieldError id="redes_sociais" message={errors.redes_sociais} />
              </fieldset>

              {hasInstagram || hasTiktok ? (
                <div className="lp-handles">
                  {hasInstagram ? (
                    <TextField
                      id="instagram_handle"
                      label="@ do Instagram"
                      prefix="@"
                      placeholder="seuinstagram"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={form.instagram_handle}
                      error={errors.instagram_handle}
                      onChange={(e) => update("instagram_handle", e.target.value.replace(/^@+/, ""))}
                    />
                  ) : null}
                  {hasTiktok ? (
                    <TextField
                      id="tiktok_handle"
                      label="@ do TikTok"
                      prefix="@"
                      placeholder="seutiktok"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={form.tiktok_handle}
                      error={errors.tiktok_handle}
                      onChange={(e) => update("tiktok_handle", e.target.value.replace(/^@+/, ""))}
                    />
                  ) : null}
                </div>
              ) : null}

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
