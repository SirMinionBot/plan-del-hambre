-- PLAN DEL HAMBRE — schema inicial
-- Planificador semanal de comidas para una pareja (household de 2).

-- ===========================================================================
-- ENUMS
-- ===========================================================================

create type meal_slot as enum ('desayuno', 'comida', 'cena');

-- 'sobras' lo coloca el planificador cuando una receta batch rinde más días
create type meal_entry_type as enum ('normal', 'fuera', 'cheat', 'evento', 'sobras');

create type season_tag as enum ('todo-el-ano', 'primavera', 'verano', 'otono', 'invierno');

-- ===========================================================================
-- PERFILES Y HOGAR
-- ===========================================================================

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Sin nombre',
  daily_calorie_goal integer not null default 2000,
  protein_goal_g integer,
  carbs_goal_g integer,
  fat_goal_g integer,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- accent: color de persona en la UI ('a' rojo, 'b' azul)
create table household_members (
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  accent text not null default 'a' check (accent in ('a', 'b')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id) -- un usuario pertenece a un único hogar
);

-- Helper para todas las políticas RLS del hogar
create or replace function is_household_member(hid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

create or replace function my_household()
returns uuid
language sql
security definer set search_path = public
stable
as $$
  select household_id from household_members where user_id = auth.uid() limit 1;
$$;

-- Crear hogar con membresía inicial en una sola operación (evita el huevo-gallina
-- de RLS: el RETURNING del insert exigiría ser ya miembro).
create or replace function create_household(household_name text)
returns households
language plpgsql
security definer set search_path = public
as $$
declare
  h households;
begin
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un hogar';
  end if;
  insert into households (name, created_by) values (household_name, auth.uid()) returning * into h;
  insert into household_members (household_id, user_id, accent) values (h.id, auth.uid(), 'a');
  return h;
end;
$$;

-- Unirse por código de invitación (el solicitante no puede leer el hogar aún,
-- así que la búsqueda por código va con security definer).
create or replace function join_household(code text)
returns households
language plpgsql
security definer set search_path = public
as $$
declare
  h households;
  n_members int;
begin
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un hogar';
  end if;
  select * into h from households where invite_code = upper(trim(code));
  if h.id is null then
    raise exception 'Código de invitación no válido';
  end if;
  select count(*) into n_members from household_members where household_id = h.id;
  if n_members >= 2 then
    raise exception 'Este hogar ya tiene dos miembros';
  end if;
  insert into household_members (household_id, user_id, accent)
  values (h.id, auth.uid(), case when exists (
    select 1 from household_members where household_id = h.id and accent = 'a'
  ) then 'b' else 'a' end);
  return h;
end;
$$;

-- ===========================================================================
-- INGREDIENTES
-- ===========================================================================

create table ingredient_categories (
  id serial primary key,
  name text not null unique,
  parent_id integer references ingredient_categories (id) on delete set null,
  sort_order integer not null default 0
);

create table ingredients (
  id serial primary key,
  name text not null unique,
  category_id integer references ingredient_categories (id) on delete set null,
  -- nutrición por 100 g
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric not null default 0,
  default_unit text not null default 'g' check (default_unit in ('g', 'ml', 'pieza', 'cdta', 'cda', 'taza')),
  grams_per_unit numeric, -- para convertir 'pieza'/'cda'... a gramos
  estimated_price_per_100g numeric -- € aproximados, para el coste semanal
);

-- ===========================================================================
-- RECETAS
-- ===========================================================================

-- household_id null = catálogo global seed; con valor = receta del hogar
create table recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  name text not null,
  description text,
  instructions text,
  servings integer not null default 2,
  prep_minutes integer not null default 0,
  cook_minutes integer not null default 0,
  tags text[] not null default '{}', -- rapida, batch, fiambrera, sin-horno...
  season season_tag not null default 'todo-el-ano',
  batch_days integer not null default 1, -- días que rinde (sobras)
  main_ingredient text, -- para la penalización de variedad del recomendador
  estimated_cost numeric, -- € por receta completa; si null se calcula de ingredientes
  image_url text,
  source_url text,
  created_at timestamptz not null default now()
);

create table recipe_ingredients (
  recipe_id uuid not null references recipes (id) on delete cascade,
  ingredient_id integer not null references ingredients (id) on delete cascade,
  quantity numeric not null,
  unit text not null default 'g',
  primary key (recipe_id, ingredient_id)
);

