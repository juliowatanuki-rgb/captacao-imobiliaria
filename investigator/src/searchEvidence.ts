import type { DetalheExtraido, EvidenciaExterna, ListingParaInvestigar, ResultadoBusca } from "./types.js";

// Padroes de nome de condominio/edificio em texto livre (titulo ou trecho).
// O rotulo (Condominio/Residencial/Edificio) casa em qualquer capitalizacao,
// mas o nome capturado precisa comecar com maiuscula - senao caia em falsos
// positivos como "residencial completo com piscina".
const PADROES_CONDOMINIO = [
  /\b(?:[Cc]ondom[íi]nio|[Rr]esidencial|[Ee]dif[íi]cio|[Ee]d\.)\s+([A-ZÀ-Ú][\wÀ-ú'-]*(?:\s+(?:(?:de|da|do|dos|das)\s+)?[A-ZÀ-Ú][\wÀ-ú'-]*){0,4})/,
];

// Padrao de endereco brasileiro tipico: "Rua/Av/Avenida/Alameda X, 123".
const PADRAO_ENDERECO = /\b((?:Rua|Av\.?|Avenida|Alameda|Al\.?|Travessa|Praça)\s+[A-ZÀ-Ú][\wÀ-ú'.\s]*?,\s*\d+)/;

function limparCandidato(texto: string): string {
  return texto.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
}

export function extrairPossivelCondominio(texto: string): string | null {
  for (const padrao of PADROES_CONDOMINIO) {
    const match = texto.match(padrao);
    if (match) return limparCandidato(match[0]);
  }
  return null;
}

export function extrairPossivelEndereco(texto: string): string | null {
  const match = texto.match(PADRAO_ENDERECO);
  return match ? limparCandidato(match[0]) : null;
}

/**
 * Compara o resultado de busca com os dados conhecidos do anuncio e lista
 * quais campos batem (regra 5 do ajuste pedido: "dados coincidentes"). So
 * compara valores razoavelmente especificos (metragem, precos, dormitorios)
 * - bairro/cidade sozinhos NAO contam como coincidencia relevante aqui
 * porque sao comuns demais (o proprio Gemini recebe a instrucao de nunca
 * tratar isso como evidencia forte, regra 8/9).
 */
export function identificarCamposCoincidentes(
  textoCompleto: string,
  listing: ListingParaInvestigar,
  detalhe: DetalheExtraido
): string[] {
  const campos: string[] = [];
  const texto = textoCompleto.toLowerCase();

  if (listing.areaUtil !== null) {
    const areaComVirgula = `${listing.areaUtil}`.replace(".", ",");
    if (texto.includes(`${listing.areaUtil} m`) || texto.includes(areaComVirgula)) campos.push("metragem");
  }
  if (listing.dormitorios !== null && new RegExp(`\\b${listing.dormitorios}\\s*(dormit[óo]rio|quarto)`, "i").test(texto)) {
    campos.push("dormitorios");
  }
  if (listing.suites !== null && listing.suites > 0 && new RegExp(`\\b${listing.suites}\\s*su[íi]te`, "i").test(texto)) {
    campos.push("suites");
  }
  if (listing.vagas !== null && listing.vagas > 0 && new RegExp(`\\b${listing.vagas}\\s*vaga`, "i").test(texto)) {
    campos.push("vagas");
  }
  if (detalhe.condominioValorTexto && texto.includes(detalhe.condominioValorTexto.toLowerCase())) {
    campos.push("valor_condominio");
  }
  if (detalhe.iptuValorTexto && texto.includes(detalhe.iptuValorTexto.toLowerCase())) {
    campos.push("valor_iptu");
  }
  if (listing.preco !== null) {
    const precoFormatado = Math.round(listing.preco).toLocaleString("pt-BR");
    if (texto.includes(precoFormatado.toLowerCase())) campos.push("preco");
  }

  return campos;
}

/**
 * Aplica a extracao heuristica (sem IA - so regex) sobre um resultado de
 * busca, gerando um resumo estruturado (regra 5 do ajuste pedido) para
 * alimentar o prompt do Gemini junto do titulo/trecho brutos.
 */
export function extrairEvidenciaExterna(
  resultado: ResultadoBusca,
  listing: ListingParaInvestigar,
  detalhe: DetalheExtraido
): EvidenciaExterna {
  const textoCompleto = `${resultado.titulo} ${resultado.trecho}`;
  return {
    resultado,
    possivelCondominio: extrairPossivelCondominio(textoCompleto),
    possivelEndereco: extrairPossivelEndereco(textoCompleto),
    camposCoincidentes: identificarCamposCoincidentes(textoCompleto, listing, detalhe),
  };
}
