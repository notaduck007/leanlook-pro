
-- =====================================================================
-- 1) STORAGE BUCKET POLICIES — company-scoped for schedules & photos
-- =====================================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Auth users can view schedules" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload schedules" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload photos" ON storage.objects;

-- schedules bucket: company-scoped CRUD
CREATE POLICY "Company can view schedules"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'schedules'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

CREATE POLICY "Company can upload schedules"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'schedules'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

CREATE POLICY "Company can update schedules"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'schedules'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'schedules'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

CREATE POLICY "Company can delete schedules"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'schedules'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

-- lookahead-photos bucket: same company-scoped CRUD
CREATE POLICY "Company can view photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'lookahead-photos'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

CREATE POLICY "Company can upload photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lookahead-photos'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

CREATE POLICY "Company can update photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lookahead-photos'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'lookahead-photos'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

CREATE POLICY "Company can delete photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lookahead-photos'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

-- =====================================================================
-- 2) MASTER REPOSITORY — add company_id and scope RLS
-- =====================================================================

ALTER TABLE public.master_tasks
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.master_subtasks
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill master_tasks.company_id from public.tasks where a single company
-- has tasks whose name matches the master task's normalized_name.
UPDATE public.master_tasks mt
SET company_id = sub.company_id
FROM (
  SELECT
    regexp_replace(regexp_replace(lower(t.name), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g') AS norm,
    (array_agg(DISTINCT t.company_id))[1] AS company_id,
    count(DISTINCT t.company_id) AS n
  FROM public.tasks t
  WHERE t.company_id IS NOT NULL
  GROUP BY 1
) sub
WHERE mt.company_id IS NULL
  AND btrim(sub.norm) = mt.normalized_name
  AND sub.n = 1;

-- Backfill master_subtasks.company_id from parent master_task
UPDATE public.master_subtasks ms
SET company_id = mt.company_id
FROM public.master_tasks mt
WHERE ms.master_task_id = mt.id
  AND ms.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_master_tasks_company_id ON public.master_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_master_subtasks_company_id ON public.master_subtasks(company_id);

-- Replace global unique on normalized_name with per-company uniqueness
ALTER TABLE public.master_tasks DROP CONSTRAINT IF EXISTS master_tasks_normalized_name_key;
DROP INDEX IF EXISTS public.master_tasks_normalized_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS master_tasks_company_normalized_name_key
  ON public.master_tasks(company_id, normalized_name);

-- Drop existing RLS policies on master_tasks
DROP POLICY IF EXISTS "Authenticated can view master tasks" ON public.master_tasks;
DROP POLICY IF EXISTS "Admins can insert master tasks" ON public.master_tasks;
DROP POLICY IF EXISTS "Admins can update master tasks" ON public.master_tasks;
DROP POLICY IF EXISTS "Admins can delete master tasks" ON public.master_tasks;

CREATE POLICY "Company can view master tasks"
  ON public.master_tasks FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company can insert master tasks"
  ON public.master_tasks FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company can update master tasks"
  ON public.master_tasks FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company can delete master tasks"
  ON public.master_tasks FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- Drop existing RLS policies on master_subtasks
DROP POLICY IF EXISTS "Authenticated can view master subtasks" ON public.master_subtasks;
DROP POLICY IF EXISTS "Admins can insert master subtasks" ON public.master_subtasks;
DROP POLICY IF EXISTS "Admins can update master subtasks" ON public.master_subtasks;
DROP POLICY IF EXISTS "Admins can delete master subtasks" ON public.master_subtasks;

CREATE POLICY "Company can view master subtasks"
  ON public.master_subtasks FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company can insert master subtasks"
  ON public.master_subtasks FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company can update master subtasks"
  ON public.master_subtasks FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company can delete master subtasks"
  ON public.master_subtasks FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
