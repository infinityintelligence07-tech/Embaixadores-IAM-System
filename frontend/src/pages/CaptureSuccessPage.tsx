import { Link } from "react-router-dom";
import { useSurfaceTheme } from "@/lib/theme";
import "./CaptureSuccessPage.css";

export function CaptureSuccessPage() {
  useSurfaceTheme("arena");
  return (
    <main className="success">
      <div className="success__panel">
        <p className="success__kicker">Candidatura enviada</p>
        <h1>Recebemos o seu perfil</h1>
        <p className="success__text">
          Obrigado por querer fazer parte do movimento. Seu perfil entrou em
          análise e o time Embaixadores atualiza o status em breve.
        </p>
        <Link className="btn btn--primary" to="/">
          Voltar
        </Link>
      </div>
    </main>
  );
}
