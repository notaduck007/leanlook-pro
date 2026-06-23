CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _display_name text;
BEGIN
  -- Restrict to anslowbryant.com accounts only (case-insensitive)
  IF NEW.email IS NULL OR lower(NEW.email) NOT LIKE '%@anslowbryant.com' THEN
    RAISE EXCEPTION 'Only Anslow Bryant (@anslowbryant.com) accounts can access LeanLook.';
  END IF;

  SELECT id INTO _company_id FROM public.companies WHERE slug = 'anslow-bryant-construction';

  _display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email
  );

  INSERT INTO public.profiles (user_id, display_name, company_id)
  VALUES (NEW.id, _display_name, _company_id);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'super')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;