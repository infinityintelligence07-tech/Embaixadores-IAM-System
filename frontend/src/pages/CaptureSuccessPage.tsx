import { Link } from "react-router-dom";
import { useSurfaceTheme } from "@/lib/theme";
import "./CaptureSuccessPage.css";

export function CaptureSuccessPage() {
  useSurfaceTheme("arena");
  return (
    <main className="success">
      <div className="success__panel">
        <img src="/brand/apple-touch-icon.png" alt="" width={56} height={56} className="success__mark" />
        <p className="success__kicker">Candidatura enviada</p>
        <h1>Recebemos o seu perfil</h1>
        <p className="success__text">
          Obrigado por querer fazer parte do movimento. Seu perfil entrou em
          análise e a equipe Embaixadores atualiza o status em breve.
        </p>
        <Link className="btn btn--primary" to="/login">
          Entrar na minha conta
        </Link>
        <Link className="success__link" to="/">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
