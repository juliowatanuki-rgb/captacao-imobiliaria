# Captacao Imobiliaria

Ferramenta interna de inteligencia para captacao de imoveis em Praia Grande/SP.
Monitora anuncios de imobiliarias locais e mostra apenas os anuncios **novos**
(que surgiram depois da primeira varredura de cada site) para analise manual.

Nao e um portal de imoveis. Nao republica anuncios nem armazena fotos.

## Estrutura do monorepo

- `apps/web` - painel (React + TypeScript + Vite), hospedado na Vercel
- `apps/api` - API (Node + TypeScript, funcoes serverless), hospedada na Vercel
- `packages/db` - schema SQL (migrations), seed dos sites monitorados, client Postgres
- `packages/shared` - tipos TypeScript compartilhados
- `packages/crawler-core` - normalizacao de URL, geracao de `identity_key`, upsert, logging de execucao
- `crawlers` - um crawler por imobiliaria (`crawlers/src/sites/<site_id>.ts`), com Playwright
- `.github/workflows/crawl.yml` - roda a coleta diaria via GitHub Actions

## Setup do zero

### 1. Instalar dependencias

```bash
npm install
```

Isso instala tudo (workspaces raiz, api, web, db, crawler-core, crawlers).

### 2. Criar o banco no Neon

1. Criar uma conta gratuita em https://neon.tech e um projeto novo.
2. Copiar a connection string (`postgres://...`).
3. Criar um arquivo `.env` na raiz (baseado em `.env.example`) com `DATABASE_URL`.

### 3. Rodar as migrations

```bash
npm run migrate
```

Isso cria as tabelas `users`, `monitored_sites`, `listings`, `crawl_runs`,
`site_crawl_runs` e `listing_events`, com a constraint `unique(site_id, identity_key)`.

### 4. Cadastrar os sites monitorados

Editar `packages/db/sites.seed.json` com a lista definitiva das 20 imobiliarias
(id em slug, nome, url_base, url_listagem). Depois:

```bash
npm run seed:sites
```

Rodar novamente sempre que a lista mudar (e um upsert, nao duplica).

### 5. Criar os usuarios iniciais (admin e corretora)

```bash
npm run create:user -w @captacao/db -- corretora@exemplo.com "senha-forte" "Nome da Corretora" corretora
npm run create:user -w @captacao/db -- admin@exemplo.com "outra-senha-forte" "Administrador" admin
```

### 6. Criar o primeiro crawler

Copiar `crawlers/src/sites/_template.ts` para `crawlers/src/sites/<site_id>.ts`
(o `id` precisa ser identico ao cadastrado em `sites.seed.json`), ajustar os
seletores CSS para o HTML real do site.

Testar localmente:

```bash
npm run migrate
DATABASE_URL=... npm run crawl:site -w @captacao/crawlers -- <site_id>
```

Rodar duas vezes seguidas e confirmar:

- 1a vez: todos os anuncios entram como base inicial (`analysis_status = analisado`).
- 2a vez: nenhum duplicado; so aparecem como novos os anuncios que nao existiam antes.

### 7. Rodar a API localmente

```bash
cd apps/api
npx vercel dev
```

(requer `vercel login` e as env vars `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN` configuradas no projeto Vercel ou em `.env`)

### 8. Rodar o painel localmente

```bash
cd apps/web
cp .env.example .env   # ajustar VITE_API_URL para a URL da API local/deploy
npm run dev
```

### Performance do painel

Auditoria de 2026-08-01 (usuario reportou o painel lento, principalmente ao
trocar de aba). Achados e correcoes:

- **Cada aba agora e um chunk JS separado** (`apps/web/src/App.tsx`, via
  `React.lazy`), baixado so quando o usuario visita ela pela 1a vez -
  ninguem paga pelo codigo de `Users`/`CrawlRuns` (telas admin) so pra abrir
  o Dashboard.
- **`xlsx` (429 KB / 143 KB gzip) saiu do bundle principal** -
  `apps/web/src/ListingsNew.tsx` agora importa a biblioteca dinamicamente
  (`await import("xlsx")`) so quando o botao "Exportar para Excel" e
  clicado, em vez de no topo do arquivo. Confirmado no `npm run build`: o
  chunk principal caiu para 148 KB (48 KB gzip); antes, o `xlsx` inteiro ia
  junto em toda visita.
- **Trocar de aba nao recarrega mais os dados do zero** - uma aba, uma vez
  visitada, fica montada (so escondida via CSS `display:none`) em vez de
  desmontar; voltar pra ela e instantaneo, sem repetir o fetch nem a query.
