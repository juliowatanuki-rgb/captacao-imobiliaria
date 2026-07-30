import { useEffect, useState } from "react";
import {
  SessaoExpiradaError,
  fetchCrawlRunDetail,
  fetchCrawlRuns,
  type CrawlRunSummary,
  type SiteCrawlRun,
} from "./api.js";

function formatData(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR");
}

function formatDuracao(segundos: number | null): string {
  if (segundos === null || segundos === undefined) return "-";
  const min = Math.floor(segundos / 60);
  const seg = Math.round(segundos % 60);
  return min > 0 ? `${min}min ${seg}s` : `${seg}s`;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

function SiteRunRow({ run }: { run: SiteCrawlRun }) {
  return (
    <tr>
      <td>{run.site_nome}</td>
      <td>
        <StatusBadge status={run.status} />
      </td>
      <td>{run.anuncios_encontrados}</td>
      <td>{run.anuncios_novos}</td>
      <td>{run.anuncios_atualizados}</td>
      <td>{run.anuncios_sem_alteracao}</td>
      <td>{run.anuncios_ausentes}</td>
      <td>{run.paginas_visitadas}</td>
      <td>{formatDuracao(run.duracao_segundos)}</td>
    </tr>
  );
}

export default function CrawlRuns({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const [runs, setRuns] = useState<CrawlRunSummary[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [siteRuns, setSiteRuns] = useState<SiteCrawlRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRuns() {
    setLoading(true);
    setError(null);
    try {
      const { crawlRuns } = await fetchCrawlRuns(token);
      setRuns(crawlRuns);
      if (crawlRuns.length > 0) {
        setSelecionado(crawlRuns[0].id);
      }
    } catch (err) {
      if (err instanceof SessaoExpiradaError) {
        onSessionExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "erro ao carregar execucoes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selecionado) return;
    setLoadingDetalhe(true);
    fetchCrawlRunDetail(token, selecionado)
      .then(({ siteRuns }) => setSiteRuns(siteRuns))
      .catch((err) => {
        if (err instanceof SessaoExpiradaError) {
          onSessionExpired();
          return;
        }
        setError(err instanceof Error ? err.message : "erro ao carregar detalhe");
      })
      .finally(() => setLoadingDetalhe(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado]);

  if (loading) return <p className="status-msg">Carregando execucoes de coleta...</p>;
  if (error) return <p className="status-msg error">{error}</p>;
  if (runs.length === 0) return <p className="status-msg">Nenhuma execucao de coleta registrada ainda.</p>;

  return (
    <div className="crawl-runs">
      <div className="crawl-runs-list">
        {runs.map((run) => (
          <button
            type="button"
            key={run.id}
            className={`crawl-run-item ${run.id === selecionado ? "selected" : ""}`}
            onClick={() => setSelecionado(run.id)}
          >
            <div className="crawl-run-item-header">
              <StatusBadge status={run.status} />
              <span className="data">{formatData(run.inicio_em)}</span>
            </div>
            <div className="crawl-run-item-resumo">
              {run.sites_sucesso}/{run.sites_previstos} sites ok
              {run.sites_erro > 0 ? ` - ${run.sites_erro} com erro` : ""}
            </div>
          </button>
        ))}
      </div>

      <div className="crawl-run-detalhe">
        {loadingDetalhe ? (
          <p className="status-msg">Carregando detalhe...</p>
        ) : (
          <table className="site-runs-table">
            <thead>
              <tr>
                <th>Imobiliaria</th>
                <th>Status</th>
                <th>Encontrados</th>
                <th>Novos</th>
                <th>Atualizados</th>
                <th>Sem alteracao</th>
                <th>Ausentes</th>
                <th>Paginas</th>
                <th>Duracao</th>
              </tr>
            </thead>
            <tbody>
              {siteRuns.map((run) => (
                <SiteRunRow key={run.id} run={run} />
              ))}
            </tbody>
          </table>
        )}
        {siteRuns.some((r) => r.status === "erro" && r.mensagem_erro) && (
          <div className="erros-detalhe">
            <h3>Erros</h3>
            {siteRuns
              .filter((r) => r.status === "erro" && r.mensagem_erro)
              .map((r) => (
                <p key={r.id}>
                  <strong>{r.site_nome}:</strong> {r.mensagem_erro}
                </p>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
