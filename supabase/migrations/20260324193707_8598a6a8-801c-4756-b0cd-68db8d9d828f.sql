-- Allow authenticated users to update master task names
CREATE POLICY "Authenticated users can update master tasks"
ON public.master_tasks
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to update master subtask names
CREATE POLICY "Authenticated users can update master subtasks"
ON public.master_subtasks
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);