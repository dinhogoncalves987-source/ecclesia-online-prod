
-- Promote user to superadmin
UPDATE public.user_roles 
SET role = 'superadmin' 
WHERE user_id = '331c86c1-f1dd-478b-a717-72911f2b1a15';

-- Ensure super_admins entry exists
INSERT INTO public.super_admins (user_id, notes)
VALUES ('331c86c1-f1dd-478b-a717-72911f2b1a15', 'Platform owner')
ON CONFLICT DO NOTHING;

-- Add hierarchy_level column to churches for Sede > Matriz > Congregação
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS hierarchy_level text DEFAULT 'matriz';

-- Update existing church
UPDATE public.churches SET hierarchy_level = 'matriz' WHERE is_matriz = true;
UPDATE public.churches SET hierarchy_level = 'congregacao' WHERE is_matriz = false;
