import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
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
};

const INITIAL: FormState = {
  nome_completo: "",
  email: "",
  whatsapp: "",
  instagram_handle: "",
  tiktok_handle: "",
  redes_sociais: [],
};

function normalizeHandle(value: string) {
  const clean = value.trim().replace(/^@+/, "");
  return clean ? `@${clean}` : "";
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

const ICONS: Record<string, ReactNode> = {
  instagram: <IconInstagram />,
  tiktok: <IconTikTok />,
};

export function CapturePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleNetwork(id: string) {
    setForm((prev) => {
      const exists = prev.redes_sociais.includes(id);
      return {
        ...prev,
        redes_sociais: exists
          ? prev.redes_sociais.filter((item) => item !== id)
          : [...prev.redes_sociais, id],
      };
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const hasInstagram = form.redes_sociais.includes("instagram");
    const hasTiktok = form.redes_sociais.includes("tiktok");
    if (!hasInstagram && !hasTiktok) {
      setError("Selecione Instagram, TikTok ou os dois.");
      setLoading(false);
      return;
    }
    if (hasInstagram && !normalizeHandle(form.instagram_handle)) {
      setError("Informe o @ do Instagram.");
      setLoading(false);
      return;
    }
    if (hasTiktok && !normalizeHandle(form.tiktok_handle)) {
      setError("Informe o @ do TikTok.");
      setLoading(false);
      return;
    }

    try {
      const payload = {
        nome_completo: form.nome_completo,
        email: form.email,
        whatsapp: form.whatsapp,
        redes_sociais: form.redes_sociais,
        instagram_handle: hasInstagram
          ? normalizeHandle(form.instagram_handle)
          : "",
        tiktok_handle: hasTiktok ? normalizeHandle(form.tiktok_handle) : "",
      };
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || result.message || "Falha ao enviar");
      }

      navigate("/sucesso");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lp">
      <div className="lp__scene" aria-hidden="true">
        <img src="/brand/hero-atmosphere.png" alt="" className="lp__atmosphere" />
        <div className="lp__scene-veil" />
        <div className="lp__mark">
          <svg viewBox="0 0 220 300" className="lp__mark-svg">
            <path
              fill="currentColor"
              d="M24 18h172v42H72v54h112v40H72v66h132v42H24V18z"
            />
          </svg>
        </div>
        <div className="lp__grain" />
      </div>

      <header className="lp-top">
        <img src="/brand/iam-logo.png" alt="iAM" className="lp-top__iam" />
        <Link to="/login" state={{ from: "/candidaturas" }} className="lp-top__link">
          Admin
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

        <section className="lp-form" id="formulario">
          <header className="lp-form__intro">
            <p className="lp-form__eyebrow">Inscrição</p>
            <h2 className="lp-form__title">Candidatura</h2>
            <p className="lp-form__sub">
              Marque Instagram, TikTok ou os dois. O @ de cada rede marcada é
              obrigatório.
            </p>
          </header>

          <form className="lp-fields" onSubmit={onSubmit}>
            <div className="lp-fields__grid">
              <div className="field">
                <label htmlFor="nome_completo">
                  Nome completo <span>*</span>
                </label>
                <input
                  id="nome_completo"
                  name="nome_completo"
                  autoComplete="name"
                  placeholder="Seu nome"
                  required
                  value={form.nome_completo}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      nome_completo: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="field">
                <label htmlFor="email">
                  E-mail <span>*</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@email.com"
                  required
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>

              <div className="field">
                <label htmlFor="whatsapp">
                  WhatsApp <span>*</span>
                </label>
                <input
                  id="whatsapp"
                  name="whatsapp"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="(11) 99999-9999"
                  required
                  value={form.whatsapp}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, whatsapp: e.target.value }))
                  }
                />
              </div>

            </div>

            <fieldset className="lp-networks">
              <legend>
                Qual a rede social que foi criada <span>*</span>
              </legend>
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
                      {selected ? (
                        <span className="net-tile__check" aria-hidden="true">
                          ✓
                        </span>
                      ) : null}
                      {ICONS[network.id]}
                      <span>{network.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {form.redes_sociais.includes("instagram") ||
            form.redes_sociais.includes("tiktok") ? (
              <div className="lp-handles">
                {form.redes_sociais.includes("instagram") ? (
                  <div className="field">
                    <label htmlFor="instagram_handle">
                      @ do Instagram <span>*</span>
                    </label>
                    <input
                      id="instagram_handle"
                      name="instagram_handle"
                      placeholder="@seuinstagram"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                      value={form.instagram_handle}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          instagram_handle: e.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
                {form.redes_sociais.includes("tiktok") ? (
                  <div className="field">
                    <label htmlFor="tiktok_handle">
                      @ do TikTok <span>*</span>
                    </label>
                    <input
                      id="tiktok_handle"
                      name="tiktok_handle"
                      placeholder="@seutiktok"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                      value={form.tiktok_handle}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          tiktok_handle: e.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? <div className="form-error">{error}</div> : null}

            <button
              className="btn btn--primary btn--lg lp-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? "Enviando..." : "Enviar candidatura"}
            </button>
          </form>
        </section>
      </main>

      <footer className="lp-foot">
        <img src="/brand/iam-logo.png" alt="iAM" className="lp-foot__iam" />
        <p>Embaixadores Acorde Sua Mente</p>
      </footer>
    </div>
  );
}
