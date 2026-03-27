ALTER TABLE public.lookahead_lines 
ADD COLUMN percent_complete integer DEFAULT 0,
ADD COLUMN expected_completion_date date DEFAULT NULL;