
-- master_tasks: drop permissive, add admin-only write policies
DROP POLICY IF EXISTS "Anyone can view master tasks" ON public.master_tasks;
DROP POLICY IF EXISTS "Authenticated users can insert master tasks" ON public.master_tasks;
DROP POLICY IF EXISTS "Authenticated users can update master tasks" ON public.master_tasks;
DROP POLICY IF EXISTS "Authenticated users can delete master tasks" ON public.master_tasks;

ALTER TABLE public.master_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view master tasks"
ON public.master_tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert master tasks"
ON public.master_tasks FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super'::app_role));

CREATE POLICY "Admins can update master tasks"
ON public.master_tasks FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super'::app_role));

CREATE POLICY "Admins can delete master tasks"
ON public.master_tasks FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super'::app_role));

-- master_subtasks
DROP POLICY IF EXISTS "Anyone can view master subtasks" ON public.master_subtasks;
DROP POLICY IF EXISTS "Authenticated users can insert master subtasks" ON public.master_subtasks;
DROP POLICY IF EXISTS "Authenticated users can update master subtasks" ON public.master_subtasks;
DROP POLICY IF EXISTS "Authenticated users can delete master subtasks" ON public.master_subtasks;

ALTER TABLE public.master_subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view master subtasks"
ON public.master_subtasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert master subtasks"
ON public.master_subtasks FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super'::app_role));

CREATE POLICY "Admins can update master subtasks"
ON public.master_subtasks FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super'::app_role));

CREATE POLICY "Admins can delete master subtasks"
ON public.master_subtasks FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super'::app_role));
