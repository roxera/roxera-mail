import { credential } from 'firebase-admin';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Usage: GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json node scripts/set-admin.js <uid> [admin|moderator|user]
// Не коммитьте sa.json!
const [uid, role = 'admin'] = process.argv.slice(2);
if (!uid) {
  console.error('Usage: node scripts/set-admin.js <uid> [role]');
  process.exit(1);
}
if (!getApps().length) initializeApp({ credential: credential.applicationDefault() });
await getAuth().setCustomUserClaims(uid, { role });
console.log(`OK: ${uid} -> ${role}`);
process.exit(0);
