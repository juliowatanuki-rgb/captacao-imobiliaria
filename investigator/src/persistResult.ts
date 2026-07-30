import type pg from "pg";
import type { GeminiCallResult } from "./types.js";

export interface RegistrarInvestigacaoParams {
  listingId: string;
  resultado: GeminiCallResult;
  fotosAnalisadas: number;
  fontesExternasPesquisadas: number;
  tempoProcessamentoMs: number;
}

/** Grava o resultado (ou erro) da investigacao no Neon (regra 10 do pedido original). */
export async function registrarInvestigacao(pool: pg.Pool, params: RegistrarInvestigacaoParams): Promise<void> {
  const { listingId, resultado, fotosAnalisadas, fontesExternasPesquisadas, tempoProcessamentoMs } = params;

  const status = resultado.resultado?.status ?? "erro";

  await pool.query(
    `INSERT INTO listing_investigations (
      listing_id, condominio, endereco, bairro, cidade, confianca, status,
      evidencias, fontes, divergencias, criterio_confirmacao, fotos_analisadas,
      fontes_externas_pesquisadas, modelo_usado, tokens_prompt, tokens_resposta,
      tempo_processamento_ms, erro
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      listingId,
      resultado.resultado?.condominio ?? null,
      resultado.resultado?.endereco ?? null,
      resultado.resultado?.bairro ?? null,
      resultado.resultado?.cidade ?? null,
      resultado.resultado?.confianca ?? null,
      status,
      JSON.stringify(resultado.resultado?.evidencias ?? []),
      JSON.stringify(resultado.resultado?.fontes ?? []),
      JSON.stringify(resultado.resultado?.divergencias ?? []),
      resultado.resultado?.criterioConfirmacao ?? null,
      fotosAnalisadas,
      fontesExternasPesquisadas,
      resultado.modelo,
      resultado.usage.totalInputTokens,
      resultado.usage.totalOutputTokens,
      tempoProcessamentoMs,
      resultado.erro,
    ]
  );
}
