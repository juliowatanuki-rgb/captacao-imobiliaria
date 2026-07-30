import type { DetalheExtraido, ListingParaInvestigar } from "./types.js";

const MAX_CONSULTAS = 6;

function trechoDistintivo(descricao: string | null): string | null {
  if (!descricao) return null;
  // Pega a primeira frase "completa" com pelo menos 6 palavras - trechos
  // curtos demais (ex: "Otimo apartamento!") sao genericos demais para
  // funcionar como busca entre aspas (regra 3: "trechos especificos da
  // descricao entre aspas").
  const frases = descricao.split(/(?<=[.!?])\s+/).map((f) => f.trim());
  const candidata = frases.find((f) => f.split(/\s+/).length >= 6);
  if (!candidata) return null;
  // Limita o tamanho para nao estourar o limite pratico de query de buscadores.
  return candidata.length > 140 ? `${candidata.slice(0, 140)}` : candidata;
}

function formatarPreco(preco: number | null): string | null {
  if (preco === null) return null;
  return `R$ ${Math.round(preco).toLocaleString("pt-BR")}`;
}

/**
 * Gera combinacoes de consulta (regra 3 do ajuste pedido) para tentar
 * reproduzir o cruzamento manual que uma corretora faria: mesmo imovel
 * anunciado em outro portal/imobiliaria, ou pagina do proprio condominio/
 * construtora. Funcao pura - nao faz nenhuma chamada de rede.
 */
export function gerarConsultasBusca(listing: ListingParaInvestigar, detalhe: DetalheExtraido): string[] {
  const consultas: string[] = [];
  const cidade = "Praia Grande";
  const bairro = listing.bairro;
  const metragem = listing.areaUtil !== null ? `${listing.areaUtil} m²` : null;
  const preco = formatarPreco(listing.preco);

  // 1) Trecho literal da descricao entre aspas - a mais especifica possivel,
  // costuma ser a que mais reduz falsos positivos quando o anuncio foi
  // replicado em outro portal com o mesmo texto.
  const trecho = trechoDistintivo(listing.descricao);
  if (trecho) consultas.push(`"${trecho}"`);

  // 2) Metragem + dormitorios + bairro + cidade (perfil basico do imovel).
  if (metragem && bairro) {
    const partes = [`"${metragem}"`, listing.dormitorios ? `${listing.dormitorios} dormitorios` : null, bairro, cidade].filter(Boolean);
    consultas.push(partes.join(" "));
  }

  // 3) Valor de condominio + IPTU (regra 3): forte porque poucos imoveis tem
  // exatamente os mesmos dois valores ao mesmo tempo.
  if (detalhe.condominioValorTexto && detalhe.iptuValorTexto) {
    consultas.push(`condominio ${detalhe.condominioValorTexto} IPTU ${detalhe.iptuValorTexto} ${bairro ?? ""} ${cidade}`.trim());
  }

  // 4) Preco + metragem + bairro - o preco exato reduz bastante o universo
  // de imoveis parecidos (ao contrario de so bairro+metragem+dormitorios).
  if (preco && metragem && bairro) {
    consultas.push(`apartamento ${bairro} ${cidade} ${metragem} ${preco}`);
  }

  // 5) Suites + vagas + bairro (perfil complementar, ajuda a desambiguar
  // quando ha varios imoveis do mesmo tamanho no bairro).
  if (bairro && (listing.suites || listing.vagas)) {
    const partes = [
      "apartamento",
      bairro,
      cidade,
      listing.suites ? `${listing.suites} suite${listing.suites > 1 ? "s" : ""}` : null,
      listing.vagas ? `${listing.vagas} vaga${listing.vagas > 1 ? "s" : ""}` : null,
    ].filter(Boolean);
    consultas.push(partes.join(" "));
  }

  // 6) Codigo do imovel + imobiliaria (regra 3) - util quando o mesmo anuncio
  // foi replicado em portais que preservam a referencia original no texto.
  if (listing.codigoImovel) {
    consultas.push(`"${listing.codigoImovel}" ${listing.siteNome}`);
  }

  // Dedup preservando ordem de prioridade e aplica o teto.
  const vistas = new Set<string>();
  const unicas = consultas.filter((q) => {
    const chave = q.toLowerCase();
    if (!q.trim() || vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });

  return unicas.slice(0, MAX_CONSULTAS);
}
