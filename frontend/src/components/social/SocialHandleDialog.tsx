import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, type SocialAccount, type SocialPlatform } from '@/lib/api';
import { platformLabel } from '@/lib/format';

interface SocialHandleDialogProps {
  /** Rede em conexão. Sem rede, o diálogo fica fechado. */
  platform: SocialPlatform | null;
  /** Conta atual nessa rede, se houver. O @ dela vem preenchido. */
  account: SocialAccount | null;
  suggestedHandle: string | null;
  onClose: () => void;
  onChanged: (account: SocialAccount) => void;
}

function bare(handle: string | null | undefined): string {
  return (handle ?? '').trim().replace(/^@+/, '');
}

export function SocialHandleDialog({
  platform,
  account,
  suggestedHandle,
  onClose,
  onChanged,
}: SocialHandleDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = platform !== null;
  const name = platform ? platformLabel(platform) : '';
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setHandle(bare(account?.username) || bare(suggestedHandle));
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // Só reinicia ao abrir.
  }, [open]);

  function close() {
    if (!busy) onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!platform) return;
    if (!bare(handle)) {
      setError(`Informe o seu @ do ${name}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await api.claimHandle(platform, bare(handle));
      onChanged(next);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível conferir esse @. Tente de novo.');
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
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form className="confirm-dialog-body" onSubmit={submit} noValidate>
        <h2 id={titleId}>Conectar o {name}</h2>
        <p>
          Informe o @ do perfil onde você posta. As views são lidas do perfil público, sem pedir a
          sua senha. A equipe confere o perfil antes de ele entrar no ranking.
        </p>
        <div className="mt-4">
          <Input
            id={inputId}
            name={inputId}
            label={`Seu @ no ${name}`}
            leading="@"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="seuperfil"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="text-base sm:text-sm"
            error={error ?? undefined}
            hint="O perfil precisa estar público."
            disabled={busy}
          />
        </div>
        <div className="confirm-dialog-actions">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            Conectar
          </Button>
        </div>
      </form>
    </dialog>
  );
}
