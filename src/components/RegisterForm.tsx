'use client';

import { useState } from 'react';
import supabase from '@/lib/supabase';
import {
  BookOpen,
  Mail,
  Lock,
  User,
  ArrowRight,
  Loader2,
  CheckCircle,
} from 'lucide-react';

export default function RegisterForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError('Registration was created, but sign-out failed. Please sign out before continuing.');
        setLoading(false);
        return;
      }
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="auth-screen" style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2218 50%, #1a1a1a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}>
        <div className="auth-card" style={{
          background: 'rgba(255, 253, 249, 0.04)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '40px',
          maxWidth: '420px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(22, 163, 74, 0.15)',
            marginBottom: '16px',
          }}>
            <CheckCircle size={28} color="#4ade80" />
          </div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#ffffff',
            marginBottom: '8px',
          }}>
            Registration Submitted
          </h2>
          <p style={{
            color: '#8a7968',
            fontSize: '14px',
            marginBottom: '24px',
            lineHeight: '1.5',
          }}>
            Your account is pending admin approval.
            You&apos;ll be able to log in once approved.
          </p>
          <a
            href="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              background: '#e8740c',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '12px',
              textDecoration: 'none',
              transition: 'background 0.15s',
            }}
          >
            Go to Login <ArrowRight size={14} />
          </a>
        </div>
      </div>
    );
  }

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
            Create Account
          </h1>
          <p style={{
            color: '#8a7968',
            fontSize: '14px',
            marginTop: '4px',
          }}>
            Join Al Qalam Workspace
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
          <form onSubmit={handleRegister} style={{
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
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <User
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
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
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
                  minLength={6}
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
                  Create Account <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div style={{
            marginTop: '24px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '13px', color: '#5a5047' }}>
              Already have an account?{' '}
              <a
                href="/login"
                style={{
                  color: '#e8740c',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Sign In
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}