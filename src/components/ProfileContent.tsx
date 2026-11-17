'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { User, Mail, Shield, Hash, Calendar, Loader2, Pencil, Check, X } from 'lucide-react';

interface ProfileData {
  full_name: string;
  email: string;
  role: string;
  unique_user_id: string;
  created_at: string;
  status: string;
}

export default function ProfileContent() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [fullName, setFullName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const load = async () => {
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
      setProfile(profileData as ProfileData | null);
      setFullName(profileData?.full_name || '');
      setLoading(false);
    };
    void load();
  }, [router]);

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingName) return;
    setError('');
    setSuccess('');
    setSavingName(true);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) {
        router.replace('/login');
        return;
      }

      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fullName }),
      });
      const result = await response.json() as { fullName?: string; error?: string };
      if (!response.ok || !result.fullName) {
        throw new Error(result.error || 'Could not update your name.');
      }

      setProfile((current) => current ? { ...current, full_name: result.fullName! } : current);
      setFullName(result.fullName);
      setEditingName(false);
      setSuccess('Your name was updated.');
      window.dispatchEvent(new CustomEvent('profile-name-updated', { detail: result.fullName }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update your name.');
    } finally {
      setSavingName(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '80px 0',
      }}>
        <Loader2
          size={28}
          className="animate-spin"
          style={{ color: '#e8740c' }}
        />
      </div>
    );
  }

  if (!profile) return null;

  const infoRows = [
    { icon: User, label: 'Full Name', value: profile.full_name },
    { icon: Mail, label: 'Email', value: profile.email },
    {
      icon: Shield,
      label: 'Role',
      value: profile.role?.charAt(0).toUpperCase()
        + profile.role?.slice(1),
    },
    { icon: Hash, label: 'User ID', value: profile.unique_user_id },
    {
      icon: Calendar,
      label: 'Joined',
      value: new Date(profile.created_at).toLocaleDateString(
        'en-US',
        { year: 'numeric', month: 'long', day: 'numeric' }
      ),
    },
  ];

  return (
    <div className="animate-fade-in profile-content" style={{ maxWidth: '640px' }}>
      <h1 style={{
        fontSize: '24px',
        fontWeight: 700,
        color: '#1a1a1a',
        marginBottom: '24px',
      }}>
        Profile
      </h1>

      {(error || success) && (
        <div role={error ? 'alert' : 'status'} style={{
          marginBottom: '16px',
          padding: '12px 16px',
          borderRadius: '10px',
          background: error ? '#fef2f2' : '#f0fdf4',
          color: error ? '#b91c1c' : '#166534',
          fontSize: '13px',
        }}>
          {error || success}
        </div>
      )}

      <div style={{
        background: '#fffdf9',
        borderRadius: '16px',
        border: '1px solid #e8ddd0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1a1a, #2d2218)',
          padding: '32px 24px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'rgba(232, 116, 12, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              fontWeight: 700,
              color: '#e8740c',
            }}>
              {profile.full_name?.charAt(0)?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#ffffff',
              }}>
                {profile.full_name}
              </h2>
              <div style={{
                display: 'flex',
                gap: '8px',
                marginTop: '6px',
              }}>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: profile.role === 'admin'
                    ? 'rgba(232, 116, 12, 0.25)'
                    : 'rgba(255,255,255,0.15)',
                  color: profile.role === 'admin'
                    ? '#e8740c'
                    : '#e8ddd0',
                }}>
                  {profile.role?.charAt(0).toUpperCase()
                    + profile.role?.slice(1)}
                </span>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: profile.status === 'active'
                    ? 'rgba(22, 163, 74, 0.2)'
                    : 'rgba(220, 38, 38, 0.2)',
                  color: profile.status === 'active'
                    ? '#4ade80'
                    : '#fca5a5',
                }}>
                  {profile.status?.charAt(0).toUpperCase()
                    + profile.status?.slice(1)}
                </span>
              </div>
            </div>
            {!editingName && (
              <button
                type="button"
                onClick={() => {
                  setFullName(profile.full_name);
                  setEditingName(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '9px', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}
              >
                <Pencil size={14} /> Edit name
              </button>
            )}
          </div>
        </div>

        {editingName && (
          <form onSubmit={saveName} style={{ padding: '18px 24px', borderBottom: '1px solid #f0e6da', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label htmlFor="profile-full-name" style={{ width: '100%', fontSize: '13px', fontWeight: 600, color: '#6b5c4c' }}>
              Full name
            </label>
            <input
              id="profile-full-name"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              minLength={2}
              maxLength={100}
              required
              autoFocus
              disabled={savingName}
              style={{ flex: 1, minWidth: '200px', padding: '10px 12px', border: '1px solid #e8ddd0', borderRadius: '9px', background: '#fff', color: '#1a1a1a' }}
            />
            <button type="submit" disabled={savingName} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', border: 0, borderRadius: '9px', background: '#e8740c', color: '#fff', cursor: savingName ? 'wait' : 'pointer', opacity: savingName ? 0.7 : 1 }}>
              {savingName ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {savingName ? 'Saving...' : 'Save'}
            </button>
            <button type="button" disabled={savingName} onClick={() => { setEditingName(false); setFullName(profile.full_name); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', border: '1px solid #e8ddd0', borderRadius: '9px', background: '#fffdf9', color: '#6b5c4c', cursor: savingName ? 'wait' : 'pointer' }}>
              <X size={15} /> Cancel
            </button>
          </form>
        )}

        {/* Info */}
        <div>
          {infoRows.map((row, i) => {
            const Icon = row.icon;
            return (
              <div
                key={row.label}
                className="profile-info-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px 24px',
                  borderBottom: i < infoRows.length - 1
                    ? '1px solid #f0e6da'
                    : 'none',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '160px',
                  flexShrink: 0,
                }}>
                  <Icon size={16} style={{ color: '#8a7968' }} />
                  <span style={{
                    fontSize: '13px',
                    color: '#8a7968',
                  }}>
                    {row.label}
                  </span>
                </div>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#1a1a1a',
                }}>
                  {row.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}