
-- 1) user_roles UPDATE policy -> authenticated only
DROP POLICY IF EXISTS "Admins can update company user roles" ON public.user_roles;
CREATE POLICY "Admins can update company user roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = user_roles.user_id
        AND p.company_id = public.get_user_company_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = user_roles.user_id
        AND p.company_id = public.get_user_company_id(auth.uid())
    )
  );

-- 2) Remove subcontractors from realtime publication (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'subcontractors'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.subcontractors';
  END IF;
END $$;

-- 3) realtime.messages RLS policies (company-scoped topics)
DROP POLICY IF EXISTS "Authenticated can read own-company realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can send own-company realtime" ON realtime.messages;

CREATE POLICY "Authenticated can read own-company realtime" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'company:' || public.get_user_company_id(auth.uid())::text || ':%'
  );

CREATE POLICY "Authenticated can send own-company realtime" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    realtime.topic() LIKE 'company:' || public.get_user_company_id(auth.uid())::text || ':%'
  );

-- 4) Lock down SECURITY DEFINER function execute grants + ensure search_path pinned
-- Recreate to guarantee SET search_path = public, then fix grants

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_company(_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT id INTO _company_id FROM public.companies WHERE slug = _slug;
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Company not found. Please check the code and try again.';
  END IF;
  UPDATE public.profiles SET company_id = _company_id WHERE user_id = _user_id;
  RETURN _company_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.onboard_company(_company_name text, _slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.companies (name, slug)
  VALUES (_company_name, _slug)
  RETURNING id INTO _company_id;
  UPDATE public.profiles SET company_id = _company_id WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN _company_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_user_company_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_company(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.onboard_company(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_user_company_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_company(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onboard_company(text, text) TO authenticated;

-- 5) Move pg_trgm to extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

DO $$
DECLARE
  _current_schema text;
BEGIN
  SELECT n.nspname INTO _current_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF _current_schema IS NOT NULL AND _current_schema <> 'extensions' THEN
    BEGIN
      EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
    EXCEPTION WHEN OTHERS THEN
      -- Drop dependent trigram indexes, move extension, recreate indexes
      DECLARE
        r record;
        idx_defs text[] := ARRAY[]::text[];
      BEGIN
        FOR r IN
          SELECT indexrelid::regclass::text AS idx_name,
                 pg_get_indexdef(indexrelid) AS idx_def
          FROM pg_index i
          JOIN pg_opclass oc ON oc.oid = ANY(i.indclass)
          WHERE oc.opcname IN ('gin_trgm_ops', 'gist_trgm_ops')
        LOOP
          idx_defs := idx_defs || r.idx_def;
          EXECUTE 'DROP INDEX IF EXISTS ' || r.idx_name;
        END LOOP;

        EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';

        FOREACH _current_schema IN ARRAY idx_defs LOOP
          EXECUTE _current_schema;
        END LOOP;
      END;
    END;
  END IF;
END $$;
