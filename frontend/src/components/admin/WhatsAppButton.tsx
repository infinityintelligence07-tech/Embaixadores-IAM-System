/** Número salvo com ou sem DDI; o link do WhatsApp pede o 55 do Brasil na frente. */
export function whatsappDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.length <= 11 ? `55${digits}` : digits;
}

function WhatsAppGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.56.93.95-3.47-.22-.36a9.4 9.4 0 0 1-1.44-5.01c0-5.2 4.24-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.36 9.36 0 0 1 2.76 6.67c0 5.2-4.24 9.43-9.46 9.43zm8.03-17.46A11.27 11.27 0 0 0 12.05.73C5.8.73.7 5.82.7 12.08c0 2 .52 3.95 1.52 5.67L.6 23.27l5.65-1.48a11.33 11.33 0 0 0 5.8 1.48h.01c6.25 0 11.35-5.09 11.35-11.35 0-3.03-1.18-5.88-3.33-8.02z"
      />
    </svg>
  );
}

/** Abre a conversa com a pessoa no WhatsApp, para a equipe falar direto com ela. */
export function WhatsAppButton({
  whatsapp,
  name,
  text,
}: {
  whatsapp: string | null | undefined;
  name: string;
  /** Recado já escrito na conversa, quando houver. */
  text?: string;
}) {
  const digits = whatsappDigits(whatsapp);
  if (!digits) {
    return (
      <span className="wa-button" aria-disabled="true" title="Essa pessoa ainda não informou o WhatsApp.">
        <WhatsAppGlyph />
        Sem WhatsApp
      </span>
    );
  }
  const href = `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  return (
    <a
      className="wa-button"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Abrir conversa com ${name} no WhatsApp`}
    >
      <WhatsAppGlyph />
      WhatsApp
    </a>
  );
}