-- ===========================================================================
-- GUSTOS Y VETOS (por persona)
-- ===========================================================================

create table recipe_ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references recipes (id) on delete cascade,
  rating integer check (rating between 1 and 5),
  vetoed boolean not null default false, -- "esto no entra en casa"
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create table user_excluded_ingredients (
  user_id uuid not null references auth.users (id) on delete cascade,
  ingredient_id integer not null references ingredients (id) on delete cascade,
  reason text, -- alergia, manía...
  primary key (user_id, ingredient_id)
);

-- ===========================================================================
-- CALENDARIO
-- ===========================================================================

create table meal_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  date date not null,
  meal_slot meal_slot not null,
  entry_type meal_entry_type not null default 'normal',
  recipe_id uuid references recipes (id) on delete set null,
  cook_user_id uuid references auth.users (id) on delete set null, -- quién cocina
  cooked_at timestamptz, -- marcada como cocinada (alimenta histórico y rachas)
  pinned boolean not null default false, -- "petición de la semana": el recomendador no la toca
  notes text,
  created_at timestamptz not null default now(),
  unique (household_id, date, meal_slot)
);

-- Raciones asimétricas y comidas divergentes:
-- cada miembro tiene sus raciones y, opcionalmente, una receta distinta.
create table meal_entry_portions (
  entry_id uuid not null references meal_entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  servings numeric not null default 1,
  recipe_id uuid references recipes (id) on delete set null, -- override divergente
  primary key (entry_id, user_id)
);

-- ===========================================================================
-- DESPENSA (presencia + caducidad, sin cantidades)
-- ===========================================================================

create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  ingredient_id integer references ingredients (id) on delete set null,
  expires_on date,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- LISTA DE LA COMPRA
-- ===========================================================================

create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_lists (id) on delete cascade,
  ingredient_id integer references ingredients (id) on delete set null,
  name text not null,
  quantity numeric,
  unit text,
  category text, -- pasillo del súper (de ingredient_categories)
  in_pantry boolean not null default false, -- "ya lo tenéis" según despensa
  checked boolean not null default false,
  checked_by uuid references auth.users (id) on delete set null,
  sort_order integer not null default 0
);

-- ===========================================================================
-- PLANTILLAS DE SEMANA
-- ===========================================================================

-- household_id null = plantilla de serie (gimnasio, fiambreras...)
create table week_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- Restricciones por hueco que consume el recomendador al rellenar
create table week_template_slots (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references week_templates (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = lunes
  meal_slot meal_slot not null,
  required_tags text[] not null default '{}',
  excluded_tags text[] not null default '{}',
  max_total_minutes integer,
  unique (template_id, weekday, meal_slot)
);

-- ===========================================================================
-- PUSH (PWA)
-- ===========================================================================

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- ROW LEVEL SECURITY
-- ===========================================================================

alter table profiles enable row level security;
alter table households enable row level security;
alter table household_members enable row level security;
alter table ingredient_categories enable row level security;
alter table ingredients enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table recipe_ratings enable row level security;
alter table user_excluded_ingredients enable row level security;
alter table meal_entries enable row level security;
alter table meal_entry_portions enable row level security;
alter table pantry_items enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;
alter table week_templates enable row level security;
alter table week_template_slots enable row level security;
alter table push_subscriptions enable row level security;

-- Perfiles: el propio, y el del compañero de hogar (para nombre y objetivos)
create policy "profiles_select" on profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from household_members hm
    where hm.user_id = profiles.id and is_household_member(hm.household_id)
  ));
create policy "profiles_update" on profiles for update to authenticated
  using (id = auth.uid());

-- Hogar: miembros leen y editan; cualquiera autenticado puede crear
create policy "households_select" on households for select to authenticated
  using (is_household_member(id));
create policy "households_insert" on households for insert to authenticated
  with check (created_by = auth.uid());
create policy "households_update" on households for update to authenticated
  using (is_household_member(id));

-- Membresías: ver las de tu hogar; unirte a ti mismo (vía código de invitación)
create policy "members_select" on household_members for select to authenticated
  using (user_id = auth.uid() or is_household_member(household_id));
create policy "members_insert" on household_members for insert to authenticated
  with check (user_id = auth.uid());
