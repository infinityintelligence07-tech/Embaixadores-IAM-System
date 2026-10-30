import { useState } from 'react';

const PAGE_SIZE = 10;
const MAX_ON_DEMAND = 30;

/** Até 10 itens abertos; de 11 a 30, dez e o resto sob demanda; acima de 30, páginas. */
export function useListWindow(total: number) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [page, setPage] = useState(1);
  const paged = total > MAX_ON_DEMAND;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = paged ? (current - 1) * PAGE_SIZE : 0;
  const end = paged ? start + PAGE_SIZE : visible;

  return {
    start,
    end,
    total,
    paged,
    page: current,
    pages,
    visible,
    setPage,
    showMore: () => setVisible((count) => count + PAGE_SIZE),
    reset: () => {
      setVisible(PAGE_SIZE);
      setPage(1);
    },
  };
}

export function ListFooter({
  list,
  label,
}: {
  list: ReturnType<typeof useListWindow>;
  /** Nome da lista para leitores de tela, por exemplo "embaixadores". */
  label: string;
}) {
  if (list.paged) {
    return (
      <nav className="admin-row admin-pager" aria-label={`Páginas de ${label}`}>
        <span className="admin-meta">
          Página {list.page} de {list.pages} · {list.total} no total
        </span>
        <div className="admin-actions">
          <button
            type="button"
            disabled={list.page <= 1}
            onClick={() => list.setPage(list.page - 1)}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={list.page >= list.pages}
            onClick={() => list.setPage(list.page + 1)}
          >
            Próxima
          </button>
        </div>
      </nav>
    );
  }

  if (list.total <= list.visible) return null;
  const remaining = list.total - list.visible;
  return (
    <div className="admin-row">
      <button type="button" className="admin-more" onClick={list.showMore}>
        Mostrar mais {Math.min(PAGE_SIZE, remaining)} de {remaining} restantes
      </button>
    </div>
  );
}
