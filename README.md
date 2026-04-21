# AiT

[Відкрити AiT](https://electricalengineergeek-svg.github.io/AiT/app/)

## Збереження Telegram-користувачів (безпечний production-режим)

У проєкті використовується безпечний флоу:

1. Клієнт відправляє тільки `init_data` та технічні метадані на Cloudflare Worker.
2. Worker валідує підпис `init_data` через `bot token`.
3. Після успішної валідації Worker пише запис у Supabase через `service_role` ключ.

### 1. Створити безкоштовний Supabase проєкт

1. Зареєструйся на [supabase.com](https://supabase.com/).
2. Створи новий проєкт (Free plan).
3. Відкрий `Project Settings` -> `API`.
4. Скопіюй `Project URL`.

### 2. Створити таблицю для запусків

Виконай у SQL Editor:

```sql
create table if not exists public.telegram_launches (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id bigint not null,
  username text,
  first_name text,
  last_name text,
  language_code text,
  is_premium boolean,
  is_bot boolean,
  app_path text,
  app_url text,
  platform text,
  launch_source text
);

create index if not exists idx_telegram_launches_user_id
  on public.telegram_launches (user_id);

create index if not exists idx_telegram_launches_created_at
  on public.telegram_launches (created_at desc);
```

### 3. Увімкнути RLS і прибрати anon insert

```sql
alter table public.telegram_launches enable row level security;

drop policy if exists "Allow anon insert telegram launches" on public.telegram_launches;
```

### 4. Розгорнути Cloudflare Worker

Файли Worker вже додані у [worker/src/index.js](worker/src/index.js) та [worker/wrangler.toml](worker/wrangler.toml).

1. Увійди в Cloudflare і створи API Token для Workers.
2. Встанови Wrangler (якщо ще не встановлений):

```bash
npm install -g wrangler
```

1. У каталозі `worker` виконай:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

1. Додай змінну `SUPABASE_URL`:

```bash
wrangler secret put SUPABASE_URL
```

1. Задеплой Worker:

```bash
wrangler deploy
```

1. Скопіюй URL задеплоєного Worker, наприклад:

```text
https://ait-telegram-telemetry.<your-subdomain>.workers.dev
```

1. Якщо потрібно, зміни `ALLOWED_ORIGIN` у [worker/wrangler.toml](worker/wrangler.toml).

### 5. Заповнити конфіг фронтенду

Відкрий [app/config.js](app/config.js) і встав:

```javascript
window.AIT_TELEMETRY_ENDPOINT = 'https://ait-telegram-telemetry.<your-subdomain>.workers.dev';
```

### 6. Задеплоїти

Після push на GitHub Pages кожен запуск у Telegram Mini App буде додавати запис у таблицю `telegram_launches`.

## Важливо про безпеку

- Не використовуй `service_role` ключ у фронтенді.
- Якщо раніше використовував прямий insert з клієнта, видали `anon insert` policy.
- У Worker варто тримати `ALLOWED_ORIGIN` лише для дозволеного домену застосунку.
