import { Injectable, NotFoundException } from '@nestjs/common';
import { getPool } from '../../infrastructure/db/pool';

export type NotificationKind =
  | 'account_approved'
  | 'account_changes_requested'
  | 'account_rejected'
  | 'application_approved'
  | 'application_rejected';

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  async notify(
    profileId: string,
    kind: NotificationKind,
    title: string,
    body: string,
  ): Promise<void> {
    await getPool().query(
      `INSERT INTO notifications (profile_id, kind, title, body) VALUES ($1, $2, $3, $4)`,
      [profileId, kind, title, body],
    );
  }

  /** Marca como lidos os avisos ainda abertos sobre a mesma conta, pelo título. */
  async supersede(profileId: string, label: string): Promise<void> {
    await getPool().query(
      `UPDATE notifications SET read_at = now()
       WHERE profile_id = $1 AND read_at IS NULL AND kind LIKE 'account\\_%' AND strpos(title, $2) > 0`,
      [profileId, label],
    );
  }

  async listFor(profileId: string): Promise<NotificationView[]> {
    const result = await getPool().query(
      `SELECT id, kind, title, body, read_at, created_at
       FROM notifications
       WHERE profile_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [profileId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async markRead(profileId: string, id: string): Promise<void> {
    const result = await getPool().query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND profile_id = $2`,
      [id, profileId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Aviso não encontrado.');
  }
}
