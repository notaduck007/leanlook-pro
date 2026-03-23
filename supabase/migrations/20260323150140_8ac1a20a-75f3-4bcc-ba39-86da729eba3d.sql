
-- Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'pm', 'super');
CREATE TYPE public.project_status AS ENUM ('active', 'completed', 'on_hold', 'archived');
CREATE TYPE public.lookahead_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- Timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Companies
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User roles (separate table per security guidelines)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  display_name TEXT,
  project_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status project_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Schedule versions
CREATE TABLE public.schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version_number INT NOT NULL DEFAULT 1
);
ALTER TABLE public.schedule_versions ENABLE ROW LEVEL SECURITY;

-- Tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_version_id UUID NOT NULL REFERENCES public.schedule_versions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL,
  duration TEXT,
  start_date DATE,
  finish_date DATE,
  percent_complete NUMERIC DEFAULT 0,
  parent_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  predecessors JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Look-aheads
CREATE TABLE public.look_aheads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  super_id UUID NOT NULL REFERENCES auth.users(id),
  week_start_date DATE NOT NULL,
  status lookahead_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.look_aheads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_look_aheads_updated_at BEFORE UPDATE ON public.look_aheads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lookahead lines
CREATE TABLE public.lookahead_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookahead_id UUID NOT NULL REFERENCES public.look_aheads(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  custom_text TEXT,
  status_per_day JSONB DEFAULT '{}',
  notes TEXT,
  photos TEXT[] DEFAULT '{}',
  assigned_trade TEXT,
  materials_needed TEXT,
  constraints TEXT,
  sort_order INT DEFAULT 0
);
ALTER TABLE public.lookahead_lines ENABLE ROW LEVEL SECURITY;

-- Task templates
CREATE TABLE public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  checklist_items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

-- Helper: get user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id
$$;

-- RLS POLICIES

-- Companies
CREATE POLICY "Users can view own company" ON public.companies
  FOR SELECT TO authenticated
  USING (id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Anyone can insert companies" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update own company" ON public.companies
  FOR UPDATE TO authenticated
  USING (id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- User roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Profiles
CREATE POLICY "Users can view profiles in company" ON public.profiles
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Projects
CREATE POLICY "Users can view company projects" ON public.projects
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage projects" ON public.projects
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Schedule versions
CREATE POLICY "Users can view schedule versions" ON public.schedule_versions
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert schedule versions" ON public.schedule_versions
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- Tasks
CREATE POLICY "Users can view tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "System can insert tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- Look-aheads
CREATE POLICY "Users can view look-aheads" ON public.look_aheads
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Supers can manage own look-aheads" ON public.look_aheads
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND super_id = auth.uid());

CREATE POLICY "Supers can insert look-aheads" ON public.look_aheads
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND super_id = auth.uid());

-- Lookahead lines
CREATE POLICY "Users can view lookahead lines" ON public.lookahead_lines
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can manage lookahead lines" ON public.lookahead_lines
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert lookahead lines" ON public.lookahead_lines
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- Task templates
CREATE POLICY "Users can view templates" ON public.task_templates
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage templates" ON public.task_templates
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('schedules', 'schedules', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('lookahead-photos', 'lookahead-photos', true);

CREATE POLICY "Auth users can upload schedules" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'schedules');

CREATE POLICY "Auth users can view schedules" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'schedules');

CREATE POLICY "Auth users can upload photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'lookahead-photos');

CREATE POLICY "Anyone can view photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'lookahead-photos');
