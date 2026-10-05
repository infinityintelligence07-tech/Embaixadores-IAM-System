UPDATE public.app_settings
SET value = '10'::jsonb,
    updated_at = now()
WHERE key = 'sync_interval_minutes';
