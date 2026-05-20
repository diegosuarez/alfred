import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

interface DailyStat {
  date: string;
  total_seconds: number;
}

interface StatsData {
  total_focus_time: number;
  sessions_completed: number;
  daily_stats: DailyStat[];
}

export const Statistics: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await api.getFocusStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Error al obtener estadísticas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatHours = (seconds: number) => {
    const hours = (seconds / 3600).toFixed(1);
    return `${hours} horas`;
  };

  const getDayLabel = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return days[date.getDay()];
  };

  if (loading && !stats) {
    return <div style={styles.centered}>Analizando productividad...</div>;
  }

  if (error) {
    return <div style={styles.centeredError}>{error}</div>;
  }

  if (!stats) return null;

  // Custom SVG bar chart parameters
  const chartHeight = 180;
  const chartWidth = 420;
  const barWidth = 32;
  const gap = 24;
  const maxSeconds = Math.max(...stats.daily_stats.map(d => d.total_seconds), 1);

  return (
    <div style={styles.container} className="animate-fade-in">
      <header style={styles.header}>
        <h2 style={styles.title}>Panel de Productividad</h2>
        <p style={styles.subtitle}>Tu historial de enfoque y constancia de los últimos 7 días</p>
      </header>

      {/* Grid of Key Performance Indicators */}
      <div style={styles.grid}>
        <div className="glass-panel" style={styles.kpiCard}>
          <span style={styles.kpiIcon}>⏱️</span>
          <div style={styles.kpiContent}>
            <span style={styles.kpiLabel}>Total Enfocado</span>
            <span style={styles.kpiValue}>{formatHours(stats.total_focus_time)}</span>
          </div>
        </div>

        <div className="glass-panel" style={styles.kpiCard}>
          <span style={styles.kpiIcon}>🎯</span>
          <div style={styles.kpiContent}>
            <span style={styles.kpiLabel}>Sesiones Completadas</span>
            <span style={styles.kpiValue}>{stats.sessions_completed} Pomodoros</span>
          </div>
        </div>
      </div>

      {/* Sleek SVG Bar Chart Card */}
      <div className="glass-panel" style={styles.chartCard}>
        <h3 style={styles.chartTitle}>Tiempo Diario de Enfoque (Minutos)</h3>
        
        <div style={styles.chartWrapper}>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`} width="100%" height="100%">
            <defs>
              {/* Glowing vertical gradient */}
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-secondary)" />
                <stop offset="100%" stopColor="var(--accent-primary)" />
              </linearGradient>
              {/* Soft neon shadow filter */}
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Render 7 Rounded Glimmering Bars */}
            {stats.daily_stats.map((d, index) => {
              const minutes = Math.round(d.total_seconds / 60);
              const barHeight = (d.total_seconds / maxSeconds) * chartHeight;
              
              // Prevent bar from rendering invisible if 0, but keep it very small (e.g. 4px) to indicate track
              const displayHeight = Math.max(barHeight, 4);
              
              const x = index * (barWidth + gap) + 24;
              const y = chartHeight - displayHeight + 10;

              return (
                <g key={d.date} style={{ cursor: 'pointer' }}>
                  {/* Tooltip on Hover showing minutes */}
                  <title>{`${minutes} minutos enfocados`}</title>
                  
                  {/* Active Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={displayHeight}
                    rx={6}
                    ry={6}
                    fill={minutes > 0 ? "url(#barGradient)" : "rgba(255, 255, 255, 0.03)"}
                    stroke={minutes > 0 ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.05)"}
                    strokeWidth={1}
                    filter={minutes > 0 ? "url(#glow)" : undefined}
                    style={{ transition: 'all 0.5s ease-out' }}
                  />

                  {/* Minutes text above bar */}
                  {minutes > 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={y - 8}
                      textAnchor="middle"
                      fill="var(--text-primary)"
                      fontSize="10"
                      fontWeight="600"
                    >
                      {minutes}m
                    </text>
                  )}

                  {/* Day label under bar */}
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 28}
                    textAnchor="middle"
                    fill="var(--text-secondary)"
                    fontSize="11"
                    fontWeight="500"
                  >
                    {getDayLabel(d.date)}
                  </text>
                </g>
              );
            })}

            {/* Chart bottom guideline */}
            <line
              x1="10"
              y1={chartHeight + 12}
              x2={chartWidth - 10}
              y2={chartHeight + 12}
              stroke="var(--glass-border)"
              strokeWidth="1"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    padding: '40px',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '4px',
  },
  subtitle: {
    color: 'var(--text-secondary)',
    fontSize: '14px',
    fontWeight: 300,
  },
  grid: {
    display: 'flex',
    gap: '24px',
    marginBottom: '32px',
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: '220px',
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  kpiIcon: {
    fontSize: '36px',
    width: '60px',
    height: '60px',
    borderRadius: '14px',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--glass-border)',
  },
  kpiContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  kpiLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  kpiValue: {
    fontSize: '22px',
    fontWeight: 700,
  },
  chartCard: {
    padding: '30px',
    width: '100%',
    maxWidth: '650px',
  },
  chartTitle: {
    fontSize: '15px',
    fontWeight: 600,
    marginBottom: '30px',
    color: 'var(--text-primary)',
  },
  chartWrapper: {
    width: '100%',
    maxHeight: '260px',
    display: 'flex',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    color: 'var(--text-secondary)',
  },
  centeredError: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    color: 'var(--accent-danger)',
  },
};
