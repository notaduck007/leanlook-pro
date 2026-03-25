
ALTER TABLE public.lookahead_lines ADD COLUMN parent_line_id uuid REFERENCES public.lookahead_lines(id) ON DELETE CASCADE DEFAULT NULL;
