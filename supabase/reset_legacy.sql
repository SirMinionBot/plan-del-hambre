-- ⚠️ DESTRUCTIVO: elimina el schema de la app antigua (calendario-dietas) y
-- cualquier resto parcial de plan-del-hambre en este proyecto Supabase.
-- BORRA TODOS LOS DATOS de esas tablas (los usuarios de auth.users se conservan).
-- Ejecutar SOLO si este proyecto va a dedicarse a plan-del-hambre.
-- Después, aplicar 001..008 en orden.

-- Tablas (viejas y nuevas comparten varios nombres; cascade arrastra FKs y políticas)
drop table if exists
  meal_entry_portions,
  meal_entries,
  shopping_list_items,
  shopping_lists,
  pantry_items,
  week_template_slots,
  week_templates,
  push_subscriptions,
  recipe_ratings,
  user_excluded_ingredients,
  recipe_ingredients,
  recipes,
  ingredients,
  ingredient_categories,
  household_members,
  households,
  profiles
  cascade;

-- Trigger y funciones
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user() cascade;
drop function if exists is_household_member(uuid) cascade;
drop function if exists my_household() cascade;
drop function if exists create_household(text) cascade;
drop function if exists join_household(text) cascade;
drop function if exists seed_recipe(jsonb) cascade;
drop function if exists validate_seed_recipes() cascade;

-- Enums (los de la app vieja y los nuevos)
drop type if exists meal_slot cascade;
drop type if exists meal_entry_type cascade;
drop type if exists season_tag cascade;
