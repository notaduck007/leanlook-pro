
ALTER TABLE public.master_tasks
  ADD COLUMN IF NOT EXISTS default_duration integer,
  ADD COLUMN IF NOT EXISTS default_trade text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Allow authenticated users to insert and delete master tasks
CREATE POLICY "Authenticated users can insert master tasks"
  ON public.master_tasks FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete master tasks"
  ON public.master_tasks FOR DELETE TO authenticated
  USING (true);

-- Enable realtime for master_tasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.master_tasks;
