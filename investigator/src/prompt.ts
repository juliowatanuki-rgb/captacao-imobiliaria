import type { DetalheExtraido, EvidenciaExterna, ListingParaInvestigar } from "./types.js";

// Schema JSON exigido na resposta (regra 7 do ajuste pedido pelo usuario em
// 2026-07-30, evolucao da regra 8 original com "divergencias" e
// "criterio_confirmacao"), repassado como response_format.schema na chamada
// da Gemini Interactions API - forca a resposta a vir estruturada em vez de
// texto livre.
export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    condominio: { type: "string", description: "Nome do condominio/edificio identificado, ou string vazia se nao identificado" },
    endereco: { type: "string", description: "Endereco completo (rua + numero, se possivel), ou string vazia" },
    bairro: { type: "string", description: "Bairro identificado, ou string vazia" },
    cidade: { type: "string", description: "Cidade identificada, ou string vazia" },
    confianca: { type: "integer", description: "Nivel de confianca de 0 a 100 na identificacao" },
    status: { type: "string", enum: ["localizado", "parcial", "nao_localizado"] },
    evidencias: {
      type: "array",
      items: { type: "string" },
      description: "Lista de evidencias concretas e independentes usadas (ex: nome visivel em placa na foto, mesmos valores de condominio+IPTU em uma fonte externa, descricao identica em outro portal)",
    },
    fontes: {
      type: "array",
      items: { type: "string" },
      description: "URLs ou identificacao das fontes usadas (ex: uma URL retornada na pesquisa externa, 'foto da fachada do anuncio original')",
    },
    divergencias: {
      type: "array",
      items: { type: "string" },
      description: "Pontos onde as fontes externas OU as fotos contradizem os dados do anuncio ou entre si (ex: preco diferente, condominio com nome diferente do suposto) - liste mesmo que a conclusao final ainda seja 'localizado'",
    },
    criterio_confirmacao: {
      type: "string",
      description: "Frase curta explicando POR QUE o nivel de confianca escolhido e justificado - ex: 'nome do condominio legivel em placa na foto + mesmos valores de condominio e IPTU confirmados em anuncio espelho no ZAP Imoveis'",
    },
  },
  required: [
    "condominio",
    "endereco",
    "bairro",
    "cidade",
    "confianca",
    "status",
    "evidencias",
    "fontes",
    "divergencias",
    "criterio_confirmacao",
  ],
} as const;

export const INSTRUCOES_SISTEMA = `Voce e um investigador imobiliario. Sua tarefa e reproduzir o processo que uma
corretora experiente faria manualmente: cruzar os dados do anuncio, as fotos e resultados de
pesquisa externa (outros anuncios do mesmo imovel em outros portais, paginas de construtora/
condominio) para tentar identificar a localizacao exata (condominio/edificio, endereco, bairro,
cidade) de um unico imovel anunciado.

Regras obrigatorias:
- So preencha "endereco" ou "condominio" quando houver EVIDENCIA CONCRETA E CRUZADA - nunca
  infira um endereco apenas por "parecer" um bairro ou por semelhanca generica com outros
  predios da regiao. Metragem parecida ISOLADA NUNCA e evidencia suficiente (varios predios
  diferentes tem a mesma metragem) - isso NAO pode virar "localizado" sozinho.
- confianca ALTA (acima de 70) exige PELO MENOS DUAS evidencias independentes fortes entre:
  (a) nome do condominio/edificio legivel em uma foto (placa, portaria, letreiro);
  (b) descricao identica ou quase identica a uma fonte externa;
  (c) mesmos valores de condominio E IPTU confirmados em uma fonte externa;
  (d) mesma planta/caracteristicas muito especificas batendo com uma fonte externa;
  (e) uma fonte externa contendo o endereco explicito e o restante dos dados batendo.
  Uma unica evidencia (mesmo que forte) so justifica status "parcial", nunca confianca alta.
- Para cada fonte externa fornecida, avalie criticamente se ela realmente descreve O MESMO
  imovel ou apenas um imovel parecido no mesmo bairro/metragem (isso e MUITO comum e NAO deve
  ser tratado como confirmacao) - liste em "divergencias" qualquer sinal de que pode ser um
  imovel diferente (preco diferente, condominio diferente, caracteristicas diferentes).
- Se nao houver evidencia suficiente, deixe os campos vazios e use status "nao_localizado" ou
  "parcial", com confianca baixa. E preferivel admitir que nao sabe a "chutar" um endereco.
- "criterio_confirmacao" deve explicar em uma frase objetiva por que o nivel de confianca
  escolhido e justificado (ou por que nao ha confianca suficiente).
- Toda evidencia usada deve ser listada em "evidencias" de forma especifica e verificavel (nao
  frases genericas como "parece um bairro nobre").
- Responda SEMPRE no formato JSON exigido, em portugues do Brasil.`;