- **Digitar num campo de observacoes nao re-renderiza mais a fila inteira**
  - a aba "Anuncios novos" (com ate ~700 cards) tinha o rascunho de todos os
  campos manuais num unico objeto de estado no componente pai; cada tecla
  digitada re-renderizava todos os cards. Extraido um componente `ListingCard`
  memoizado (`React.memo`) com estado proprio por card.
- **Indice composto em `listing_investigations`** (migration
  `0008_listing_investigations_perf_index.sql`, `(listing_id, criado_em DESC)`)
  - a query de `/api/listings/new` faz um `LEFT JOIN LATERAL` por linha
  buscando a investigacao mais recente; sem esse indice, cada busca exigia
  um sort em memoria. Ainda nao e o maior gargalo hoje (tabela pequena, POC
  do Gemini ainda nao autorizada em producao), mas evita que vire um quando
  o volume de investigacoes crescer.
- **Nao implementado ainda:** paginacao de `/api/listings/new` (hoje retorna
  a fila inteira de `analysis_status = 'pendente'`, ~700 linhas). Enquanto a
  fila ficar na casa das centenas isso e tranquilo; se crescer muito
  alem disso (milhares), vale revisitar com paginacao real no backend e no
  painel.

## Deploy

### Vercel (frontend e API)

Criar dois projetos Vercel apontando para este repositorio:

- **web**: root directory `apps/web`, framework Vite.
- **api**: root directory `apps/api`. Vercel detecta automaticamente as
  funcoes dentro de `apps/api/api/*.ts`.

Configurar as environment variables de cada projeto no painel da Vercel:

- API: `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`
- web: `VITE_API_URL` apontando para a URL do projeto da API

### GitHub Actions (crawlers)

O repositorio precisa ser **publico** para nao consumir minutos limitados.

Configurar em Settings > Secrets and variables > Actions:

- `DATABASE_URL`

O workflow `.github/workflows/crawl.yml` roda diariamente (09:00 UTC) e tambem
pode ser disparado manualmente pela aba Actions (`workflow_dispatch`).

### Exportacao continua para o Google Sheets

