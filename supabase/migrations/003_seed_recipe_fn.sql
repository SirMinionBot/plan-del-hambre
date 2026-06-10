-- Función de seed de recetas del catálogo global (household_id null).
-- Cada lote de recetas (004+) es una serie de llamadas compactas a seed_recipe.
--
-- Formato del jsonb:
-- {
--   "nombre": "...", "descripcion": "...", "instrucciones": "paso1\npaso2",
--   "raciones": 2, "prep_min": 10, "cocina_min": 20,
--   "tags": ["rapida", "fiambrera"], "temporada": "todo-el-ano",
--   "batch_days": 1, "principal": "pollo",
--   "ingredientes": [{"n": "pechuga de pollo", "q": 300, "u": "g"}, ...]
-- }

create or replace function seed_recipe(r jsonb)
returns uuid
language plpgsql
as $$
declare
  rid uuid;
  ing jsonb;
  iid integer;
begin
  insert into recipes (
    household_id, name, description, instructions, servings,
    prep_minutes, cook_minutes, tags, season, batch_days, main_ingredient
  )
  values (
    null,
    r ->> 'nombre',
    r ->> 'descripcion',
    r ->> 'instrucciones',
    coalesce((r ->> 'raciones')::int, 2),
    coalesce((r ->> 'prep_min')::int, 0),
    coalesce((r ->> 'cocina_min')::int, 0),
    coalesce((select array_agg(t) from jsonb_array_elements_text(r -> 'tags') t), '{}'),
    coalesce((r ->> 'temporada')::season_tag, 'todo-el-ano'),
    coalesce((r ->> 'batch_days')::int, 1),
    r ->> 'principal'
  )
  returning id into rid;

  for ing in select * from jsonb_array_elements(r -> 'ingredientes') loop
    select id into iid from ingredients where name = ing ->> 'n';
    if iid is null then
      raise exception 'Ingrediente no encontrado: % (receta %)', ing ->> 'n', r ->> 'nombre';
    end if;
    insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
    values (rid, iid, (ing ->> 'q')::numeric, coalesce(ing ->> 'u', 'g'));
  end loop;

  return rid;
end;
$$;

-- Validación de plausibilidad: toda receta seed debe tener >= 3 ingredientes
-- y kcal por ración en rango razonable. Llamar al final de cada lote.
create or replace function validate_seed_recipes()
returns void
language plpgsql
as $$
declare
  bad record;
begin
  for bad in
    select r.name, count(ri.ingredient_id) as n_ing,
      coalesce(sum(
        i.calories / 100.0 *
        case ri.unit
          when 'g' then ri.quantity
          when 'ml' then ri.quantity
          else ri.quantity * coalesce(i.grams_per_unit, 0)
        end
      ), 0) / greatest(r.servings, 1) as kcal_per_serving
    from recipes r
    left join recipe_ingredients ri on ri.recipe_id = r.id
    left join ingredients i on i.id = ri.ingredient_id
    where r.household_id is null
    group by r.id, r.name, r.servings
    having count(ri.ingredient_id) < 3
        or coalesce(sum(
          i.calories / 100.0 *
          case ri.unit
            when 'g' then ri.quantity
            when 'ml' then ri.quantity
            else ri.quantity * coalesce(i.grams_per_unit, 0)
          end
        ), 0) / greatest(r.servings, 1) not between 80 and 1500
  loop
    raise exception 'Receta seed implausible: % (% ingredientes, % kcal/ración)',
      bad.name, bad.n_ing, round(bad.kcal_per_serving);
  end loop;
end;
$$;
