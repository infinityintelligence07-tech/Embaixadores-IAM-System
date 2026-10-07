import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  profileLoading: boolean;
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
  const [profileLoading, setProfileLoading] = useState(false);

  const sessionUserId = session?.user.id ?? null;
  const requestSeq = useRef(0);

  const refreshProfile = useCallback(async () => {
    if (!sessionUserId) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }

    const seq = ++requestSeq.current;
    setProfileLoading(true);
    try {
      const me = await api.me();
      if (seq !== requestSeq.current) return;
      setProfile(me);
      setProfileError(null);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      if (error instanceof ApiError && error.status === 401) {
        // A sessão local não vale mais no servidor: encerra para não entrar em loop
        await supabase.auth.signOut().catch(() => undefined);
        setState('expired');
        setProfileError('Sua sessão expirou. Entre de novo para continuar.');
      } else {
        setProfileError(
          error instanceof Error ? error.message : 'Não foi possível carregar seu perfil.',
        );
      }
      setProfile(null);
    } finally {
      if (seq === requestSeq.current) setProfileLoading(false);
    }
  }, [sessionUserId]);

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
    if (state === 'authenticated' && sessionUserId) {
      void refreshProfile();
    }

    if (state === 'unauthenticated') {
      setProfile(null);
      setProfileError(null);
    }
  }, [state, sessionUserId, refreshProfile]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Mesmo com falha remota, limpa a sessão local para a pessoa conseguir sair
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    setProfile(null);
    setProfileError(null);
    setSession(null);
    setUser(null);
    setState('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      session,
      user,
      profile,
      profileLoading,
      profileError,
      isAdmin: profile?.role === 'admin',
      refreshProfile,
      signOut,
    }),
    [state, session, user, profile, profileLoading, profileError, refreshProfile, signOut],
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
