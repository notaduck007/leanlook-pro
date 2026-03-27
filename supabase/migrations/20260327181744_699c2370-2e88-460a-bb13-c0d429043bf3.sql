-- Add ppc_goal to projects (default 80%)
ALTER TABLE public.projects ADD COLUMN ppc_goal integer NOT NULL DEFAULT 80;
COMMENT ON COLUMN public.projects.ppc_goal IS 'PPC target percentage for this project, default 80%';

-- Create project_constraints table for editable Top 10
CREATE TABLE public.project_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  rank integer NOT NULL,
  description text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (project_id, rank)
);

ALTER TABLE public.project_constraints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project constraints"
  ON public.project_constraints FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert project constraints"
  ON public.project_constraints FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can update project constraints"
  ON public.project_constraints FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete project constraints"
  ON public.project_constraints FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));