import type { AdminAccount, Campaign } from '@/lib/api';

/** Exemplos da tela de prévia. Carregado sob demanda, nunca no app publicado. */

type Person = Pick<
  AdminAccount,
  'profileId' | 'fullName' | 'publicName' | 'email' | 'whatsapp' | 'membershipStatus'
>;

const helena: Person = {
  profileId: 'u1',
  fullName: 'Helena Prado',
  publicName: 'Helena',
  email: 'helena@exemplo.com',
  whatsapp: '11987654321',
  membershipStatus: 'approved',
};

const mateus: Person = {
  profileId: 'u2',
  fullName: 'Mateus Cardoso',
  publicName: 'Mateus',
  email: 'mateus@exemplo.com',
  whatsapp: '21991234567',
  membershipStatus: 'approved',
};

const igor: Person = {
  profileId: 'u3',
  fullName: 'Igor Nunes',
  publicName: 'Igor',
  email: 'igor@exemplo.com',
  whatsapp: null,
  membershipStatus: 'suspended',
};

const livia: Person = {
  profileId: 'u4',
  fullName: 'Lívia Moraes',
  publicName: 'Lívia',
  email: 'livia@exemplo.com',
  whatsapp: '31988887777',
  membershipStatus: 'approved',
};

function account(
  person: Person,
  fields: Omit<AdminAccount, keyof Person | 'profileUrl' | 'lastSyncAt'> &
    Partial<Pick<AdminAccount, 'lastSyncAt'>>,
): AdminAccount {
  return { ...person, profileUrl: null, lastSyncAt: null, ...fields };
}

export const previewAccounts: AdminAccount[] = [
  account(helena, {
    accountId: 'demo-acc-1',
    platform: 'instagram',
    username: 'helena.prado',
    reviewStatus: 'pending',
    reviewNote: null,
    reviewedAt: null,
    reviewedByName: null,
    connectedAt: '2026-10-29T14:20:00.000Z',
    views: 0,
  }),
  account(helena, {
    accountId: 'demo-acc-2',
    platform: 'tiktok',
    username: 'helena.prado',
    reviewStatus: 'pending',
    reviewNote: null,
    reviewedAt: null,
    reviewedByName: null,
    connectedAt: '2026-10-29T14:24:00.000Z',
    views: 0,
  }),
  account(livia, {
    accountId: 'demo-acc-3',
    platform: 'instagram',
    username: 'livia.mente',
    reviewStatus: 'pending',
    reviewNote: null,
    reviewedAt: null,
    reviewedByName: null,
    connectedAt: '2026-10-30T09:10:00.000Z',
    views: 0,
  }),
  account(livia, {
    accountId: 'demo-acc-4',
    platform: 'instagram',
    username: 'livia.cortes',
    reviewStatus: 'changes_requested',
    reviewNote: 'Deixe o perfil público para as views entrarem.',
    reviewedAt: '2026-10-30T16:00:00.000Z',
    reviewedByName: 'Equipe IAM',
    connectedAt: '2026-10-28T11:00:00.000Z',
    views: 0,
  }),
  account(mateus, {
    accountId: 'demo-acc-5',
    platform: 'instagram',
    username: 'mateus.cardoso',
    reviewStatus: 'approved',
    reviewNote: null,
    reviewedAt: '2026-09-03T15:00:00.000Z',
    reviewedByName: 'Equipe IAM',
    connectedAt: '2026-09-02T12:30:00.000Z',
    lastSyncAt: '2026-10-31T14:00:00.000Z',
    views: 184_320,
  }),
  account(mateus, {
    accountId: 'demo-acc-6',
    platform: 'tiktok',
    username: 'mateus.cortes',
    reviewStatus: 'approved',
    reviewNote: null,
    reviewedAt: '2026-09-10T10:00:00.000Z',
    reviewedByName: 'Equipe IAM',
    connectedAt: '2026-09-09T20:15:00.000Z',
    lastSyncAt: '2026-10-31T14:05:00.000Z',
    views: 97_450,
  }),
  account(mateus, {
    accountId: 'demo-acc-7',
    platform: 'tiktok',
    username: 'mateus.iam',
    reviewStatus: 'rejected',
    reviewNote: 'O perfil não publica conteúdo do programa.',
    reviewedAt: '2026-10-12T18:30:00.000Z',
    reviewedByName: 'Equipe IAM',
    connectedAt: '2026-10-11T08:00:00.000Z',
    views: 0,
  }),
  account(igor, {
    accountId: 'demo-acc-8',
    platform: 'instagram',
    username: 'igor.nunes',
    reviewStatus: 'approved',
    reviewNote: null,
    reviewedAt: '2026-08-12T09:00:00.000Z',
    reviewedByName: 'Equipe IAM',
    connectedAt: '2026-08-11T12:20:00.000Z',
    lastSyncAt: '2026-08-20T12:00:00.000Z',
    views: 3_210,
  }),
];

export const previewCampaigns: Campaign[] = [
  {
    id: 'demo-camp-1',
    name: 'Outubro de 2026',
    kind: 'monthly',
    startsAt: '2026-10-01T03:00:00.000Z',
    endsAt: '2026-11-01T03:00:00.000Z',
    firstDay: '2026-10-01',
    lastDay: '2026-10-31',
    state: 'active',
  },
  {
    id: 'demo-camp-2',
    name: 'Imersão Prosperar',
    kind: 'campaign',
    startsAt: '2026-11-10T03:00:00.000Z',
    endsAt: '2026-11-25T03:00:00.000Z',
    firstDay: '2026-11-10',
    lastDay: '2026-11-24',
    state: 'scheduled',
  },
  {
    id: 'demo-camp-3',
    name: 'Setembro de 2026',
    kind: 'monthly',
    startsAt: '2026-09-01T03:00:00.000Z',
    endsAt: '2026-10-01T03:00:00.000Z',
    firstDay: '2026-09-01',
    lastDay: '2026-09-30',
    state: 'finished',
  },
];