create policy "members_delete" on household_members for delete to authenticated
  using (user_id = auth.uid());

-- Catálogo de ingredientes: lectura para todos; escritura autenticada
create policy "categories_select" on ingredient_categories for select to authenticated using (true);
create policy "ingredients_select" on ingredients for select to authenticated using (true);
create policy "ingredients_insert" on ingredients for insert to authenticated with check (true);
create policy "ingredients_update" on ingredients for update to authenticated with check (true);

-- Recetas: catálogo global (household_id null) legible por todos;
-- las del hogar solo por sus miembros
create policy "recipes_select" on recipes for select to authenticated
  using (household_id is null or is_household_member(household_id));
create policy "recipes_insert" on recipes for insert to authenticated
  with check (household_id is not null and is_household_member(household_id));
create policy "recipes_update" on recipes for update to authenticated
  using (household_id is not null and is_household_member(household_id));
create policy "recipes_delete" on recipes for delete to authenticated
  using (household_id is not null and is_household_member(household_id));

create policy "recipe_ingredients_select" on recipe_ingredients for select to authenticated
  using (exists (
    select 1 from recipes r where r.id = recipe_id
      and (r.household_id is null or is_household_member(r.household_id))
  ));
create policy "recipe_ingredients_all" on recipe_ingredients for all to authenticated
  using (exists (
    select 1 from recipes r where r.id = recipe_id
      and r.household_id is not null and is_household_member(r.household_id)
  ));

-- Gustos y exclusiones: cada uno los suyos; el compañero puede leerlos
create policy "ratings_select" on recipe_ratings for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from household_members hm
    where hm.user_id = recipe_ratings.user_id and is_household_member(hm.household_id)
  ));
create policy "ratings_write" on recipe_ratings for insert to authenticated
  with check (user_id = auth.uid());
create policy "ratings_update" on recipe_ratings for update to authenticated
  using (user_id = auth.uid());
create policy "ratings_delete" on recipe_ratings for delete to authenticated
  using (user_id = auth.uid());

create policy "exclusions_select" on user_excluded_ingredients for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from household_members hm
    where hm.user_id = user_excluded_ingredients.user_id and is_household_member(hm.household_id)
  ));
create policy "exclusions_write" on user_excluded_ingredients for insert to authenticated
  with check (user_id = auth.uid());
create policy "exclusions_delete" on user_excluded_ingredients for delete to authenticated
  using (user_id = auth.uid());

-- Todo lo que cuelga del hogar: política única por membresía
create policy "meal_entries_all" on meal_entries for all to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy "portions_all" on meal_entry_portions for all to authenticated
  using (exists (
    select 1 from meal_entries e
    where e.id = entry_id and is_household_member(e.household_id)
  ));

create policy "pantry_all" on pantry_items for all to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy "shopping_lists_all" on shopping_lists for all to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy "shopping_items_all" on shopping_list_items for all to authenticated
  using (exists (
    select 1 from shopping_lists l
    where l.id = list_id and is_household_member(l.household_id)
  ));

-- Plantillas: las de serie legibles por todos; las propias, del hogar
create policy "templates_select" on week_templates for select to authenticated
  using (household_id is null or is_household_member(household_id));
create policy "templates_write" on week_templates for insert to authenticated
  with check (household_id is not null and is_household_member(household_id));
create policy "templates_update" on week_templates for update to authenticated
  using (household_id is not null and is_household_member(household_id));
create policy "templates_delete" on week_templates for delete to authenticated
  using (household_id is not null and is_household_member(household_id));

create policy "template_slots_select" on week_template_slots for select to authenticated
  using (exists (
    select 1 from week_templates t where t.id = template_id
      and (t.household_id is null or is_household_member(t.household_id))
  ));
create policy "template_slots_all" on week_template_slots for all to authenticated
  using (exists (
    select 1 from week_templates t where t.id = template_id
      and t.household_id is not null and is_household_member(t.household_id)
  ));

create policy "push_all" on push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===========================================================================
-- ÍNDICES
-- ===========================================================================

create index idx_meal_entries_household_date on meal_entries (household_id, date);
create index idx_recipes_household on recipes (household_id);
create index idx_recipes_tags on recipes using gin (tags);
create index idx_pantry_household_expiry on pantry_items (household_id, expires_on);
create index idx_ratings_recipe on recipe_ratings (recipe_id);
