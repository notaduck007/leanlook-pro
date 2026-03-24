CREATE POLICY "Authenticated users can delete master subtasks"
ON public.master_subtasks
FOR DELETE
TO authenticated
USING (true);