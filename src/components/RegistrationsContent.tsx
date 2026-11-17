'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import {
  UserCheck,
  UserX,
  Clock,
  Users,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
} from 'lucide-react';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  unique_user_id: string;
  created_at: string;
}

export default function RegistrationsContent() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'active' | 'rejected' | 'blocked'>('pending');
  const [updatingProfileId, setUpdatingProfileId] = useState<string | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setProfiles(data || []);
    } catch (fetchError) {
      setError(fetchError instanceof Error
        ? fetchError.message
        : 'Could not load registrations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) { router.push('/login'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (profile?.role !== 'admin') {
        router.push('/dashboard');
        return;
      }
      await fetchProfiles();
    };
    void load();
  }, [router]);

  const updateStatus = async (id: string, status: 'active' | 'rejected' | 'blocked') => {
    setError('');
    setUpdatingProfileId(id);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) {
        router.replace('/login');
        return;
      }

      const response = await fetch('/api/admin/registrations', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, status }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Could not update the registration status.');
      }

      await fetchProfiles();
    } catch (updateError) {
      setError(updateError instanceof Error
        ? updateError.message
        : 'Could not update the registration status.');
    } finally {
      setUpdatingProfileId(null);
    }
  };

  const deleteAccount = async (profile: Profile) => {
    setError('');
    setUpdatingProfileId(profile.id);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) {
        router.replace('/login');
        return;
      }

      const response = await fetch('/api/admin/registrations', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: profile.id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not delete the account.');

      setDeletingProfile(null);
      await fetchProfiles();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the account.');
    } finally {
      setUpdatingProfileId(null);
    }
  };

  const filtered = profiles.filter((p) => p.status === tab);

  const counts = {
    pending: profiles.filter((p) => p.status === 'pending').length,
    active: profiles.filter((p) => p.status === 'active').length,
    rejected: profiles.filter((p) => p.status === 'rejected').length,
    blocked: profiles.filter((p) => p.status === 'blocked').length,
  };

  const tabs = [
    { key: 'pending' as const, label: 'Pending', icon: Clock },
    { key: 'active' as const, label: 'Active', icon: CheckCircle },
    { key: 'rejected' as const, label: 'Rejected', icon: XCircle },
    { key: 'blocked' as const, label: 'Blocked', icon: UserX },
  ];

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 700,
          color: '#1a1a1a',
        }}>
          Registrations
        </h1>
        <p style={{
          color: '#8a7968',
          fontSize: '14px',
          marginTop: '4px',
        }}>
          Manage user accounts
        </p>
      </div>

      {error && (
        <div role="alert" style={{
          marginBottom: '16px',
          padding: '12px 16px',
          borderRadius: '10px',
          background: '#fef2f2',
          color: '#b91c1c',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="registration-tabs" style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
      }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '12px',
                border: active
                  ? '2px solid #e8740c'
                  : '1px solid #e8ddd0',
                background: active ? '#fff7f0' : '#fffdf9',
                color: active ? '#e8740c' : '#6b5c4c',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Icon size={15} />
              {t.label}
              <span style={{
                marginLeft: '4px',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                background: active ? '#e8740c' : '#e8ddd0',
                color: active ? '#ffffff' : '#6b5c4c',
              }}>
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
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
      ) : (
        <div style={{
          background: '#fffdf9',
          borderRadius: '16px',
          border: '1px solid #e8ddd0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: '64px 24px',
              textAlign: 'center',
            }}>
              <Users
                size={40}
                style={{
                  margin: '0 auto 12px',
                  display: 'block',
                  color: '#d4c5b5',
                }}
              />
              <p style={{
                color: '#8a7968',
                fontSize: '14px',
              }}>
                No {tab} registrations
              </p>
            </div>
          ) : (
            filtered.map((p, i) => (
              <div
                key={p.id}
                className="registration-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 24px',
                  borderBottom: i < filtered.length - 1
                    ? '1px solid #f0e6da'
                    : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fdf6ee';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <div className="registration-actions" style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: '#1a1a1a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '15px',
                    fontWeight: 700,
                    color: '#e8740c',
                    flexShrink: 0,
                  }}>
                    {p.full_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <p style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1a1a1a',
                    }}>
                      {p.full_name}
                    </p>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      color: '#8a7968',
                      marginTop: '2px',
                      flexWrap: 'wrap',
                    }}>
                      <span>{p.email}</span>
                      <span style={{ color: '#d4c5b5' }}>•</span>
                      <span>{p.unique_user_id}</span>
                      <span style={{ color: '#d4c5b5' }}>•</span>
                      <span style={{ textTransform: 'capitalize' }}>
                        {p.role}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexShrink: 0,
                }}>
                  {p.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateStatus(p.id, 'active')}
                        disabled={updatingProfileId === p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 600,
                          borderRadius: '8px',
                          border: 'none',
                          background: '#e8740c',
                          color: '#ffffff',
                          cursor: updatingProfileId === p.id ? 'wait' : 'pointer',
                          opacity: updatingProfileId === p.id ? 0.6 : 1,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#d4680b';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#e8740c';
                        }}
                      >
                        <UserCheck size={13} /> {updatingProfileId === p.id ? 'Saving...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => updateStatus(p.id, 'rejected')}
                        disabled={updatingProfileId === p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 600,
                          borderRadius: '8px',
                          border: '1px solid #1a1a1a',
                          background: 'transparent',
                          color: '#1a1a1a',
                          cursor: updatingProfileId === p.id ? 'wait' : 'pointer',
                          opacity: updatingProfileId === p.id ? 0.6 : 1,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#1a1a1a';
                          e.currentTarget.style.color = '#ffffff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#1a1a1a';
                        }}
                      >
                        <UserX size={13} /> {updatingProfileId === p.id ? 'Saving...' : 'Reject'}
                      </button>
                    </>
                  )}

                  {p.status === 'active' && (
                    <button
                      onClick={() => updateStatus(p.id, 'blocked')}
                      disabled={updatingProfileId === p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: '1px solid #1a1a1a',
                        background: 'transparent',
                        color: '#1a1a1a',
                        cursor: updatingProfileId === p.id ? 'wait' : 'pointer',
                        opacity: updatingProfileId === p.id ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#1a1a1a';
                        e.currentTarget.style.color = '#ffffff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#1a1a1a';
                      }}
                    >
                      <UserX size={13} /> {updatingProfileId === p.id
                        ? 'Saving...'
                        : 'Block'}
                    </button>
                  )}

                  {(p.status === 'rejected' || p.status === 'blocked') && (
                    <button
                      onClick={() => updateStatus(p.id, 'active')}
                      disabled={updatingProfileId === p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: 'none',
                        background: '#e8740c',
                        color: '#ffffff',
                        cursor: updatingProfileId === p.id ? 'wait' : 'pointer',
                        opacity: updatingProfileId === p.id ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#d4680b';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#e8740c';
                      }}
                    >
                      <UserCheck size={13} /> {updatingProfileId === p.id ? 'Saving...' : 'Reactivate'}
                    </button>
                  )}
                  <button
                    onClick={() => setDeletingProfile(p)}
                    disabled={updatingProfileId === p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      border: '1px solid #fecaca',
                      background: '#fffdf9',
                      color: '#b91c1c',
                      cursor: updatingProfileId === p.id ? 'wait' : 'pointer',
                      opacity: updatingProfileId === p.id ? 0.6 : 1,
                    }}
                  >
                    <Trash2 size={13} /> Delete account
                  </button>
                </div>
              </div>
            ))
          )}
          {deletingProfile && (
            <div className="modal-overlay" onClick={() => setDeletingProfile(null)}>
              <div
                className="animate-scale-in"
                onClick={(event) => event.stopPropagation()}
                style={{
                  background: '#fffdf9',
                  borderRadius: '20px',
                  padding: '28px',
                  width: '100%',
                  maxWidth: '420px',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                }}
              >
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', marginBottom: '10px' }}>
                  Permanently delete account?
                </h2>
                <p style={{ fontSize: '13px', lineHeight: 1.5, color: '#6b5c4c', marginBottom: '22px' }}>
                  The account for “{deletingProfile.full_name}” will be permanently deleted and cannot sign in again. Their Google Drive files and folders will remain in Drive.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setDeletingProfile(null)}
                    disabled={updatingProfileId !== null}
                    style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid #e8ddd0', background: '#fffdf9', color: '#6b5c4c', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAccount(deletingProfile)}
                    disabled={updatingProfileId !== null}
                    style={{ padding: '8px 14px', borderRadius: '9px', border: 0, background: '#dc2626', color: '#fff', cursor: updatingProfileId !== null ? 'wait' : 'pointer' }}
                  >
                    {updatingProfileId === deletingProfile.id ? 'Deleting...' : 'Delete permanently'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}