CREATE OR REPLACE FUNCTION public.onboard_company(_company_name text, _slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create company
  INSERT INTO public.companies (name, slug)
  VALUES (_company_name, _slug)
  RETURNING id INTO _company_id;

  -- Update profile
  UPDATE public.profiles
  SET company_id = _company_id
  WHERE user_id = _user_id;

  -- Grant admin role (upsert)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN _company_id;
END;
$$;