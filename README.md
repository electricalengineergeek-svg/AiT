# AiT

[Відкрити AiT](https://electricalengineergeek-svg.github.io/AiT/app/)

## Збереження Telegram-користувачів (безкоштовно)

У проєкті вже додано відправку запуску Mini App у Supabase. Залишилось налаштувати БД.

### 1. Створити безкоштовний Supabase проєкт

1. Зареєструйся на [supabase.com](https://supabase.com/).
2. Створи новий проєкт (Free plan).
3. Відкрий `Project Settings` -> `API`.
4. Скопіюй `Project URL` і `anon public` key.

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

### 3. Увімкнути RLS та дозвіл на insert

```sql
alter table public.telegram_launches enable row level security;

drop policy if exists "Allow anon insert telegram launches" on public.telegram_launches;

create policy "Allow anon insert telegram launches"
on public.telegram_launches
for insert
to anon
with check (true);
```

### 4. Заповнити конфіг

Відкрий [app/config.js](app/config.js) і встав:

```javascript
window.AIT_SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
window.AIT_SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

### 5. Задеплоїти

Після push на GitHub Pages кожен запуск у Telegram Mini App буде додавати запис у таблицю `telegram_launches`.

## Важливо про безпеку

- Поточний варіант швидкий і безкоштовний, але вставляє дані напряму з клієнта.
- Для production-рівня краще додати backend (наприклад, Cloudflare Worker) і валідувати `initData` через bot token перед записом у БД.
