'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Sidebar from './Sidebar';
import Header from './Header';

interface ProfileData {
  role: string;
  full_name: string;
  unique_user_id: string;
  status: string;
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!profileData || profileData.status !== 'active') {
        router.push('/login');
        return;
      }

      setProfile(profileData as ProfileData);
      setLoading(false);
    };
    void check();
  }, [router]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar isAdmin={profile.role === 'admin'} />
      <div className="ml-64">
        <Header name={profile.full_name} uid={profile.unique_user_id} role={profile.role} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}