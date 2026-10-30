import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

interface NoteDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  /** Recados prontos que preenchem o campo com um toque. */
  suggestions?: string[];
  busy?: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

const MIN_NOTE = 3;
const MAX_NOTE = 500;

/** Diálogo de confirmação com o recado que a pessoa vai receber no app. */
export function NoteDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  suggestions = [],
  busy = false,
  onConfirm,
  onCancel,
}: NoteDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const fieldId = useId();
  const hintId = useId();
  const [note, setNote] = useState('');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setNote('');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const ready = note.trim().length >= MIN_NOTE;

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form
        className="confirm-dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !busy) onConfirm(note.trim());
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {suggestions.length > 0 ? (
          <>
            <p className="note-suggestions-label">Recados prontos</p>
            <div className="note-suggestions" role="group" aria-label="Recados prontos">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={note === item}
                  onClick={() => setNote(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <label className="note-field" htmlFor={fieldId}>
          Recado para a pessoa
          <textarea
            id={fieldId}
            rows={4}
            maxLength={MAX_NOTE}
            aria-describedby={hintId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <small id={hintId}>
            {ready
              ? `${note.length} de ${MAX_NOTE} caracteres. A pessoa lê esse texto no app.`
              : 'Escolha um recado pronto ou escreva o seu. A pessoa lê esse texto no app.'}
          </small>
        </label>
        <div className="confirm-dialog-actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            disabled={!ready}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
