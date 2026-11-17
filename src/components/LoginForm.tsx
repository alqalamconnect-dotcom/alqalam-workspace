'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { BookOpen, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';

function getAccountStatusMessage(status: string | null | undefined) {
  switch (status) {
    case 'pending':
      return 'Your account is pending admin approval.';
    case 'rejected':
      return 'Your account registration was rejected by an admin.';
    case 'blocked':
      return 'Your account has been blocked by an admin. Contact an administrator for help.';
    case 'active':
      return '';
    default:
      return 'No account profile was found. Contact an administrator for help.';
  }
}

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkExistingSession = async () => {
      const approvalState = new URLSearchParams(window.location.search).get('approval');
      if (approvalState === 'check-failed') {
        setError('Unable to verify your approval status. Please sign in again later.');
      } else if (approvalState && approvalState !== 'active') {
        setError(getAccountStatusMessage(approvalState));
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setError('Unable to verify your sign-in. Please try again.');
        return;
      }

      const session = data.session;
      if (!session) return;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileError) {
        const { error: signOutError } = await supabase.auth.signOut();
        setError(signOutError
          ? 'Unable to verify approval or end this session. Please close this browser session and contact an administrator.'
          : 'Unable to verify your approval status. Please sign in again later.');
        return;
      }

      if (profileData?.status !== 'active') {
        const { error: signOutError } = await supabase.auth.signOut();
        setError(signOutError
          ? 'Your account is not approved, and this session could not be ended. Please close this browser session and contact an administrator.'
          : getAccountStatusMessage(profileData?.status));
        return;
      }

      router.replace('/dashboard');
    };

    void checkExistingSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      setError('Login failed');
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profileError || profileData?.status !== 'active') {
      const { error: signOutError } = await supabase.auth.signOut();
      setError(signOutError
        ? 'Approval could not be verified and this session could not be ended. Please contact an administrator.'
        : profileError
          ? 'Unable to verify your approval status. Please try again later.'
          : getAccountStatusMessage(profileData?.status));
      setLoading(false);
      return;
    }

    router.push('/dashboard');
  };

  return (
    <div className="auth-screen" style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2218 50%, #1a1a1a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background blobs */}
      <div style={{
        position: 'absolute',
        top: '-160px',
        right: '-160px',
        width: '320px',
        height: '320px',
        background: 'rgba(232, 116, 12, 0.08)',
        borderRadius: '50%',
        filter: 'blur(80px)',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-160px',
        left: '-160px',
        width: '320px',
        height: '320px',
        background: 'rgba(232, 116, 12, 0.06)',
        borderRadius: '50%',
        filter: 'blur(80px)',
      }} />

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '420px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: '#e8740c',
            marginBottom: '16px',
            boxShadow: '0 8px 24px rgba(232, 116, 12, 0.3)',
          }}>
            <BookOpen size={26} color="#fff" />
          </div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#ffffff',
          }}>
            Al Qalam Workspace
          </h1>
          <p style={{
            color: '#8a7968',
            fontSize: '14px',
            marginTop: '4px',
          }}>
            Sign in to your workspace
          </p>
        </div>

        {/* Card */}
        <div className="auth-card" style={{
          background: 'rgba(255, 253, 249, 0.04)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '32px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}>
          <form onSubmit={handleLogin} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}>
            {error && (
              <div style={{
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.2)',
                borderRadius: '12px',
                padding: '12px 16px',
                fontSize: '13px',
                color: '#fca5a5',
              }}>
                {error}
              </div>
            )}

            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#8a7968',
                marginBottom: '8px',
              }}>
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#5a5047',
                  }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  style={{
                    width: '100%',
                    paddingLeft: '40px',
                    paddingRight: '16px',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border 0.2s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#e8740c';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#8a7968',
                marginBottom: '8px',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#5a5047',
                  }}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%',
                    paddingLeft: '40px',
                    paddingRight: '16px',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border 0.2s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#e8740c';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                paddingTop: '13px',
                paddingBottom: '13px',
                background: loading ? '#c4620a' : '#e8740c',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '12px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'background 0.15s',
                boxShadow: '0 4px 16px rgba(232, 116, 12, 0.25)',
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.background = '#d4680b';
              }}
              onMouseLeave={(e) => {
                if (!loading) e.currentTarget.style.background = '#e8740c';
              }}
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Sign In <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div style={{
            marginTop: '24px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '13px', color: '#5a5047' }}>
              Don&apos;t have an account?{' '}
              <a
                href="/register"
                style={{
                  color: '#e8740c',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Register
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}