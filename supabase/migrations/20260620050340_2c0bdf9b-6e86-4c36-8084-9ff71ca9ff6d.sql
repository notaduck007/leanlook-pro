ALTER TABLE public.project_constraints
  ALTER COLUMN rank DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS need_by_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS lookahead_line_id uuid REFERENCES public.lookahead_lines(id) ON DELETE SET NULL;

ALTER TABLE public.project_constraints
  DROP CONSTRAINT IF EXISTS project_constraints_status_check,
  ADD CONSTRAINT project_constraints_status_check
    CHECK (status IN ('open','in_progress','closed'));

ALTER TABLE public.project_constraints
  DROP CONSTRAINT IF EXISTS project_constraints_type_check,
  ADD CONSTRAINT project_constraints_type_check
    CHECK (type IN ('rfi','submittal','material','access','design','manpower','permit','other'));

CREATE INDEX IF NOT EXISTS project_constraints_project_id_idx
  ON public.project_constraints(project_id);
CREATE INDEX IF NOT EXISTS project_constraints_status_idx
  ON public.project_constraints(status);
CREATE INDEX IF NOT EXISTS project_constraints_lookahead_line_id_idx
  ON public.project_constraints(lookahead_line_id);