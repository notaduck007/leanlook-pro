
CREATE OR REPLACE FUNCTION public.join_company(_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _company_id uuid;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Look up company by slug
  SELECT id INTO _company_id FROM public.companies WHERE slug = _slug;
  
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Company not found. Please check the code and try again.';
  END IF;

  -- Update profile with company_id
  UPDATE public.profiles
  SET company_id = _company_id
  WHERE user_id = _user_id;

  RETURN _company_id;
END;
$$;
