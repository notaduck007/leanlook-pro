ALTER TABLE public.project_constraints
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_constraints_task_id
  ON public.project_constraints(task_id);