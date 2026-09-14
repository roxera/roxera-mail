# Roxera Mail — SETUP (100% free: Cloudflare Pages + Firebase + Resend)

## 1. Что уже сделано в коде
- `src/` — SPA в стиле Gmail: `/` лендинг, `/temp` временная почта (15 мин, продлить/пересоздать), `/app` кабинет (до 5 ящиков, приём+отправка, шифрование, PDF), `/login` (Google+GitHub), `/admin` (домены, дашборд, логи in/out, аудит, анти-спам).
- `workers/mail-inbound` — Email Worker: парсинг (postal-mime), проверка домена, скоринг спама, пересылка в `mail-api/internal/ingest`.
- `workers/mail-api` — REST: `POST /v1/temp`, `POST /v1/temp/:id/extend`, `DELETE /v1/temp/:id`, `POST /v1/send` (Resend), `GET /v1/admin/stats`, `POST /internal/ingest|ingest-log`, cron `scheduled` (чистка).
- `firestore.rules`, `storage.rules`, `firestore.indexes.json` — роли `admin/moderator/user`, лимит 5, вложения 10MB.

## 2. Firebase (free Spark)
1. Создайте проект, включите **Auth → Google + GitHub** (для GitHub создайте OAuth App: callback `https://<project>.firebaseapp.com/__/auth/handler`).
2. Создайте **Firestore + Storage**. Задеплойте правила:
   `firebase deploy --only firestore:rules,firestore:indexes,storage`
3. Скопируйте `.env.example` → `.env`, заполните `VITE_FIREBASE_*` из настроек проекта.
4. Первый админ: создайте юзера входом, затем выдайте роль:
   ```bash
   # вариант через Admin SDK (node):
   node scripts/set-admin.js <uid> admin
   ```
   Скрипт ниже использует service-account JSON (не коммитить!).

## 3. Cloudflare (free)
1. Для каждого домена (temp: `roxera-mail.*`, permanent: корни без префикса — если корня нет, используйте те же `roxera-mail.*` и поменяйте `PERMANENT_DOMAINS` в `src/lib/config.ts`):
   - Добавьте зону, переключите NS.
   - **Email → Email Routing → Enable → Catch-all → Send to Worker → `roxera-mail-inbound`**.
   - Добавьте SPF/DMARC (Email Routing подскажет TXT), DKIM включится сам.
2. Workers:
   ```bash
   cd workers/mail-api && npm i && npx wrangler secret put FIREBASE_PROJECT_ID && npx wrangler secret put FIREBASE_WEB_KEY && npx wrangler secret put FIREBASE_ADMIN_TOKEN && npx wrangler secret put RESEND_API_KEY && npx wrangler secret put INTERNAL_KEY && npx wrangler deploy
   cd ../mail-inbound && npm i && npx wrangler secret put INTERNAL_KEY && npx wrangler deploy
   # в mail-inbound vars MAIL_API_BASE укажите URL mail-api + /internal/ingest
   ```
   `FIREBASE_ADMIN_TOKEN` — OAuth access token сервис-аккаунта с ролью `datastore.user`:
   `gcloud auth print-access-token --impersonate-service-account=firebase-adminsdk@<project>.iam.gserviceaccount.com` (обновляйте по cron, либо вынесите ingest напрямую через Admin SDK в Cloud Run — Phase 2).
3. Pages: подключите репо `roxera-mail/`, Build `npm run build`, Output `dist`, env `VITE_*` + `VITE_API_BASE=https://roxera-mail-api.<you>.workers.dev`.

## 4. Resend (free 100/день)
1. Добавьте **только permanent-домены** → подтвердите SPF/DKIM.
2. `RESEND_API_KEY` → secret в `mail-api`. From всегда равен адресу ящика (иначе Resend отклонит).
3. Следите за квотой: дашборд Resend + `connectionLogs(direction=out)`. При 429 UI покажет «квота исчерпана».

## 5. Проверка (DoD)
- Temp создаётся <2с, письмо с Gmail приходит <15с, таймер 15:00 + Extend работает.
- Google/GitHub логин, создание 5 ящиков, 6-й отклоняется.
- Отправка доходит, пишется Sent + connectionLogs(out).
- Спам уходит в quarantine, виден в /admin.
- PDF одного письма и всего ящика скачивается.
- /admin открывает только admin (или демо без .env).

## 6. Известные ограничения free
- Resend 100/день на весь сервис → нужен глобальный счётчик (Phase 2: очередь).
- `pp.ua/.cfd/.eu.org` часто в спам-листах → для важной почты добавьте нормальный домен в /admin.
- Firestore free: чистите expired (cron), пагинация 25–100, вложения ≤10MB.