function formatarMoeda(valor: number | null): string {
  return valor !== null ? `R$ ${valor.toLocaleString("pt-BR")}` : "nao informado";
}

function montarBlocoEvidenciasExternas(evidencias: EvidenciaExterna[]): string[] {
  if (evidencias.length === 0) {
    return ["", "=== PESQUISA EXTERNA ===", "Nenhum resultado de pesquisa externa disponivel para este anuncio."];
  }

  const linhas = ["", `=== PESQUISA EXTERNA (${evidencias.length} resultado(s)) ===`];
  evidencias.forEach((ev, i) => {
    linhas.push(
      "",
      `Fonte ${i + 1}:`,
      `  Consulta usada: ${ev.resultado.consulta}`,
      `  Titulo: ${ev.resultado.titulo}`,
      `  URL: ${ev.resultado.url}`,
      `  Trecho: ${ev.resultado.trecho || "(sem trecho)"}`,
      `  Possivel condominio extraido automaticamente (pode estar errado, confira): ${ev.possivelCondominio ?? "nenhum"}`,
      `  Possivel endereco extraido automaticamente (pode estar errado, confira): ${ev.possivelEndereco ?? "nenhum"}`,
      `  Campos que batem com o anuncio original (heuristica automatica, so um indicio, nao confirmacao): ${ev.camposCoincidentes.length > 0 ? ev.camposCoincidentes.join(", ") : "nenhum"}`
    );
  });
  return linhas;
}

/**
 * Monta o bloco de texto com os dados do anuncio, fotos e resultados de
 * pesquisa externa (regra 6 do ajuste pedido). Funcao pura, sem I/O.
 */
export function montarPromptTexto(
  listing: ListingParaInvestigar,
  detalhe: DetalheExtraido,
  evidenciasExternas: EvidenciaExterna[] = []
): string {
  const linhas = [
    INSTRUCOES_SISTEMA,
    "",
    "=== DADOS DO ANUNCIO ===",
    `Imobiliaria: ${listing.siteNome}`,
    `Codigo do imovel: ${listing.codigoImovel ?? "nao informado"}`,
    `Link original: ${listing.urlOriginal}`,
    `Titulo: ${listing.titulo ?? "nao informado"}`,
    `Descricao: ${listing.descricao ?? "nao informado"}`,
    `Bairro informado pelo site: ${listing.bairro ?? "nao informado"}`,
    `Metragem: ${listing.areaUtil !== null ? `${listing.areaUtil} m²` : "nao informado"}`,
    `Preco: ${formatarMoeda(listing.preco)}`,
    `Condominio (nome, se ja capturado): ${listing.condominioNome ?? "nao informado"}`,
    `Condominio (valor mensal, extraido da pagina): ${detalhe.condominioValorTexto ?? "nao informado"}`,
    `IPTU (extraido da pagina): ${detalhe.iptuValorTexto ?? "nao informado"}`,
    `Dormitorios: ${listing.dormitorios ?? "nao informado"}`,
    `Suites: ${listing.suites ?? "nao informado"}`,
    `Vagas: ${listing.vagas ?? "nao informado"}`,
    `Quantidade de fotos anexadas nesta mensagem: ${detalhe.fotos.length}`,
  ];

  if (detalhe.fotos.length > 0) {
    linhas.push(
      "",
      "As fotos anexadas estao na ordem abaixo (categoria detectada automaticamente, pode estar errada):",
      ...detalhe.fotos.map((f, i) => `Foto ${i + 1}: categoria provavel = ${f.categoriaProvavel ?? "desconhecida"}`)
    );
  } else {
    linhas.push("", "Nenhuma foto pode ser extraida da pagina do anuncio - analise apenas com base no texto acima.");
  }

  linhas.push(...montarBlocoEvidenciasExternas(evidenciasExternas));

  return linhas.join("\n");
}
