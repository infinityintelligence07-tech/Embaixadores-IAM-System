import { Check, Copy } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, type SocialAccount, type SocialPlatform } from '@/lib/api';
import { platformLabel } from '@/lib/format';

type Step = 'handle' | 'code';

interface SocialHandleDialogProps {
  /** Rede em conexão. Sem rede, o diálogo fica fechado. */
  platform: SocialPlatform | null;
  /** Conta atual nessa rede, se houver. Com código pendente, o diálogo abre direto na confirmação. */
  account: SocialAccount | null;
  suggestedHandle: string | null;
  onClose: () => void;
  /** Chamado a cada mudança na conta (código gerado ou confirmação). */
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
  const pendingCode =
    account?.status === 'pending_verification' ? account.verificationCode : null;
  const [step, setStep] = useState<Step>('handle');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setStep(pendingCode ? 'code' : 'handle');
      setHandle(bare(account?.username) || bare(suggestedHandle));
      setError(null);
      setCopied(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // Só reinicia ao abrir; mudanças da conta com o diálogo aberto seguem o fluxo atual.
  }, [open]);

  function close() {
    if (!busy) onClose();
  }

  async function submitHandle(event: FormEvent) {
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
      if (next.status === 'pending_verification') {
        setStep('code');
        setCopied(false);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível conferir esse @. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!platform) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.verifyHandle(platform);
      onChanged(next);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível conferir a bio. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!pendingCode) return;
    try {
      await navigator.clipboard.writeText(pendingCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const username = bare(account?.username);
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
      {step === 'handle' || !pendingCode ? (
        <form className="confirm-dialog-body" onSubmit={submitHandle} noValidate>
          <h2 id={titleId}>Conectar o {name}</h2>
          <p>
            Informe o @ do perfil onde você posta. As views são lidas do perfil público, sem
            pedir a sua senha.
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
              Continuar
            </Button>
          </div>
        </form>
      ) : (
        <div className="confirm-dialog-body">
          <h2 id={titleId}>Confirme que o perfil é seu</h2>
          <p>
            Cole este código na bio de <strong>@{username}</strong> no {name} e salve. Ele só
            serve para provar que a conta é sua.
          </p>
          <div className="handle-code">
            <code aria-label="Código para a bio">{pendingCode}</code>
            <Button variant="secondary" size="sm" className="min-h-[44px]" onClick={copyCode}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <ol className="handle-steps">
            <li>No {name}, abra o seu perfil e toque em Editar perfil.</li>
            <li>Cole o código na Bio e salve.</li>
            <li>Volte aqui e toque em Conferir bio.</li>
          </ol>
          <p>Depois da confirmação, você pode tirar o código da bio.</p>
          {error ? (
            <p role="alert" className="handle-error">
              {error}
            </p>
          ) : null}
          <div className="confirm-dialog-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setError(null);
                setStep('handle');
              }}
            >
              Trocar o @
            </Button>
            <Button loading={busy} onClick={verify}>
              Conferir bio
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
