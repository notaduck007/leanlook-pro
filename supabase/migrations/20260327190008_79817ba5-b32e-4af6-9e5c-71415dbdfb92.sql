
ALTER TABLE lookahead_lines
ADD COLUMN IF NOT EXISTS variance_reason TEXT DEFAULT NULL;

ALTER TABLE lookahead_lines
ADD COLUMN IF NOT EXISTS variance_note TEXT DEFAULT NULL;

-- Validation trigger for variance_reason values
CREATE OR REPLACE FUNCTION public.validate_variance_reason()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.variance_reason IS NOT NULL AND NEW.variance_reason NOT IN (
    'make_ready', 'manpower', 'material_equipment', 'design', 'weather', 'ahj', 'other'
  ) THEN
    RAISE EXCEPTION 'Invalid variance_reason value: %', NEW.variance_reason;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_variance_reason_trigger ON lookahead_lines;
CREATE TRIGGER validate_variance_reason_trigger
  BEFORE INSERT OR UPDATE ON lookahead_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_variance_reason();
