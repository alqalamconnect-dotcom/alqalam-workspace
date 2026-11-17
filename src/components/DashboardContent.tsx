'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import {
  FileText,
  Activity,
  Users,
  ArrowUpRight,
  Clock,
  FolderOpen,
  Loader2,
} from 'lucide-react';

interface RecentFile {
  id: string;
  file_name: string;
  created_at: string;
  uploaded_by_name?: string;
}

interface DashboardItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  relationship: 'Owned by you' | 'Shared with you' | 'In your workspace';
}

interface DashboardCollaborator {
  id: string;
  name: string;
  email: string;
  items: string[];
}

interface DashboardActivity {
  id: string;
  user_name: string;
  action_type: string;
  target_name: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
}

export default function DashboardContent() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [stats, setStats] = useState({
    files: 0,
    folders: 0,
    activities: 0,
    members: 0,
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [dashboardItems, setDashboardItems] = useState<DashboardItem[]>([]);
  const [collaborators, setCollaborators] = useState<DashboardCollaborator[]>([]);
  const [activityDetails, setActivityDetails] = useState<DashboardActivity[]>([]);
  const [detailsView, setDetailsView] = useState<'files' | 'folders' | 'collaborators' | 'activities' | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();
      if (profileError) {
        setDashboardError(profileError.message);
        setLoading(false);
        return;
      }
      if (profile) setUserName(profile.full_name);

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          router.replace('/login');
          return;
        }

        const response = await fetch('/api/drive/dashboard', {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        });
        const driveData = await response.json() as {
          error?: string;
          fileCount?: number;
          folderCount?: number;
          activities?: number;
          members?: number;
          isAdmin?: boolean;
          recentFiles?: RecentFile[];
          items?: DashboardItem[];
          collaborators?: DashboardCollaborator[];
          activityDetails?: DashboardActivity[];
        };
        if (!response.ok) {
          throw new Error(driveData.error || 'Unable to load current Drive files.');
        }

        setStats({
          files: driveData.fileCount || 0,
          folders: driveData.folderCount || 0,
          activities: driveData.activities || 0,
          members: driveData.members || 0,
        });
        setIsAdmin(Boolean(driveData.isAdmin));
        setRecentFiles(driveData.recentFiles || []);
        setDashboardItems(driveData.items || []);
        setCollaborators(driveData.collaborators || []);
        setActivityDetails(driveData.activityDetails || []);
      } catch (error) {
        setDashboardError(error instanceof Error
          ? error.message
          : 'Unable to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

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

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const statCards = [
    {
      label: isAdmin ? 'Total Files' : 'Files You Own or Work On',
      value: stats.files,
      icon: FileText,
      bg: '#fff7f0',
      iconBg: '#fde8d0',
      accent: '#e8740c',
      details: 'files' as const,
    },
    {
      label: isAdmin ? 'Total Folders' : 'Folders You Own or Work On',
      value: stats.folders,
      icon: FolderOpen,
      bg: '#fffbeb',
      iconBg: '#fef3c7',
      accent: '#d97706',
      details: 'folders' as const,
    },
    {
      label: 'Activities',
      value: stats.activities,
      icon: Activity,
      bg: '#f0fdf4',
      iconBg: '#d1fae5',
      accent: '#16a34a',
      details: 'activities' as const,
    },
    {
      label: isAdmin ? 'Members' : 'Collaborators',
      value: stats.members,
      icon: Users,
      bg: '#f5f3ff',
      iconBg: '#e0dbff',
      accent: '#7c3aed',
      details: isAdmin ? null : 'collaborators' as const,
    },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontSize: '26px',
          fontWeight: 700,
          color: '#1a1a1a',
        }}>
          {greeting()},{' '}
          <span style={{ color: '#e8740c' }}>{userName}</span>
        </h1>
        <p style={{
          color: '#8a7968',
          fontSize: '14px',
          marginTop: '4px',
        }}>
          {isAdmin
            ? 'Here\u2019s what\u2019s happening across your workspace'
            : 'Analytics for files and folders you own or work on'}
        </p>
      </div>

      {dashboardError && (
        <div role="alert" style={{
          marginBottom: '20px',
          padding: '12px 16px',
          borderRadius: '10px',
          background: '#fef2f2',
          color: '#b91c1c',
          fontSize: '13px',
        }}>
          {dashboardError}
        </div>
      )}

      {/* Stats */}
      <div className="dashboard-stat-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              type="button"
              key={card.label}
              onClick={() => card.details && setDetailsView(
                detailsView === card.details ? null : card.details
              )}
              aria-expanded={card.details ? detailsView === card.details : undefined}
              disabled={!card.details}
              style={{
                background: card.bg,
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid #e8ddd0',
                textAlign: 'left',
                cursor: card.details ? 'pointer' : 'default',
                boxShadow: card.details && detailsView === card.details
                  ? `0 0 0 2px ${card.accent}`
                  : undefined,
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <p style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#6b5c4c',
                  }}>
                    {card.label}
                  </p>
                  <p style={{
                    fontSize: '30px',
                    fontWeight: 700,
                    color: card.accent,
                    marginTop: '4px',
                  }}>
                    {card.value}
                  </p>
                </div>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: card.iconBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={22} style={{ color: card.accent }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {detailsView && (
        <section
          aria-live="polite"
          style={{ marginBottom: '32px', background: '#fffdf9', border: '1px solid #e8ddd0', borderRadius: '16px', overflow: 'hidden' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f0e6da' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>
              {detailsView === 'files'
                ? (isAdmin ? 'Workspace files' : 'Files you own or work on')
                : detailsView === 'folders'
                  ? (isAdmin ? 'Workspace folders' : 'Folders you own or work on')
                  : detailsView === 'activities'
                    ? (isAdmin ? 'Recent workspace activities' : 'Recent activities on your files and folders')
                    : 'Your collaborators'}
            </h2>
            <button
              type="button"
              onClick={() => setDetailsView(null)}
              style={{ border: 0, background: 'transparent', color: '#8a7968', cursor: 'pointer', fontSize: '12px' }}
            >
              Close
            </button>
          </div>
          <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
          {detailsView === 'activities' ? (
            activityDetails.length === 0 ? (
              <p style={{ padding: '20px', color: '#8a7968', fontSize: '13px' }}>
                No activities for these files or folders yet.
              </p>
            ) : activityDetails.map((activity) => (
              <div key={activity.id} style={{ padding: '13px 20px', borderBottom: '1px solid #f0e6da' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
                    {activity.action_type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}
                    {activity.target_name ? ` · ${activity.target_name}` : ''}
                  </p>
                  <time dateTime={activity.created_at} style={{ fontSize: '11px', color: '#8a7968' }}>
                    {new Date(activity.created_at).toLocaleString()}
                  </time>
                </div>
                <p style={{ marginTop: '3px', fontSize: '12px', color: '#6b5c4c' }}>
                  {activity.details || activity.user_name}
                </p>
                {isAdmin && activity.details && (
                  <p style={{ marginTop: '2px', fontSize: '11px', color: '#8a7968' }}>
                    By {activity.user_name}
                  </p>
                )}
              </div>
            ))
          ) : detailsView === 'collaborators' ? (
            collaborators.length === 0 ? (
              <p style={{ padding: '20px', color: '#8a7968', fontSize: '13px' }}>No collaborators on your files or folders yet.</p>
            ) : collaborators.map((member) => (
              <div key={member.id} style={{ padding: '13px 20px', borderBottom: '1px solid #f0e6da' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{member.name}</p>
                {member.email && <p style={{ marginTop: '3px', fontSize: '12px', color: '#8a7968' }}>{member.email}</p>}
                {member.items.length > 0 && (
                  <p style={{ marginTop: '5px', fontSize: '12px', color: '#6b5c4c' }}>
                    Collaborates on: {member.items.join(', ')}
                  </p>
                )}
              </div>
            ))
          ) : (
            dashboardItems
              .filter((item) => item.type === detailsView.slice(0, -1))
              .map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '13px 20px', borderBottom: '1px solid #f0e6da' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                    {item.type === 'folder'
                      ? <FolderOpen size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                      : <FileText size={16} style={{ color: '#e8740c', flexShrink: 0 }} />}
                    <span style={{ fontSize: '13px', color: '#1a1a1a', overflowWrap: 'anywhere' }}>{item.name}</span>
                  </div>
                  {!isAdmin && (
                    <span style={{ fontSize: '11px', color: item.relationship === 'Owned by you' ? '#166534' : '#6b5c4c', whiteSpace: 'nowrap' }}>
                      {item.relationship}
                    </span>
                  )}
                </div>
              ))
          )}
          </div>
        </section>
      )}

      {/* Recent Files */}
      <div className="dashboard-recent-card" style={{
        background: '#fffdf9',
        borderRadius: '16px',
        border: '1px solid #e8ddd0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid #f0e6da',
        }}>
          <h2 style={{
            fontSize: '15px',
            fontWeight: 600,
            color: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Clock size={18} style={{ color: '#8a7968' }} />
            Recent Files
          </h2>
          <a
            href="/files"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#e8740c',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            View All <ArrowUpRight size={12} />
          </a>
        </div>

        {recentFiles.length === 0 ? (
          <div style={{
            padding: '48px 24px',
            textAlign: 'center',
          }}>
            <FolderOpen
              size={40}
              style={{
                margin: '0 auto 12px',
                display: 'block',
                color: '#d4c5b5',
              }}
            />
            <p style={{ color: '#8a7968', fontSize: '14px' }}>
              No files to show yet
            </p>
          </div>
        ) : (
          recentFiles.map((file, i) => (
            <div
              key={file.id}
              className="dashboard-recent-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 24px',
                borderBottom: i < recentFiles.length - 1
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
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#fff7f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <FileText size={16} style={{ color: '#e8740c' }} />
                </div>
                <div>
                  <p style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1a1a1a',
                  }}>
                    {file.file_name}
                  </p>
                  <p style={{
                    fontSize: '11px',
                    color: '#8a7968',
                  }}>
                    by {file.uploaded_by_name}
                  </p>
                </div>
              </div>
              <p style={{
                fontSize: '12px',
                color: '#8a7968',
              }}>
                {new Date(file.created_at).toLocaleDateString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}