'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

export default function DashboardAccessGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const checkAccess = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;

      if (sessionError) {
        setError('Unable to verify your sign-in. Please try again.');
        return;
      }

      const session = data.session;
      if (!session) {
        router.replace('/login');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!active) return;

      if (profileError) {
        router.replace('/login?approval=check-failed');
        return;
      }

      if (profile?.status !== 'active') {
        const status = profile?.status || 'not-found';
        router.replace(`/login?approval=${encodeURIComponent(status)}`);
        return;
      }

      setAuthorized(true);
    };

    void checkAccess();
    return () => {
      active = false;
    };
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        {error}
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Verifying account access...
      </div>
    );
  }

  return <>{children}</>;
}
