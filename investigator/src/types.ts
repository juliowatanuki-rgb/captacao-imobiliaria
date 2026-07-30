// Tipos da prova de conceito de investigacao de localizacao de anuncios via Gemini.

export interface ListingParaInvestigar {
  listingId: string;
  siteId: string;
  siteNome: string;
  codigoImovel: string | null;
  urlOriginal: string;
  urlFinal: string | null;
  titulo: string | null;
  descricao: string | null;
  bairro: string | null;
  areaUtil: number | null;
  preco: number | null;
  condominioNome: string | null;
  dormitorios: number | null;
  suites: number | null;
  vagas: number | null;
}

// Extraidos ao vivo da pagina de detalhe no momento da investigacao (rule 5:
// condominio/IPTU nao existem em `listings`, so aparecem no detalhe).
export interface DetalheExtraido {
  condominioValorTexto: string | null;
  iptuValorTexto: string | null;
  fotos: FotoCandidata[];
  erro: string | null;
}

export interface FotoCandidata {
  url: string;
  categoriaProvavel: string | null;
}

// Um resultado organico de busca externa (regra 4/5 do ajuste pedido pelo
// usuario) - a fonte publica usada para tentar reproduzir manualmente o
// cruzamento que uma corretora faria com outros anuncios/portais.
export interface ResultadoBusca {
  consulta: string;
  titulo: string;
  url: string;
  trecho: string;
}

// Extracao heuristica (regex, sem IA) sobre um ResultadoBusca, feita ANTES de
// mandar pro Gemini - da pro modelo um resumo estruturado do que cada fonte
// parece indicar, alem do titulo/trecho brutos.
export interface EvidenciaExterna {
  resultado: ResultadoBusca;
  possivelCondominio: string | null;
  possivelEndereco: string | null;
  camposCoincidentes: string[];
}

// Formato obrigatorio de resposta (regra 7 do ajuste pedido pelo usuario -
// evolucao da regra 8 do pedido original, com divergencias e criterio_confirmacao).
export interface InvestigacaoResultado {
  condominio: string;
  endereco: string;
  bairro: string;
  cidade: string;
  confianca: number;
  status: "localizado" | "parcial" | "nao_localizado";
  evidencias: string[];
  fontes: string[];
  divergencias: string[];
  criterioConfirmacao: string;
}

export interface GeminiUsage {
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalTokens: number | null;
}

export interface GeminiCallResult {
  resultado: InvestigacaoResultado | null;
  usage: GeminiUsage;
  modelo: string;
  erro: string | null;
}
