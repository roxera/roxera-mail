# Roxera Mail — TempMail + 5 постоянных ящиков

Бесплатный стек: **Cloudflare Pages + Workers + Firebase (Auth/Firestore/Storage) + Resend**. Дизайн — Gmail: Google Blue `#1a73e8`, Roboto/Google Sans, Material Symbols.

- `/temp` — временная почта: автогенерация, TTL 15 мин, продлить +15 (max 24ч), пересоздать/удалить, только приём.
- `/app` — кабинет (Google/GitHub): до 5 постоянных ящиков `имя@домен` (те же корни без `roxera-mail.`), приём + отправка через Resend, шифрование паролем (AES-GCM), экспорт в PDF.
- `/admin` — домены (temp/permanent/both), дашборд, логи in/out, аудит, анти-спам отчёт.
- `workers/mail-inbound` — приём через Cloudflare Email Workers + `postal-mime` + скоринг спама.
- `workers/mail-api` — `POST /v1/temp`, `POST /v1/temp/:id/extend`, `DELETE /v1/temp/:id`, `POST /v1/send`, `GET /v1/admin/stats`, `POST /internal/ingest`, cron.

Быстрый старт:
```bash
cp .env.example .env   # заполнить VITE_FIREBASE_* + VITE_API_BASE
npm install
npm run dev            # демо-режим работает и без .env (Firebase-заглушки)
npm run build          # проверка: tsc + vite
```

Полная инструкция: **SETUP.md** (Firebase, Cloudflare Email Routing → Worker, Resend, первый admin, лимиты free).
Правила: `firestore.rules`, `storage.rules`, `firestore.indexes.json`.
