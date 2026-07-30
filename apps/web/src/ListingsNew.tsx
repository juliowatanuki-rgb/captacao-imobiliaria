import { useEffect, useState } from "react";
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

function SugestaoIA({ listing, onUsarSugestao }: { listing: NewListing; onUsarSugestao: (listing: NewListing) => void }) {
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
          <button type="button" onClick={() => onUsarSugestao(listing)}>
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
  const [notesDraft, setNotesDraft] = useState<Record<string, { observacoes: string; condominio: string; endereco: string }>>({});

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

  async function handleStatus(id: string, status: "analisado" | "descartado" | "selecionado_para_captacao") {
    try {
      await setListingStatus(token, id, status);
      setListings((prev) => prev.filter((l) => l.id !== id));
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

  function draftFor(id: string) {
    return notesDraft[id] ?? { observacoes: "", condominio: "", endereco: "" };
  }

  function updateDraft(id: string, field: "observacoes" | "condominio" | "endereco", value: string) {
    setNotesDraft((prev) => ({ ...prev, [id]: { ...draftFor(id), [field]: value } }));
  }

  function usarSugestaoIA(listing: NewListing) {
    setNotesDraft((prev) => ({
      ...prev,
      [listing.id]: {
        ...draftFor(listing.id),
        condominio: listing.ia_condominio || draftFor(listing.id).condominio,
        endereco: listing.ia_endereco || draftFor(listing.id).endereco,
      },
    }));
  }

  async function saveNotes(id: string) {
    const draft = draftFor(id);
    try {
      await setListingNotes(token, id, {
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

  function escapeCsv(valor: string): string {
    if (/[;"\r\n]/.test(valor)) {
      return `"${valor.replace(/"/g, '""')}"`;
    }
    return valor;
  }

  function exportarParaExcel() {
    const linhas = [
      "id;imobiliaria;link;condominio;endereco",
      ...listings.map((l, i) =>
        [
          String(i + 1),
          l.site_nome,
          l.url_final ?? l.url_original,
          l.condominio_identificado_manual ?? l.condominio_nome ?? "",
          l.endereco_identificado_manual ?? l.endereco ?? "",
        ]
          .map(escapeCsv)
          .join(";")
      ),
    ];
    const conteudo = "﻿" + linhas.join("\r\n");
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, "0");
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const ano = hoje.getFullYear();
    const a = document.createElement("a");
    a.href = url;
    a.download = `anuncios-novos-${dia}-${mes}-${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="status-msg">Carregando anuncios novos...</p>;
  if (error) return <p className="status-msg error">{error}</p>;
  if (listings.length === 0) return <p className="status-msg">Nenhum anuncio novo para analisar no momento.</p>;

  return (
    <div className="listings-page">
      <div className="listings-toolbar">
        <button type="button" onClick={exportarParaExcel}>
          Exportar para Excel
        </button>
      </div>
      <div className="listings">
      {listings.map((listing, index) => (
        <article key={listing.id} className="listing-card">
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
              <input
                value={draftFor(listing.id).condominio}
                onChange={(e) => updateDraft(listing.id, "condominio", e.target.value)}
              />
            </label>
            <label>
              Endereco identificado
              <input
                value={draftFor(listing.id).endereco}
                onChange={(e) => updateDraft(listing.id, "endereco", e.target.value)}
              />
            </label>
            <label>
              Observacoes
              <textarea
                value={draftFor(listing.id).observacoes}
                onChange={(e) => updateDraft(listing.id, "observacoes", e.target.value)}
              />
            </label>
            <button type="button" onClick={() => saveNotes(listing.id)}>
              Salvar observacoes
            </button>
          </div>

          <div className="actions">
            <button type="button" onClick={() => handleStatus(listing.id, "analisado")}>
              Marcar como analisado
            </button>
            <button type="button" onClick={() => handleStatus(listing.id, "descartado")}>
              Descartar
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => handleStatus(listing.id, "selecionado_para_captacao")}
            >
              Selecionar para captacao
            </button>
          </div>
        </article>
      ))}
      </div>
    </div>
  );
}
