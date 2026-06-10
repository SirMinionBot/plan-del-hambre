-- Programación de los push (recordatorio dominical y caducidades).
--
-- Requiere extensiones pg_cron y pg_net (disponibles en Supabase; actívalas en
-- Dashboard → Database → Extensions) y la Edge Function `send-push` desplegada:
--   supabase functions deploy send-push
--   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@email
--
-- Las llamadas usan el anon key (la función no expone datos, solo dispara envíos
-- con service role internamente). Sustituye <PROJECT_REF> y <ANON_KEY> antes de
-- ejecutar, o lanza este bloque desde el SQL Editor del dashboard.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Domingo 17:00 (UTC): ¿semana siguiente sin planificar?
select cron.schedule(
  'push-weekly-plan',
  '0 17 * * 0',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body := '{"type": "weekly-plan"}'::jsonb
  );
  $$
);

-- Diario 08:00 (UTC): caducidades a <= 2 días
select cron.schedule(
  'push-expiry',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body := '{"type": "expiry"}'::jsonb
  );
  $$
);
