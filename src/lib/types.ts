export type Role = 'admin' | 'moderator' | 'user';
export type DomainType = 'temp' | 'permanent' | 'both';
export type OwnerType = 'temp' | 'user';
export type Direction = 'in' | 'out';
export type SpamVerdict = 'inbox' | 'quarantine' | 'blocked';

export interface TempMailbox {
  id: string;
  address: string;
  domain: string;
  expiresAt: string; // ISO
  createdAt: string;
}

export interface PermanentMailbox {
  id: string;
  userId: string;
  address: string;
  local: string;
  domain: string;
  createdAt: string;
  blocked?: boolean;
}

export interface AttachmentRef {
  name: string;
  mime: string;
  size: number;
  url?: string;
  storagePath?: string;
}

export interface MailMessage {
  id: string;
  mailboxId: string;
  ownerType: OwnerType;
  direction: Direction;
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  // Если зашифровано паролем — здесь base64 AES-GCM пакет, а text/html пусты.
  encryptedPayload?: string;
  encrypted?: boolean;
  spamScore?: number;
  spamVerdict?: SpamVerdict;
  attachments?: AttachmentRef[];
  createdAt: string;
  expiresAt?: string;
}

export interface DomainRow {
  id: string; // сам домен
  domain: string;
  type: DomainType;
  status: 'active' | 'disabled';
  dnsVerified: boolean;
  resendVerified: boolean;
  createdAt: string;
}

export interface ConnectionLog {
  id: string;
  ts: string;
  direction: Direction;
  from: string;
  to: string;
  domain: string;
  status: string;
  reason?: string;
}

export interface AuditLog {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
}

export interface GlobalSettings {
  tempTtlMin: number;
  tempMaxAgeH: number;
  maxPermanentPerUser: number;
  outboundDailyQuota: number;
  blockFrom: string[];
  blockDomains: string[];
  blockWords: string[];
}
