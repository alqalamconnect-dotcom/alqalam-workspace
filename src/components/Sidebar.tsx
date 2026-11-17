'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import {
  LayoutDashboard,
  FolderOpen,
  Bot,
  User,
  Activity,
  UserCheck,
  LogOut,
  BookOpen,
  Shield,
} from 'lucide-react';

export default function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState('member');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return;
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', session.user.id)
        .single();
      if (profileData) {
        setRole(profileData.role);
        setUserName(profileData.full_name);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const updateName = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        setUserName(event.detail);
      }
    };
    window.addEventListener('profile-name-updated', updateName);
    return () => window.removeEventListener('profile-name-updated', updateName);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const mainLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/files', label: 'Files', icon: FolderOpen },
    { href: '/qalam-ai', label: 'Qalam AI', icon: Bot },
    { href: '/profile', label: 'Profile', icon: User },
  ];

  const adminLinks = [
    { href: '/activity', label: 'Activity Log', icon: Activity },
    { href: '/admin/registrations', label: 'Registrations', icon: UserCheck },
  ];

  const isActive = (href: string) => pathname === href;

  const linkStyle = (active: boolean, isAdmin: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 14px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: active ? 600 : 500,
    textDecoration: 'none',
    transition: 'all 0.15s',
    background: active
      ? isAdmin ? '#e8740c' : '#e8740c'
      : 'transparent',
    color: active ? '#ffffff' : '#a89888',
  });

  return (
    <aside className="app-sidebar" style={{
      width: '256px',
      height: '100vh',
      background: '#1a1a1a',
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0,
      top: 0,
      zIndex: 40,
    }}>
      {/* Logo */}
      <div className="sidebar-brand" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '20px 20px',
        borderBottom: '1px solid #2d2d2d',
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: '#e8740c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <BookOpen size={18} color="#fff" />
        </div>
        <div>
          <h1 style={{
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.5px',
          }}>
            Al Qalam
          </h1>
          <p style={{
            fontSize: '10px',
            color: '#e8740c',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}>
            Workspace
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav" style={{
        flex: 1,
        padding: '16px 12px',
        overflowY: 'auto',
      }}>
        <p className="sidebar-section-title" style={{
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          color: '#5a5047',
          padding: '0 14px',
          marginBottom: '8px',
        }}>
          Main Menu
        </p>

        {mainLinks.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <a
              key={link.href}
              className="sidebar-link"
              href={link.href}
              aria-label={link.label}
              title={link.label}
              style={linkStyle(active, false)}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = '#2d2d2d';
                  e.currentTarget.style.color = '#ffffff';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#a89888';
                }
              }}
            >
              <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
              <span>{link.label}</span>
            </a>
          );
        })}

        {(isAdmin || role === 'admin') && (
          <>
            <div className="sidebar-separator" style={{
              margin: '16px 14px',
              borderTop: '1px solid #2d2d2d',
            }} />
            <p className="sidebar-section-title" style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              color: '#5a5047',
              padding: '0 14px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <Shield size={10} /> Admin
            </p>

            {adminLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <a
                  key={link.href}
                  className="sidebar-link"
                  href={link.href}
                  aria-label={link.label}
                  title={link.label}
                  style={linkStyle(active, true)}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = '#2d2d2d';
                      e.currentTarget.style.color = '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#a89888';
                    }
                  }}
                >
                  <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                  <span>{link.label}</span>
                </a>
              );
            })}
          </>
        )}
      </nav>

      {/* User */}
      <div className="sidebar-user" style={{
        padding: '16px',
        borderTop: '1px solid #2d2d2d',
      }}>
        {userName && (
          <div className="sidebar-user-info" style={{ padding: '0 8px', marginBottom: '12px' }}>
            <p style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#e8ddd0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {userName}
            </p>
            <p style={{
              fontSize: '11px',
              color: '#5a5047',
              textTransform: 'capitalize',
            }}>
              {role}
            </p>
          </div>
        )}
        <button
          className="sidebar-logout"
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 500,
            color: '#a89888',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#2d1a1a';
            e.currentTarget.style.color = '#e85050';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#a89888';
          }}
        >
          <LogOut size={19} strokeWidth={1.8} />
          <span className="sidebar-logout-label">Logout</span>
        </button>
      </div>
    </aside>
  );
}