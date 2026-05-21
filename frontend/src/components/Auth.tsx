import React, { useState } from 'react';
import { api } from '../services/api';

interface AuthProps {
  onLoginSuccess: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await api.register(email, password);
        // Auto-login after registration
        await api.login(email, password);
      } else {
        await api.login(email, password);
      }
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.logoArea}>
        <h1 style={styles.title}>Alfred</h1>
        <p style={styles.subtitle}>Tu mayordomo de productividad personal</p>
      </div>

      <div className="glass-panel animate-fade-in" style={styles.card}>
        <h2 style={styles.cardHeader}>{isRegister ? 'Crear cuenta' : 'Iniciar Sesión'}</h2>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Correo Electrónico</label>
            <input
              type="email"
              className="glass-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ejemplo@correo.com"
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Contraseña</label>
            <input
              type="password"
              className="glass-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="glass-button" disabled={loading} style={styles.submitBtn}>
            {loading ? 'Procesando...' : isRegister ? 'Registrarse' : 'Entrar'}
          </button>
        </form>

        <div style={styles.divider}>
          <span style={styles.dividerText}>o</span>
        </div>

        <a
          href="/api/auth/google/login"
          style={styles.googleBtn}
          className="glass-button-secondary"
        >
          <span style={styles.googleIcon}>G</span>
          <span>Entrar con Google</span>
        </a>

        <div style={styles.switchText}>
          {isRegister ? '¿Ya tienes una cuenta?' : '¿No tienes una cuenta?'}{' '}
          <span style={styles.switchLink} onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? 'Inicia sesión' : 'Regístrate aquí'}
          </span>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
  },
  logoArea: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    fontSize: '3rem',
    fontWeight: 700,
    background: 'linear-gradient(to right, #818cf8, #c084fc)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '-1px',
    marginBottom: '8px',
  },
  subtitle: {
    color: 'var(--text-secondary)',
    fontSize: '1.1rem',
    fontWeight: 300,
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    padding: '40px',
  },
  cardHeader: {
    fontSize: '1.5rem',
    fontWeight: 600,
    marginBottom: '24px',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  submitBtn: {
    marginTop: '10px',
    width: '100%',
    padding: '12px',
  },
  error: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px dashed var(--accent-danger)',
    color: '#f87171',
    padding: '12px',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: '0.85rem',
    marginBottom: '20px',
    textAlign: 'center',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '20px 0',
    color: 'var(--text-muted)',
    fontSize: '0.8rem',
    textAlign: 'center',
    position: 'relative',
  },
  dividerText: {
    background: 'transparent',
    padding: '0 12px',
    margin: '0 auto',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  googleBtn: {
    width: '100%',
    padding: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    textDecoration: 'none',
    fontWeight: 500,
    fontSize: '14px',
    cursor: 'pointer',
    borderRadius: 'var(--border-radius-sm)',
  },
  googleIcon: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #4285F4, #DB4437 60%, #F4B400)',
    color: '#ffffff',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
  },
  switchText: {
    marginTop: '24px',
    textAlign: 'center',
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
  },
  switchLink: {
    color: 'var(--accent-primary)',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};
