-- Iteración 4: precios por supermercado, sobras.
-- (Las fotos solo rellenan recipes.image_url, ya existente; el digest vive en
-- las Edge Functions y el cron de 008.)

-- ---------------------------------------------------------------------------
-- Supermercados: catálogo fijo de solo lectura, ampliable por migración.

create table supermarkets (
  id smallint primary key,
  name text not null unique,
  slug text not null unique
);

insert into supermarkets (id, name, slug) values
  (1, 'Día', 'dia'),
  (2, 'Lidl', 'lidl'),
  (3, 'Mercadona', 'mercadona');

alter table supermarkets enable row level security;
create policy "supermarkets_select" on supermarkets for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Histórico de precios por (hogar, ingrediente, supermercado). El precio
-- vigente es la observación más reciente de cada trío (vista current_prices).

create table ingredient_prices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  ingredient_id integer not null references ingredients (id) on delete cascade,
  supermarket_id smallint not null references supermarkets (id),
  price numeric not null check (price > 0), -- € por unidad de compra (envase)
  quantity numeric, -- cantidad del envase si se detecta (ej. 6 huevos, 500 g)
  unit text, -- unidad de esa cantidad
  seen_on date not null default current_date,
  source text not null default 'ticket', -- 'ticket' | 'manual'
  created_at timestamptz not null default now()
);

create index ingredient_prices_lookup
  on ingredient_prices (household_id, ingredient_id, supermarket_id, seen_on desc);

alter table ingredient_prices enable row level security;
create policy "ingredient_prices_select" on ingredient_prices for select to authenticated
  using (is_household_member(household_id));
create policy "ingredient_prices_insert" on ingredient_prices for insert to authenticated
  with check (is_household_member(household_id));
create policy "ingredient_prices_update" on ingredient_prices for update to authenticated
  using (is_household_member(household_id));
create policy "ingredient_prices_delete" on ingredient_prices for delete to authenticated
  using (is_household_member(household_id));

-- Precio vigente: la observación más reciente por (hogar, ingrediente, súper).
-- security_invoker: la vista respeta la RLS de ingredient_prices.
create view current_prices
  with (security_invoker = true) as
  select distinct on (household_id, ingredient_id, supermarket_id)
    household_id, ingredient_id, supermarket_id, price, quantity, unit, seen_on
  from ingredient_prices
  order by household_id, ingredient_id, supermarket_id, seen_on desc, created_at desc;

-- ---------------------------------------------------------------------------
-- Sobras: atributo de la comida cocinada. El enum meal_entry_type ya incluye
-- 'sobras' desde el MVP; al consumir una sobra se crea una entrada de ese tipo
-- enlazada al origen por source_entry_id.

alter table meal_entries add column leftover_servings numeric not null default 0
  check (leftover_servings >= 0);
alter table meal_entries add column frozen boolean not null default false;
alter table meal_entries add column source_entry_id uuid
  references meal_entries (id) on delete set null;
