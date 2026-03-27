
-- ==========================================
-- 1. PROFILES TABLE (linked to auth.users)
-- ==========================================
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role_title TEXT DEFAULT 'Membro',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- 2. MEMBERS TABLE
-- ==========================================
CREATE TABLE public.members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Membro',
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Visitante', 'Inativo')),
  phone TEXT,
  email TEXT,
  since TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all members" ON public.members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert members" ON public.members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can update own members" ON public.members FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can delete own members" ON public.members FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- 3. TRANSACTIONS TABLE
-- ==========================================
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Entrada', 'Saída')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Confirmado', 'Pago', 'Pendente')),
  category TEXT DEFAULT 'Geral',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all transactions" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can update own transactions" ON public.transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can delete own transactions" ON public.transactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ==========================================
-- 4. EVENTS TABLE
-- ==========================================
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  time TEXT,
  location TEXT DEFAULT 'A definir',
  color TEXT DEFAULT 'bg-accent',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all events" ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert events" ON public.events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can update own events" ON public.events FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can delete own events" ON public.events FOR DELETE TO authenticated USING (auth.uid() = user_id);
