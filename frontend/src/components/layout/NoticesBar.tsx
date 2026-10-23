import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { useAuth } from '@/contexts/AuthContext';
import { api, type AppNotification } from '@/lib/api';

function variantFor(kind: string): 'success' | 'warning' | 'error' {
  if (kind.endsWith('approved')) return 'success';
  if (kind.endsWith('rejected')) return 'error';
  return 'warning';
}

/** Recados da equipe (aprovação, ajuste pedido, reprovação) até a pessoa marcar como lido. */
export function NoticesBar() {
  const { refreshProfile } = useAuth();
  const location = useLocation();
  const [notices, setNotices] = useState<AppNotification[]>([]);
  const refreshed = useRef(false);

  useEffect(() => {
    let active = true;
    api
      .notifications()
      .then((items) => {
        if (!active) return;
        const unread = items.filter((item) => !item.readAt);
        setNotices(unread);
        // A aprovação muda o status do perfil; recarrega uma vez para liberar as telas.
        if (!refreshed.current && unread.some((item) => item.kind.endsWith('approved'))) {
          refreshed.current = true;
          void refreshProfile();
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [location.pathname, refreshProfile]);

  if (notices.length === 0) return null;

  async function dismiss(id: string) {
    setNotices((current) => current.filter((item) => item.id !== id));
    await api.markNotificationRead(id).catch(() => undefined);
  }

  return (
    <div className="mb-5 space-y-2.5" aria-label="Avisos da equipe">
      {notices.slice(0, 3).map((notice) => (
        <Alert key={notice.id} variant={variantFor(notice.kind)} title={notice.title}>
          <span className="block">{notice.body}</span>
          <button
            type="button"
            className="mt-2 text-sm font-semibold underline underline-offset-4"
            onClick={() => void dismiss(notice.id)}
          >
            Entendi
          </button>
        </Alert>
      ))}
    </div>
  );
}
