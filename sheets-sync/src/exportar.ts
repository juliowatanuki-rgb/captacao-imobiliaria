import { getPool } from "@captacao/db";
import { acrescentarLinhas, garantirCabecalho, listarListingIdsExistentes } from "./sheetsClient.js";
import { sincronizarPlanilha } from "./sync.js";

async function main() {
  const pool = getPool();

  const { totalExportado, totalReconciliado } = await sincronizarPlanilha({
    pool,
    garantirCabecalho,
    listarListingIdsExistentes,
    acrescentarLinhas,
    log: console.log,
  });

  console.log(
    `[sheets-sync] concluido - ${totalExportado} anuncio(s) novo(s) na planilha` +
      (totalReconciliado > 0 ? `, ${totalReconciliado} reconciliado(s) sem duplicar` : "")
  );
  await pool.end();
}

main().catch((err) => {
  console.error("[sheets-sync] erro:", err);
  process.exitCode = 1;
});
