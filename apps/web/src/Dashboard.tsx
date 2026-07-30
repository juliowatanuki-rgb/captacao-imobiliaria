import { useEffect, useState } from "react";
import { SessaoExpiradaError, fetchDashboard, type CaptacaoPorDia, type DashboardData, type RankingSite } from "./api.js";

function formatData(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR");
}

function formatDia(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}`;
}

function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: toInputDate(from), to: toInputDate(to) };
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="status-badge status-nunca">nunca coletado</span>;
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

function CaptacaoChart({ dados }: { dados: CaptacaoPorDia[] }) {
  if (dados.length === 0) {
    return <p className="status-msg">Sem captacoes no periodo selecionado.</p>;
  }

  const largura = 720;
  const altura = 220;
  const margemInferior = 28;
  const margemEsquerda = 8;
  const areaAltura = altura - margemInferior;
  const maxTotal = Math.max(...dados.map((d) => d.total), 1);
  const larguraBarra = (largura - margemEsquerda) / dados.length;
  const passoLabel = Math.max(1, Math.ceil(dados.length / 10));

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${largura} ${altura}`}
      role="img"
      aria-label="Quantidade de imoveis captados por dia"
    >
      <line x1={margemEsquerda} y1={areaAltura} x2={largura} y2={areaAltura} className="chart-axis" />
      {dados.map((d, i) => {
        const alturaBarra = (d.total / maxTotal) * (areaAltura - 12);
        const x = margemEsquerda + i * larguraBarra;
        const y = areaAltura - alturaBarra;
        return (
          <g key={d.dia}>
            <rect
              x={x + 1}
              y={y}
              width={Math.max(larguraBarra - 2, 1)}
              height={alturaBarra}
              rx={2}
              className="chart-bar"
            >
              <title>
                {formatDia(d.dia)}: {d.total}
              </title>
            </rect>
            {i % passoLabel === 0 && (
              <text x={x + larguraBarra / 2} y={altura - 8} textAnchor="middle" className="chart-label">
                {formatDia(d.dia)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function RankingList({ ranking }: { ranking: RankingSite[] }) {
  if (ranking.length === 0) {
    return <p className="status-msg">Sem dados de captacao no periodo selecionado.</p>;
  }
  const maxTotal = Math.max(...ranking.map((r) => r.total), 1);
  return (
    <ol className="ranking-list">
      {ranking.map((r, i) => (
        <li key={r.site_nome} className="ranking-item">
          <span className="ranking-posicao">{i + 1}</span>
          <span className="ranking-nome">{r.site_nome}</span>
          <span className="ranking-barra-track">
            <span className="ranking-barra-fill" style={{ width: `${(r.total / maxTotal) * 100}%` }} />
          </span>
          <span className="ranking-total">{r.total}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Dashboard({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDashboard(token, range.from, range.to)
      .then(setData)
      .catch((err) => {
        if (err instanceof SessaoExpiradaError) {
          onSessionExpired();
          return;
        }
        setError(err instanceof Error ? err.message : "erro ao carregar dashboard");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, range.from, range.to]);

  return (
    <div className="dashboard-page">
      <section className="dashboard-summary">
        <h2>Ultima sincronizacao</h2>
        {data?.ultimaSincronizacao ? (
          <p>
            {formatData(data.ultimaSincronizacao.inicio_em)}{" "}
            <span className={`status-badge status-${data.ultimaSincronizacao.status}`}>
              {data.ultimaSincronizacao.status}
            </span>
          </p>
        ) : (
          <p className="status-msg">Nenhuma sincronizacao registrada ainda.</p>
        )}

        <div className="sites-status-grid">
          {data?.sites.map((s) => (
            <div key={s.site_id} className="site-status-item">
              <span>{s.site_nome}</span>
              <StatusBadge status={s.status} />
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-chart">
        <div className="dashboard-chart-header">
          <h2>Captacao de imoveis por dia</h2>
          <div className="chart-controls">
            <label>
              De
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              />
            </label>
            <label>
              Ate
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              />
            </label>
          </div>
        </div>
        {loading ? (
          <p className="status-msg">Carregando...</p>
        ) : error ? (
          <p className="status-msg error">{error}</p>
        ) : (
          <CaptacaoChart dados={data?.captacaoPorDia ?? []} />
        )}
      </section>

      <section className="dashboard-ranking">
        <h2>Ranking de captacao no periodo</h2>
        {!loading && !error && <RankingList ranking={data?.ranking ?? []} />}
      </section>
    </div>
  );
}
