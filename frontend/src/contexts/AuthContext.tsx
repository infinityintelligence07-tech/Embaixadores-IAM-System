import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { ApiError, api, type MeResponse } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'expired';

interface AuthContextValue {
  state: AuthState;
  session: Session | null;
  user: User | null;
  profile: MeResponse | null;
  profileError: string | null;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!session) {
      setProfile(null);
      setProfileError(null);
      return;
    }

    try {
      const me = await api.me();
      setProfile(me);
      setProfileError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState('expired');
        setProfileError('Sua sessão expirou. Faça login novamente.');
      } else {
        setProfileError(
          error instanceof Error ? error.message : 'Não foi possível carregar seu perfil.',
        );
      }
      setProfile(null);
    }
  }, [session]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setState(data.session ? 'authenticated' : 'unauthenticated');
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setState(nextSession ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state === 'authenticated' && session) {
      void refreshProfile();
    }

    if (state === 'unauthenticated') {
      setProfile(null);
      setProfileError(null);
    }
  }, [state, session, refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProfileError(null);
    setState('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      session,
      user,
      profile,
      profileError,
      isAdmin: profile?.role === 'admin',
      refreshProfile,
      signOut,
    }),
    [state, session, user, profile, profileError, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }
  return context;
}
