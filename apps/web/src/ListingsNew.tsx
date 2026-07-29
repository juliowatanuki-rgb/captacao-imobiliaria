import { useEffect, useState } from "react";
import {
  fetchNewListings,
  setListingNotes,
  setListingStatus,
  type NewListing,
} from "./api.js";

export default function ListingsNew({ token }: { token: string }) {
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
    await setListingStatus(token, id, status);
    setListings((prev) => prev.filter((l) => l.id !== id));
  }

  function draftFor(id: string) {
    return notesDraft[id] ?? { observacoes: "", condominio: "", endereco: "" };
  }

  function updateDraft(id: string, field: "observacoes" | "condominio" | "endereco", value: string) {
    setNotesDraft((prev) => ({ ...prev, [id]: { ...draftFor(id), [field]: value } }));
  }

  async function saveNotes(id: string) {
    const draft = draftFor(id);
    await setListingNotes(token, id, {
      observacoes: draft.observacoes,
      condominioIdentificadoManual: draft.condominio,
      enderecoIdentificadoManual: draft.endereco,
    });
  }

  function exportarParaExcel() {
    const linhas = [
      "id;link",
      ...listings.map((l, i) => `${i + 1};${l.url_final ?? l.url_original}`),
    ];
    const conteudo = "﻿" + linhas.join("\r\n");
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "anuncios-novos.csv";
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
          <a href={listing.url_final ?? listing.url_original} target="_blank" rel="noreferrer">
            Abrir anuncio original
          </a>

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