`sheets-sync/` roda ao final de todo `crawl.yml` (passo "Sincronizar planilha
Google Sheets", com `if: always()` mesmo que algum crawler falhe) e acrescenta
na planilha 100% dos anuncios de **qualquer status** (pendente, analisado,
descartado, ativo ou ausente) que ainda nao foram exportados - nunca apaga
nem reescreve uma linha ja gravada. E um arquivo historico da 1a captura de
cada anuncio, nao um espelho ao vivo do banco.

**Snapshot imutavel da 1a captura.** Os campos historicos da planilha (titulo,
preco, condominio, endereco, etc.) sao lidos exclusivamente da tabela
`listing_first_snapshot` (migration `0006_listing_first_snapshot.sql`),
gravada uma unica vez por `upsertListingsBatch` no exato momento em que o
anuncio e inserido em `listings` e nunca atualizada depois - mesmo que o
anuncio mude de preco ou status nas coletas seguintes (ver
`packages/crawler-core/src/upsertListing.ts`). Anuncios que ja existiam antes
dessa migration tiveram um snapshot reconstruido a partir dos dados atuais do
banco (nao e possivel recuperar o valor historico verdadeiro que ja tinha sido
sobrescrito) - esses ficam marcados com `reconstruido = true` na tabela e
`sim` na coluna "snapshot reconstruido" da planilha. As colunas "status atual"
e "status da analise" continuam sendo lidas ao vivo de `listings` no momento
da exportacao (foto do instante da exportacao, nunca mais atualizada depois).

**`descricao` NAO faz parte do snapshot nem da planilha** (analise de
armazenamento de 2026-07-31): a coluna `descricao` ainda existe em
`listing_first_snapshot` (nao foi removida fisicamente), mas `upsertListingsBatch`
parou de preenche-la, e `sheets-sync` nunca a le nem exporta. O dado completo
de `descricao` continua disponivel em `listings` (mutavel, nunca apagado),
porque a investigacao via Gemini ainda depende dele. **Achado a parte:**
hoje `descricao` esta NULL em 100% dos anuncios em producao - nenhum crawler
(nem os 4 que citam "descricao" em comentarios de estrutura HTML) realmente
extrai esse campo; nao e um bug de mapeamento/upsert/query, e simplesmente
funcionalidade nunca implementada nos crawlers.

**Auditoria e dedup.** As 3 ultimas colunas da planilha (`listing_id`,
`site_id`, `identity_key`) identificam a linha de forma inequivoca e podem
ficar ocultas, mas nunca devem ser removidas. O controle de "ja exportado"
combina duas fontes: a coluna `sheets_exportado_em` da tabela `listings`
(migration `0005_listings_sheets_sync.sql`) e uma leitura da coluna
`listing_id` ja existente na propria planilha no inicio de cada execucao
(`sheets-sync/src/sheetsClient.ts#listarListingIdsExistentes`). Isso torna a
sincronizacao a prova de falha parcial: se o processo cair depois do
`append()` na planilha e antes do `UPDATE` que marca `sheets_exportado_em`, a
proxima execucao reconhece a linha (ja presente na planilha) e apenas
reconcilia o Neon, sem duplicar (ver `sheets-sync/src/sync.ts`).

**Formatacao.** A 1a coluna e sempre `primeira captura em` (formato de data
`dd/mm/yyyy`, sem horario - o snapshot so guarda a data). A coluna `preco` usa
formato de moeda brasileira (`R$ #.##0,00`, via locale `pt_BR` da planilha);
nao ha hoje nenhuma outra coluna financeira numerica (o `condominio` exportado
e o nome do condominio, texto, e nao existe coluna de IPTU no modelo atual).
O cabecalho fica congelado e com filtro ativo, e as 3 colunas de auditoria
ficam ocultas (nao removidas). Essa formatacao e aplicada em toda a coluna,
sem limite de linha final, entao qualquer linha nova acrescentada por
`sheets:sync` ja nasce formatada. `npm run sheets:reformatar` (script
`sheets-sync/src/reformatar.ts`) aplica/reaplica isso na planilha real - e
idempotente (recalcula os indices a partir do cabecalho atual antes de agir,
entao rodar de novo nao reordena nem duplica nada).

### Eventos (`listing_events`)

Tipos gravados hoje: `created_from_initial_seed`, `created_as_new`,
`marked_absent`, `marked_removed`, `reactivated`, `marked_analyzed`,
`marked_discarded`, `marked_selected_for_capture` (migration
`0007_listing_events_reactivated.sql`). `reactivated` e gravado quando um
anuncio que estava `ausente`/`removido` reaparece numa coleta - antes disso
(analise de armazenamento de 2026-07-31) esse caso virava um evento generico
`updated`. Uma mudanca pura de atributo (preco, titulo, etc. mudando em um
anuncio ja `ativo`) atualiza a linha em `listings` normalmente, mas **nao
gera mais nenhum evento** - o tipo `updated` nao e mais usado por codigo
novo. Os eventos `updated` gravados antes dessa mudanca nao foram apagados
(continuam validos no `CHECK` da coluna `tipo`); a decisao de remove-los ou
nao fica para uma limpeza futura, com autorizacao explicita.

### Alerta de churn de identidade (`site_crawl_runs.status = 'alerta'`)

Auditoria de 2026-08-01: a fila "Anuncios novos" do painel estava recebendo
centenas de falsos "novos" por dia em alguns sites porque o codigo do imovel
mudava entre coletas (o anuncio antigo "some" como ausente e um "novo" com
outro codigo toma o lugar dele). Confirmado ao vivo, com o navegador, que
pelo menos parte disso NAO e um problema de hidratacao/timing do nosso lado -
o mais provavel e o proprio site de origem republicando o mesmo imovel com um
codigo levemente diferente (comportamento comum de CRMs imobiliarios), o que
nao da pra "consertar" com seguranca no lado do scraper sem risco de mesclar
por engano anuncios que sao realmente diferentes.

Duas camadas de mitigacao:

1. **Motores mais defensivos.** `crawlers/src/platforms/imobzi.ts` (usado por
   `aline_caetano_imoveis`, `group_house_fort`) e `imobeal.ts` (usado por
   `praialar_imoveis`) agora exigem que o codigo/href do card fique estavel
   em leituras consecutivas antes de aceitar a pagina; se nunca estabilizar,
   a pagina e **pulada nesta coleta** (o anuncio so fica "nao visto" - no
   pior caso, leva 2 coletas seguidas ausente pra virar `removido`) em vez de
   gravar um codigo transitorio como identidade definitiva e criar uma
   duplicata. Validado ao vivo em producao em 2026-08-01: `aline_caetano_imoveis`
   caiu de 50 para 16 falsos "novos"/dia, `group_house_fort` de 7 para 2,
   `praialar_imoveis` de 15 para 1 (esse ultimo passou a fechar `sucesso`,
   sem alerta).
2. **Alerta em vez de sucesso silencioso.** Mesmo com o motor mais robusto,
   `packages/crawler-core/src/runCrawler.ts` (`indicaChurnDeIdentidade`)
   marca a coleta de um site como `status = 'alerta'` (em vez de `'sucesso'`)
   sempre que `anuncios_novos + anuncios_ausentes` for >= 15 e >= 5% do total
   encontrado na mesma coleta (1a coleta de um site nunca conta - 100% novo e
   esperado ali). Aparece na aba "Execucoes de coleta" do painel (badge
   amarelo, mesma cor de `sucesso_parcial`) com a mensagem explicando a
   proporcao encontrada - a garantia de confiabilidade aqui nao e "nunca vai
   ter uma coleta estranha" (impossivel de prometer com sites de terceiros),
   e sim "nunca vai passar batido sem alguem perceber".

Setup (uma vez, feito direto no Google Cloud e no GitHub, nao no codigo):

1. Criar/usar um projeto no [Google Cloud Console](https://console.cloud.google.com),
   ativar a **Google Sheets API** (menu "APIs e servicos" > "Ativar APIs e
   servicos" > procurar "Google Sheets API" > Ativar).
2. Criar uma **Service Account** ("APIs e servicos" > "Credenciais" > "Criar
   credenciais" > "Conta de servico"), sem precisar dar nenhum papel/role de
   projeto (a permissao real vem do compartilhamento da planilha no passo 4).
3. Na conta de servico criada, aba "Chaves" > "Adicionar chave" > "Criar nova
   chave" > tipo **JSON** - isso baixa um arquivo `.json` pro computador.
4. Criar a planilha no Google Sheets normalmente e compartilhar (botao
   "Compartilhar") com o e-mail da service account (formato
   `nome@projeto.iam.gserviceaccount.com`, visivel no arquivo JSON e na
   pagina da conta de servico), com permissao de **Editor**.
5. Copiar o ID da planilha (o trecho entre `/d/` e `/edit` na URL, ex.:
   `https://docs.google.com/spreadsheets/d/`**`ESTE_TRECHO`**`/edit`).
6. Em Settings > Secrets and variables > Actions do repositorio, criar dois
   secrets novos:
   - `GOOGLE_SHEETS_CREDENTIALS_JSON`: colar o **conteudo inteiro** do
     arquivo `.json` baixado no passo 3.
   - `GOOGLE_SHEETS_ID`: o ID copiado no passo 5.

Depois disso o proximo `crawl.yml` (agendado ou disparado manualmente) ja
cria a aba "Anuncios" na planilha com cabecalho e comeca a preencher.

### Adicionar os demais sites

Repetir o passo 6 para cada uma das 20 imobiliarias, uma por vez ou em grupos
(secao 19, passo 15 da especificacao original). Um erro em um crawler nunca
derruba os demais - cada execucao fica registrada em `site_crawl_runs`.

### Investigacao de localizacao via Gemini (prova de conceito)

`investigator/` e uma POC isolada que reproduz o cruzamento manual de uma
corretora: gera consultas a partir dos dados do anuncio (metragem, condominio,
IPTU, bairro, trechos da descricao, etc.), pesquisa fontes publicas via
DuckDuckGo HTML (sem chave, sem billing - ver `investigator/src/webSearch.ts`
para as ressalvas de robustez/ToS) e manda tudo (texto + ate 8 fotos + os
resultados da pesquisa) para a Gemini API, que devolve um JSON estruturado com
evidencias, divergencias e criterio de confirmacao. Requer o secret
`GEMINI_API_KEY` (alem de `DATABASE_URL`) em Settings > Secrets and variables
> Actions. Disparo **manual apenas** pelo workflow
`.github/workflows/investigate-manual.yml`, limitado a no maximo 5 anuncios
por execucao. Fotos sao baixadas so em memoria durante a execucao (nunca
gravadas em disco ou no Neon) e a chave nunca e logada nem enviada por
querystring. Confianca alta so e aceita com pelo menos 2 evidencias
independentes (reforcado em codigo, nao so no prompt - ver
`aplicarRegraDeConfianca` em `investigator/src/gemini.ts`). Resultado gravado
em `listing_investigations`. `npm run validar:anuncio-conhecido -w
@captacao/investigator -- <url>` roda so a extracao+pesquisa (sem chamar a
Gemini nem gravar nada) contra um anuncio conhecido, para validar o processo.

## Regras principais (para nao esquecer ao mexer no codigo)

- Identidade do anuncio dentro de cada site, nessa ordem: codigo oficial >
  URL normalizada > fingerprint (ultimo recurso, marcado como identidade fraca).
- `unique(site_id, identity_key)` impede duplicata dentro da mesma imobiliaria,
  mas o mesmo imovel pode (e deve) existir como registros diferentes em
  imobiliarias diferentes. Nao ha deduplicacao entre sites na primeira fase.
- Primeira varredura de cada site = base inicial (`analysis_status = analisado`
  automaticamente, nao entra na fila de novos anuncios).
- Um anuncio some da listagem -> vira `ausente`; so vira `removido` depois de
  mais de uma coleta consecutiva sem encontrar. Nunca apaga o registro.
- Nao armazenar imagens, nao republicar anuncios, nao copiar fotos.
