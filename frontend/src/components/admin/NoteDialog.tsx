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
  const fieldId = useId();
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

  const ready = note.trim().length >= 3;

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="confirm-dialog-body">
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
        {suggestions.length > 0 ? (
          <div className="note-suggestions" role="group" aria-label="Recados prontos">
            {suggestions.map((item) => (
              <button key={item} type="button" onClick={() => setNote(item)}>
                {item}
              </button>
            ))}
          </div>
        ) : null}
        <label className="note-field" htmlFor={fieldId}>
          Recado para a pessoa
          <textarea
            id={fieldId}
            rows={4}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <div className="confirm-dialog-actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => onConfirm(note.trim())}
            disabled={!ready}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
