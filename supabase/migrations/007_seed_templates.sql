-- Plantillas de semana de serie (household_id null = visibles para todos, no editables)

do $$
declare
  t_gym uuid;
  t_tupper uuid;
  t_rapida uuid;
begin
  insert into week_templates (household_id, name, description) values
    (null, 'Gimnasio', 'Cenas ligeras y sin guisos pesados; comidas normales. Para semanas de entreno.')
    returning id into t_gym;
  insert into week_templates (household_id, name, description) values
    (null, 'Fiambreras', 'Comidas transportables de lunes a viernes para llevar al trabajo.')
    returning id into t_tupper;
  insert into week_templates (household_id, name, description) values
    (null, 'Semana rápida', 'Nada de más de 35 minutos entre semana. Para semanas infernales.')
    returning id into t_rapida;
  insert into week_templates (household_id, name, description) values
    (null, 'Libre', 'Sin restricciones: el recomendador decide solo por gustos, variedad y temporada.');

  -- Gimnasio: cenas sin guiso/dulce y rápidas todos los días
  insert into week_template_slots (template_id, weekday, meal_slot, required_tags, excluded_tags, max_total_minutes)
  select t_gym, d, 'cena', '{}', '{guiso,dulce}', 40 from generate_series(0, 6) d;

  -- Fiambreras: comidas L-V transportables
  insert into week_template_slots (template_id, weekday, meal_slot, required_tags, excluded_tags, max_total_minutes)
  select t_tupper, d, 'comida', '{fiambrera}', '{}', null from generate_series(0, 4) d;

  -- Semana rápida: comida y cena L-V a 35 min máximo
  insert into week_template_slots (template_id, weekday, meal_slot, required_tags, excluded_tags, max_total_minutes)
  select t_rapida, d, s::meal_slot, '{}', '{}', 35
  from generate_series(0, 4) d, unnest(array['comida', 'cena']) s;
end;
$$;
