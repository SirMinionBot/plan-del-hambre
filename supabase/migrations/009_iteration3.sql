-- Iteración 3: presupuesto, coste real, descongelar, Telegram

-- Presupuesto semanal del hogar (€); null = sin presupuesto
alter table households add column weekly_budget numeric;

-- Coste real de la compra (del ticket escaneado), junto al estimado
alter table shopping_lists add column actual_cost numeric;

-- Ingredientes que típicamente viven en el congelador (aviso de descongelar)
alter table ingredients add column typically_frozen boolean not null default false;
update ingredients set typically_frozen = true
where name like '%congelad%'
   or name in ('merluza', 'bacalao', 'gambas', 'calamares', 'langostinos',
               'guisantes', 'falafel', 'anillas de calamar', 'boquerones',
               'carne picada de ternera', 'carne picada mixta');

-- Vinculación de chats de Telegram con usuarios (la gestiona la Edge Function
-- con service role; el código de vinculación vive en el perfil)
create table telegram_links (
  chat_id bigint primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table telegram_links enable row level security;
create policy "telegram_links_own" on telegram_links for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Código de un solo uso mostrado en el perfil: /start <código> en el bot
alter table profiles add column telegram_link_code uuid not null default gen_random_uuid();
