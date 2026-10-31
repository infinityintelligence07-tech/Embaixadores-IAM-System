import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, type SocialAccount, type SocialPlatform } from '@/lib/api';
import { handleError, normalizeHandle } from '@/lib/connection';
import { platformLabel } from '@/lib/format';

interface SocialHandleDialogProps {
  /** Rede da conta nova. Sem rede, o diálogo fica fechado. */
  platform: SocialPlatform | null;
  /** Quem abriu o diálogo. Recebe o foco de volta ao fechar. */
  returnFocusTo?: HTMLElement | null;
  /** Troca o envio ao servidor, usado na prévia local. */
  submitAccount?: (platform: SocialPlatform, handle: string) => Promise<SocialAccount>;
  onClose: () => void;
  onAdded: (account: SocialAccount) => void;
}

/** Adiciona mais uma conta da rede pelo @. O servidor confere o perfil e o limite por rede. */
export function SocialHandleDialog({
  platform,
  returnFocusTo,
  submitAccount = api.addAccount,
  onClose,
  onAdded,
}: SocialHandleDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const open = platform !== null;
  const name = platform ? platformLabel(platform) : '';
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const active = document.activeElement;
      openerRef.current =
        returnFocusTo ??
        (active instanceof HTMLElement && active !== document.body ? active : null);
      setHandle('');
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      const opener = openerRef.current;
      openerRef.current = null;
      // O botão que abriu pode estar sendo reabilitado neste mesmo ciclo.
      window.setTimeout(() => {
        if (opener?.isConnected) opener.focus();
      }, 0);
    }
    // Só reinicia ao abrir.
  }, [open]);

  function close() {
    if (!busy) onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!platform) return;
    const clean = normalizeHandle(handle);
    if (!clean) {
      setError(
        handle.trim()
          ? 'Esse link é de uma publicação. Digite só o @ do perfil, por exemplo seuperfil.'
          : `Digite o @ da conta do ${name}.`,
      );
      return;
    }
    const invalid = handleError(platform, clean);
    if (invalid) {
      setError(invalid);
      return;
    }
    setHandle(clean);
    setBusy(true);
    setError(null);
    try {
      const next = await submitAccount(platform, clean);
      onAdded(next);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível conferir esse @. Confira se está certo e tente de novo.',
      );
    } finally {
      setBusy(false);
    }
  }

  const inputId = `${platform ?? 'social'}-handle`;

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form className="p-6" onSubmit={submit} noValidate>
        <h2 id={titleId} className="text-lg font-semibold text-text">
          Adicionar conta do {name}
        </h2>
        <p id={descriptionId} className="mt-2.5 text-sm leading-normal text-text-muted">
          Digite o @ do perfil onde você posta, ou cole o link do perfil. Não pedimos senha.
        </p>
        <div className="mt-5">
          <Input
            id={inputId}
            name={inputId}
            label={`@ da conta no ${name}`}
            leading="@"
            value={handle}
            onChange={(event) => {
              setHandle(event.target.value);
              if (error) setError(null);
            }}
            placeholder="seuperfil"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className="min-h-[44px] text-base sm:text-sm"
            error={error ?? undefined}
            hint="O perfil precisa estar público. A equipe confere antes de a conta somar no ranking."
            disabled={busy}
          />
        </div>
        <div className="confirm-dialog-actions">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? 'Conferindo...' : 'Adicionar conta'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
