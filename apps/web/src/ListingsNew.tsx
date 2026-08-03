import { memo, useCallback, useEffect, useState } from "react";
import {
  SessaoExpiradaError,
  fetchNewListings,
  setListingNotes,
  setListingStatus,
  type NewListing,
} from "./api.js";

function Caracteristicas({ listing }: { listing: NewListing }) {
  return (
    <dl className="caracteristicas">
      <div>
        <dt>Metragem</dt>
        <dd>{listing.area_util ? `${listing.area_util} m²` : "-"}</dd>
      </div>
      <div>
        <dt>Dormitorios</dt>
        <dd>{listing.dormitorios ?? "-"}</dd>
      </div>
      <div>
        <dt>Suites</dt>
        <dd>{listing.suites ?? "-"}</dd>
      </div>
      <div>
        <dt>Vagas</dt>
        <dd>{listing.vagas ?? "-"}</dd>
      </div>
    </dl>
  );
}

function SugestaoIA({ listing, onUsarSugestao }: { listing: NewListing; onUsarSugestao: () => void }) {
  if (!listing.ia_status) return null;
  const temSugestao = Boolean(listing.ia_condominio || listing.ia_endereco);
  return (
    <div className="ia-suggestion">
      <div className="ia-suggestion-header">
        <span className="ia-suggestion-titulo">Sugestao da IA</span>
        <span className={`status-badge ia-status-${listing.ia_status}`}>
          {listing.ia_status === "localizado"
            ? "localizado"
            : listing.ia_status === "parcial"
              ? "parcial"
              : "nao localizado"}
        </span>
        {listing.ia_confianca !== null && (
          <span className="ia-suggestion-confianca">confianca {listing.ia_confianca}%</span>
        )}
      </div>
      {temSugestao ? (
        <>
          {listing.ia_condominio && <p><strong>Condominio:</strong> {listing.ia_condominio}</p>}
          {listing.ia_endereco && <p><strong>Endereco:</strong> {listing.ia_endereco}</p>}
          <button type="button" onClick={onUsarSugestao}>
            Usar sugestao
          </button>
        </>
      ) : (
        <p className="ia-suggestion-vazia">Nenhum condominio/endereco identificado com confianca suficiente.</p>
      )}
      {listing.ia_criterio_confirmacao && (
        <p className="ia-suggestion-criterio">{listing.ia_criterio_confirmacao}</p>
      )}
      {listing.ia_evidencias && listing.ia_evidencias.length > 0 && (
        <details>
          <summary>Evidencias ({listing.ia_evidencias.length})</summary>
          <ul>
            {listing.ia_evidencias.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
      {listing.ia_divergencias && listing.ia_divergencias.length > 0 && (
        <details className="ia-suggestion-divergencias">
          <summary>Divergencias ({listing.ia_divergencias.length})</summary>
          <ul>
            {listing.ia_divergencias.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface Draft {
  observacoes: string;
  condominio: string;
  endereco: string;
}

// Memoizado e com estado de rascunho PROPRIO (nao no componente pai): digitar
// num campo de um card so re-renderiza esse card, nao os ~700 da fila
// inteira (auditoria de performance de 2026-08-01 - essa era a causa da
// lentidao ao digitar/navegar na aba "Anuncios novos").
const ListingCard = memo(function ListingCard({
  listing,
  index,
  token,
  onSessionExpired,
  onRemover,
}: {
  listing: NewListing;
  index: number;
  token: string;
  onSessionExpired: () => void;
  onRemover: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    observacoes: "",
    condominio: listing.condominio_identificado_manual ?? "",
    endereco: listing.endereco_identificado_manual ?? "",
  });

  function updateDraft(field: keyof Draft, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function usarSugestaoIA() {
    setDraft((prev) => ({
      ...prev,
      condominio: listing.ia_condominio || prev.condominio,
      endereco: listing.ia_endereco || prev.endereco,
    }));
  }

  async function handleStatus(status: "analisado" | "descartado" | "selecionado_para_captacao") {
    try {
      await setListingStatus(token, listing.id, status);
      onRemover(listing.id);
    } catch (err) {
      if (err instanceof SessaoExpiradaError) {
        onSessionExpired();
        return;
      }
      // eslint-disable-next-line no-console
      console.error("erro ao atualizar anuncio:", err);
      window.alert(err instanceof Error ? err.message : "erro ao atualizar anuncio");
    }
  }

  async function saveNotes() {
    try {
      await setListingNotes(token, listing.id, {
        observacoes: draft.observacoes,
        condominioIdentificadoManual: draft.condominio,
        enderecoIdentificadoManual: draft.endereco,
      });
    } catch (err) {
      if (err instanceof SessaoExpiradaError) {
        onSessionExpired();
        return;
      }
      // eslint-disable-next-line no-console
      console.error("erro ao salvar observacoes:", err);
      window.alert(err instanceof Error ? err.message : "erro ao salvar observacoes");
    }
  }

  return (
    <article className="listing-card">
      <header>
        <span className="listing-id">#{index + 1}</span>
        <span className="site-nome">{listing.site_nome}</span>
        <span className="data">{new Date(listing.primeira_captura_em).toLocaleString("pt-BR")}</span>
      </header>
      <h2>{listing.titulo ?? "(sem titulo)"}</h2>
      <p className="detalhes">
        {listing.bairro ?? "bairro nao informado"}
        {listing.preco ? ` - R$ ${listing.preco}` : ""}
      </p>
      <Caracteristicas listing={listing} />
      <a href={listing.url_final ?? listing.url_original} target="_blank" rel="noreferrer">
        Abrir anuncio original
      </a>

      <SugestaoIA listing={listing} onUsarSugestao={usarSugestaoIA} />

      <div className="manual-fields">
        <label>
          Condominio identificado
          <input value={draft.condominio} onChange={(e) => updateDraft("condominio", e.target.value)} />
        </label>
        <label>
          Endereco identificado
          <input value={draft.endereco} onChange={(e) => updateDraft("endereco", e.target.value)} />
        </label>
        <label>
          Observacoes
          <textarea value={draft.observacoes} onChange={(e) => updateDraft("observacoes", e.target.value)} />
        </label>
        <button type="button" onClick={saveNotes}>
          Salvar observacoes
        </button>
      </div>

      <div className="actions">
        <button type="button" onClick={() => handleStatus("analisado")}>
          Marcar como analisado
        </button>
        <button type="button" onClick={() => handleStatus("descartado")}>
          Descartar
        </button>
        <button type="button" className="primary" onClick={() => handleStatus("selecionado_para_captacao")}>
          Selecionar para captacao
        </button>
      </div>
    </article>
  );
});

function idCurto(l: NewListing): string {
  if (l.external_id && l.external_id.trim() !== "") return l.external_id.trim();
  return l.id.slice(0, 8);
}

function paraNumero(valor: string | number | null): number | "" {
  if (valor === null || valor === "") return "";
  const numero = Number(valor);
  return Number.isNaN(numero) ? "" : numero;
}

function paraData(valor: string): Date | string {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data;
}

const COLUNA_LINK = 12;
const COLUNA_PRECO = 5;
const COLUNA_METRAGEM = 6;
const COLUNA_DATA = 13;

async function exportarParaExcel(listings: NewListing[]) {
  // Import dinamico: xlsx e uma biblioteca pesada usada so neste botao -
  // carrega-la de forma estatica no topo do arquivo forcava todo mundo a
  // baixar/parsear ela no carregamento inicial da pagina, mesmo quem nunca
  // exporta (auditoria de performance de 2026-08-01).
  const XLSX = await import("xlsx");

  const cabecalho = [
    "id",
    "imobiliaria",
    "titulo",
    "tipo de imovel",
    "bairro",
    "preco",
    "metragem (m2)",
    "dormitorios",
    "suites",
    "vagas",
    "condominio",
    "endereco",
    "link",
    "primeira captura em",
    "status da analise",
    "condominio sugerido pela IA",
    "endereco sugerido pela IA",
    "bairro sugerido pela IA",
    "cidade sugerida pela IA",
    "status da investigacao IA",
    "confianca da IA (%)",
    "criterio de confirmacao da IA",
    "evidencias da IA",
    "divergencias da IA",
  ];
  const linhas = listings.map((l) => {
    const link = l.url_final ?? l.url_original;
    return [
      idCurto(l),
      l.site_nome,
      l.titulo ?? "",
      l.tipo_imovel ?? "",
      l.bairro ?? "",
      paraNumero(l.preco),
      paraNumero(l.area_util),
      paraNumero(l.dormitorios),
      paraNumero(l.suites),
      paraNumero(l.vagas),
      l.condominio_identificado_manual ?? l.condominio_nome ?? "",
      l.endereco_identificado_manual ?? l.endereco ?? "",
      link,
      paraData(l.primeira_captura_em),
      l.analysis_status,
      l.ia_condominio ?? "",
      l.ia_endereco ?? "",
      l.ia_bairro ?? "",
      l.ia_cidade ?? "",
      l.ia_status ?? "",
      paraNumero(l.ia_confianca),
      l.ia_criterio_confirmacao ?? "",
      (l.ia_evidencias ?? []).join(" | "),
      (l.ia_divergencias ?? []).join(" | "),
    ];
  });

  const planilha = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);

  listings.forEach((l, i) => {
    const linha = i + 1;
    const precoCell = planilha[XLSX.utils.encode_cell({ r: linha, c: COLUNA_PRECO })];
    if (precoCell && precoCell.t === "n") precoCell.z = "#,##0.00";
    const metragemCell = planilha[XLSX.utils.encode_cell({ r: linha, c: COLUNA_METRAGEM })];
    if (metragemCell && metragemCell.t === "n") metragemCell.z = "#,##0.00";
    const dataCell = planilha[XLSX.utils.encode_cell({ r: linha, c: COLUNA_DATA })];
    if (dataCell && dataCell.t === "d") dataCell.z = "dd/mm/yyyy";
    const linkCell = planilha[XLSX.utils.encode_cell({ r: linha, c: COLUNA_LINK })];
    const link = l.url_final ?? l.url_original;
    if (linkCell && link) linkCell.l = { Target: link, Tooltip: "Abrir anuncio" };
  });

  planilha["!cols"] = cabecalho.map((_, c) => (c === COLUNA_LINK || c === 2 ? { wch: 45 } : { wch: 18 }));

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Anuncios novos");

  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const ano = hoje.getFullYear();
  XLSX.writeFile(livro, `anuncios-novos-${dia}-${mes}-${ano}.xlsx`);
}

export default function ListingsNew({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const [listings, setListings] = useState<NewListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { listings } = await fetchNewListings(token);
      setListings(listings);
    } catch (err) {
      if (err instanceof SessaoExpiradaError) {
        onSessionExpired();
        return;
      }
      setError(err instanceof Error ? err.message : "erro ao carregar anuncios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemover = useCallback((id: string) => {
    setListings((prev) => prev.filter((l) => l.id !== id));
  }, []);

  if (loading) return <p className="status-msg">Carregando anuncios novos...</p>;
  if (error) return <p className="status-msg error">{error}</p>;
  if (listings.length === 0) return <p className="status-msg">Nenhum anuncio novo para analisar no momento.</p>;

  return (
    <div className="listings-page">
      <div className="listings-toolbar">
        <button type="button" onClick={() => exportarParaExcel(listings)}>
          Exportar para Excel
        </button>
      </div>
      <div className="listings">
        {listings.map((listing, index) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            index={index}
            token={token}
            onSessionExpired={onSessionExpired}
            onRemover={handleRemover}
          />
        ))}
      </div>
    </div>
  );
}
