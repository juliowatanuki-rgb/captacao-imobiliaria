// Inspecionado ao vivo em 2026-07-29 contra https://michelettoconsimoveis.com.br.
// Plataforma real: "USO" / "Agiliza" (produto da Union Softwares) - o seed
// original tinha "Tecimob" como chute, nao confirmado. Identificada pelo CDN
// cdnuso.com / cdn.uso.com.br nas fotos, pelo link "Cadastre seu Imovel"
// apontando para agilizaunion.com.br/app e pela logo "logo_uso.png" no rodape.
//
// A URL "/imoveis" (usada como urlListagem no seed original) e uma busca
// nacional sem filtro de cidade (10197 imoveis, majoritariamente Sao
// Paulo/interior). O filtro de cidade e um dropdown Semantic UI (nao um
// <select> nativo comum - precisou simular clique+selecao) que, ao buscar,
// reescreve a URL para o padrao /imoveis/{uf}/{cidade-slug}/:
// https://michelettoconsimoveis.com.br/imoveis/sp/praia-grande/
// Validada com essa URL: 4 imoveis, 1 pagina (pagina-2 retorna 0), 100%
// cidade="Praia Grande" / "PRAIA GRANDE" (variacao de grafia do proprio
// site), 0 externalId duplicado. Nao ha area util nos cards resumidos (so
// dormitorios/banheiros/vagas).
// Crawler ainda NAO executado contra o Neon de producao - preparado para
// validacao/uso futuro.
import { createUsoSoftwaresCrawler } from "../platforms/uso_softwares.js";

export default createUsoSoftwaresCrawler({
  urlListagem: "https://michelettoconsimoveis.com.br/imoveis/sp/praia-grande/",
});
