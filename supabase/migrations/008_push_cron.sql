-- Programación de los push (recordatorio dominical y caducidades).
--
-- Requiere extensiones pg_cron y pg_net (disponibles en Supabase; actívalas en
-- Dashboard → Database → Extensions) y la Edge Function `send-push` desplegada:
--   supabase functions deploy send-push
--   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@email
--
-- La función se despliega con --no-verify-jwt y se protege con un secret propio
-- (PUSH_CRON_SECRET, también como secret de la Edge Function). Sustituye
-- <PROJECT_REF> y <PUSH_SECRET> antes de ejecutar. Nota: las claves nuevas
-- sb_publishable_ no son JWT, por eso no sirve el header Authorization aquí.

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
      'x-push-secret', '<PUSH_SECRET>'
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
      'x-push-secret', '<PUSH_SECRET>'
    ),
    body := '{"type": "expiry"}'::jsonb
  );
  $$
);

-- Diario 20:00 (UTC): "saca del congelador" si la receta de mañana lo necesita
select cron.schedule(
  'push-defrost',
  '0 20 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', '<PUSH_SECRET>'
    ),
    body := '{"type": "defrost"}'::jsonb
  );
  $$
);
