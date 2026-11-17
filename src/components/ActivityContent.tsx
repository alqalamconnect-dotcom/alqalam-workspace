'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import {
  Activity,
  Upload,
  Trash2,
  FolderPlus,
  LogIn,
  UserCheck,
  UserX,
  Clock,
  Filter,
  Loader2,
} from 'lucide-react';

interface ActivityLog {
  id: string;
  user_name: string;
  action_type: string;
  target_name: string;
  details: string;
  created_at: string;
}

export default function ActivityContent() {
  const router = useRouter();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (nextFilter = filter) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (nextFilter !== 'all') {
        params.set('actionType', nextFilter);
      }

      const url = params.size > 0 ? `/api/activity?${params.toString()}` : '/api/activity';
      const res = await fetch(url);

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Unable to load activity logs');
      }

      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load activity logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (profile?.role !== 'admin') {
        router.push('/dashboard');
        return;
      }
      await fetchLogs();
    };
    void load();
  }, [fetchLogs, router]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'file_upload':
        return <Upload size={14} style={{ color: '#e8740c' }} />;
      case 'file_delete':
        return <Trash2 size={14} style={{ color: '#dc2626' }} />;
      case 'folder_create':
        return <FolderPlus size={14} style={{ color: '#d97706' }} />;
      case 'user_login':
        return <LogIn size={14} style={{ color: '#16a34a' }} />;
      case 'user_approved':
        return <UserCheck size={14} style={{ color: '#16a34a' }} />;
      case 'user_rejected':
        return <UserX size={14} style={{ color: '#dc2626' }} />;
      default:
        return <Activity size={14} style={{ color: '#8a7968' }} />;
    }
  };

  const getActionBg = (action: string) => {
    switch (action) {
      case 'file_upload': return '#fff7f0';
      case 'file_delete': return '#fef2f2';
      case 'folder_create': return '#fffbeb';
      case 'user_login': return '#f0fdf4';
      case 'user_approved': return '#f0fdf4';
      case 'user_rejected': return '#fef2f2';
      default: return '#f5efe6';
    }
  };

  const getActionLabel = (action: string) => {
    return action
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const actionTypes = [
    'all',
    ...new Set(logs.map((l) => l.action_type)),
  ];
  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter((l) => l.action_type === filter);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 700,
          color: '#1a1a1a',
        }}>
          Activity Log
        </h1>
        <p style={{
          color: '#8a7968',
          fontSize: '14px',
          marginTop: '4px',
        }}>
          {logs.length} total events
        </p>
      </div>

      {/* Filters */}
      <div className="activity-filters" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '20px',
        overflowX: 'auto',
        paddingBottom: '4px',
      }}>
        <Filter size={14} style={{ color: '#8a7968', flexShrink: 0 }} />
        {actionTypes.map((type) => (
          <button
            key={type}
            onClick={() => {
              setFilter(type);
              void fetchLogs(type);
            }}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '999px',
              whiteSpace: 'nowrap',
              border: filter === type
                ? 'none'
                : '1px solid #e8ddd0',
              background: filter === type
                ? '#e8740c'
                : '#fffdf9',
              color: filter === type
                ? '#ffffff'
                : '#6b5c4c',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {type === 'all' ? 'All' : getActionLabel(type)}
          </button>
        ))}
      </div>

      {error ? (
        <div style={{
          background: '#fff7f5',
          border: '1px solid #f7c7b4',
          borderRadius: '16px',
          padding: '24px',
          textAlign: 'center',
          color: '#7c2d12',
        }}>
          <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
            Unable to load activity logs.
          </p>
          <p style={{ fontSize: '12px', color: '#a16207', marginBottom: '16px' }}>
            {error}
          </p>
          <button
            type="button"
            onClick={() => void fetchLogs(filter)}
            style={{
              border: 'none',
              background: '#e8740c',
              color: '#fff',
              borderRadius: '999px',
              padding: '8px 16px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : loading ? (
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
          {filteredLogs.length === 0 ? (
            <div style={{
              padding: '64px 24px',
              textAlign: 'center',
            }}>
              <Activity
                size={40}
                style={{
                  margin: '0 auto 12px',
                  display: 'block',
                  color: '#d4c5b5',
                }}
              />
              <p style={{ color: '#8a7968', fontSize: '14px' }}>
                No activity logs found
              </p>
            </div>
          ) : (
            filteredLogs.map((log, i) => (
              <div
                key={log.id}
                className="activity-row"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '16px 20px',
                  borderBottom: i < filteredLogs.length - 1
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
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: getActionBg(log.action_type),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '2px',
                  flexShrink: 0,
                }}>
                  {getActionIcon(log.action_type)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: '13px',
                    color: '#1a1a1a',
                  }}>
                    <span style={{ fontWeight: 600 }}>
                      {log.user_name}
                    </span>{' '}
                    <span style={{ color: '#6b5c4c' }}>
                      {getActionLabel(log.action_type).toLowerCase()}
                    </span>
                    {log.target_name && (
                      <>
                        {' '}
                        <span style={{
                          fontWeight: 600,
                          color: '#1a1a1a',
                        }}>
                          “{log.target_name}”
                        </span>
                      </>
                    )}
                  </p>
                  {log.details && (
                    <p style={{
                      fontSize: '12px',
                      color: '#8a7968',
                      marginTop: '2px',
                    }}>
                      {log.details}
                    </p>
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  color: '#8a7968',
                  flexShrink: 0,
                }}>
                  <Clock size={12} />
                  {formatTime(log.created_at)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}