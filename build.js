// ============================================================
//  arq.semfiltro — Robô de build v5
//  + Desconto, Badge, fix link trim
// ============================================================

import { Client } from "@notionhq/client";
import { promises as fs } from "fs";
import path from "path";

const MOCK = process.env.MOCK === "1";

const COL = {
  nome:      "Nome",
  foto:      "Foto",
  destaque:  "Destaque",
  categoria: "Categoria",
  link:      "Link",
  loja:      "Loja",
  status:    "Status",
  descricao: "Descrição",
  cupom:     "CUPOM",
  desconto:  "Desconto",
  badge:     "Badge",
  nota:      "Nota ArqSemFiltro",
  pontos:    "Pontos de Atenção",
  review:    "Review ArqSemFiltro",
  valeapena: "Vale a pena?",
  showroom:  "Showroom",
  showroomOk:"Disponível Showroom",
  showroomCor:"Showroom Cor",
  showroomLogo:"Showroom Logo",
  showroomManifesto:"Showroom Manifesto",
  showroomBanner:"Showroom Banner",
};
const STATUS_PUBLICADO = "Publicado";
const DIST    = "dist";
const IMG_DIR = path.join(DIST, "images");

const txt = (rich) => (rich || []).map((r) => r.plain_text).join("").trim();
const cleanUrl = (u) => {
  let s = (u || "").trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (!s) return "";
  // se não começar com http(s), assume https://
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  return s;
};

function readProps(props) {
  const p     = (name) => props[name];
  const title = p(COL.nome)?.title;
  const catRels   = p(COL.categoria)?.relation || [];
  const loja      = p(COL.loja)?.select;
  const status    = p(COL.status)?.status;
  // Link: tenta a coluna "Link" exata; se vazia, procura QUALQUER propriedade URL preenchida
  // (à prova de nome de coluna diferente / maiúscula / acento)
  let linkRaw = p(COL.link)?.url || (p(COL.link)?.rich_text ? txt(p(COL.link).rich_text) : "") || "";
  if (!linkRaw) {
    for (const [propName, prop] of Object.entries(props)) {
      // ignora a coluna "Link Original" (link cru da loja, não afiliado)
      if (/original/i.test(propName)) continue;
      if (prop?.type === "url" && prop.url) { linkRaw = prop.url; break; }
    }
  }
  const link = cleanUrl(linkRaw);
  const cupom     = p(COL.cupom)?.rich_text;
  const desc      = p(COL.descricao)?.rich_text;
  const destaque  = p(COL.destaque)?.checkbox;
  const desconto  = p(COL.desconto)?.rich_text;
  const badge     = p(COL.badge)?.rich_text;
  const showroom  = p(COL.showroom)?.select?.name || "";
  const showroomOk= p(COL.showroomOk)?.checkbox || false;
  const showroomCor = p(COL.showroomCor)?.rich_text ? txt(p(COL.showroomCor).rich_text) : "";
  const showroomManifesto = p(COL.showroomManifesto)?.rich_text ? txt(p(COL.showroomManifesto).rich_text) : "";
  // Logo e Banner: pega URL do primeiro arquivo (ou null)
  const pickFirstFileUrl = (files) => {
    if (!files || !files.length) return null;
    const f = files[0];
    return f.type === "external" ? f.external?.url : f.file?.url;
  };
  const showroomLogoUrl = pickFirstFileUrl(p(COL.showroomLogo)?.files);
  const showroomBannerUrl = pickFirstFileUrl(p(COL.showroomBanner)?.files);
  const fotoFiles = p(COL.foto)?.files || [];

  // ---- Review ArqSemFiltro (4 colunas) ----
  // Nota: aceita Number ou texto ("8,8 / 10", "9.1", "9") → normaliza p/ número 0-10
  const notaProp = p(COL.nota);
  let notaRaw = "";
  if (notaProp?.type === "number" && notaProp.number != null) notaRaw = String(notaProp.number);
  else if (notaProp?.rich_text) notaRaw = txt(notaProp.rich_text);
  const notaMatch = notaRaw.replace(",", ".").match(/\d+(\.\d+)?/);
  const nota = notaMatch ? Math.min(10, parseFloat(notaMatch[0])) : null;

  // Pontos de Atenção: texto com bullets/quebras → array de itens limpos
  const pontosTxt = p(COL.pontos)?.rich_text ? txt(p(COL.pontos).rich_text) : "";
  const pontos = pontosTxt
    .split(/\n|(?:^|\s)[•·▪-]\s+/)
    .map(s => s.trim().replace(/^[•·▪-]\s*/, ""))
    .filter(s => s.length > 2);

  const review    = p(COL.review)?.rich_text    ? txt(p(COL.review).rich_text)    : "";
  const valeapena = p(COL.valeapena)?.rich_text ? txt(p(COL.valeapena).rich_text) : "";

  const fotoUrls = fotoFiles.map(f =>
    f.type === "external" ? f.external?.url : f.file?.url
  ).filter(Boolean);

  return {
    nome:      title ? txt(title) : "",
    catIds:    catRels.map(r => r.id),
    categorias: [],
    categoria:  "Sem categoria",
    loja:      loja?.name || "",
    status:    status?.name || "",
    link,
    cupom:     cupom ? txt(cupom) : "",
    descricao: desc  ? txt(desc)  : "",
    desconto:  desconto ? txt(desconto) : "",
    badge:     badge    ? txt(badge)    : "",
    destaque:  !!destaque,
    nota, pontos, review, valeapena,
    showroom, showroomOk, showroomCor, showroomManifesto,
    showroomLogoUrl, showroomBannerUrl,
    fotoUrls,
  };
}

const pageNameCache = new Map();
async function resolvePageName(notion, pageId) {
  if (pageNameCache.has(pageId)) return pageNameCache.get(pageId);
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    const props = page.properties || {};
    const titleProp = Object.values(props).find(p => p.type === "title");
    const name = titleProp ? txt(titleProp.title) : "Sem categoria";
    pageNameCache.set(pageId, name);
    return name;
  } catch (e) {
    console.warn("  ! Não consegui resolver categoria:", pageId, e.message);
    return "Sem categoria";
  }
}

function extFromUrl(url, ct) {
  try {
    const m = new URL(url).pathname.toLowerCase().match(/\.(jpe?g|png|webp|gif|avif)$/);
    if (m) return m[0];
  } catch (_) {}
  return ({ "image/jpeg":".jpg","image/png":".png","image/webp":".webp","image/gif":".gif","image/avif":".avif" })[ct] || ".jpg";
}

async function downloadImage(url, id) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const ct  = res.headers.get("content-type") || "";
    const fileName = id.replace(/-/g, "") + extFromUrl(url, ct);
    await fs.writeFile(path.join(IMG_DIR, fileName), Buffer.from(await res.arrayBuffer()));
    return "images/" + fileName;
  } catch (e) {
    console.warn("  ! Falha ao baixar foto:", e.message);
    return null;
  }
}

async function fetchFromNotion() {
  const notion     = new Client({ auth: process.env.NOTION_TOKEN });
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!process.env.NOTION_TOKEN || !databaseId)
    throw new Error("Faltam NOTION_TOKEN e/ou NOTION_DATABASE_ID.");

  const rows = [];
  let cursor = undefined;
  do {
    const resp = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      filter: { property: COL.status, status: { equals: STATUS_PUBLICADO } },
    });
    for (const page of resp.results)
      rows.push({ id: page.id, ...readProps(page.properties) });
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  for (const row of rows) {
    if (row.catIds.length) {
      const nomes = await Promise.all(row.catIds.map(id => resolvePageName(notion, id)));
      row.categorias = nomes;
      row.categoria  = nomes[0] || "Sem categoria";
    }
  }
  return rows;
}

function mockRows() {
  return [
    { nome:"Pendurador de Roupa Travessa", categorias:["Visual Merchandising"], categoria:"Visual Merchandising",
      loja:"Comac", link:"www.comac.com.br/produto/1", cupom:"ARQSEMFILTRO", desconto:"", badge:"🔥 Trending",
      descricao:"Organiza o espaço vertical e dobra a capacidade de exposição sem obra.", destaque:true },
    { nome:"KIT 200 Cabides Veludo", categorias:["Visual Merchandising"], categoria:"Visual Merchandising",
      loja:"Mercado Livre", link:"mercadolivre.com.br/1", cupom:"CASA15", desconto:"15%", badge:"",
      descricao:"Cabide de veludo não cai, não deforma, não envergonha. Detalhe que eleva a percepção do produto.", destaque:true },
    { nome:"Coifa Industrial", categorias:["Alimentação"], categoria:"Alimentação",
      loja:"Mercado Livre", link:"https://mercadolivre.com.br/2", cupom:"ARQSF10", desconto:"10%", badge:"",
      descricao:"Elimina gordura e odor sem reforma pesada. Exigência da vigilância sanitária que vira argumento de venda.", destaque:false },
    { nome:"Câmera Intelbras iM7", categorias:["Operacional"], categoria:"Operacional",
      loja:"Mercado Livre", link:"https://mercadolivre.com.br/3", cupom:"", desconto:"", badge:"Top Pick",
      descricao:"Câmera visível reduz furto e aumenta percepção de segurança. Cliente seguro compra mais.", destaque:false },
    { nome:"Letreiro LED Fachada", categorias:["Iluminação"], categoria:"Iluminação",
      loja:"Mercado Livre", link:"https://mercadolivre.com.br/4", cupom:"", desconto:"", badge:"",
      descricao:"Fachada que se lê de longe vende antes do cliente atravessar a rua.", destaque:false },
    { nome:"Bancada Inox 110cm", categorias:["Alimentação"], categoria:"Alimentação",
      loja:"Metalfrio", link:"https://metalfrio.com.br/1", cupom:"INOX20", desconto:"20%", badge:"",
      descricao:"Inox = higiene visual. Em alimentação é o sinal que o cliente procura antes de pedir.", destaque:false },
  ].map((r,i) => ({
    id:"mock-"+i, catIds:[], fotoUrls:[], imagens:[], imagem:null, status:"Publicado",
    // review mock: nos 3 primeiros para testar card/modal com e sem review
    nota: i<3 ? [9.1, 8.8, 9.7][i] : null,
    pontos: i<3 ? ["Indicado para ambientes internos", "Exige fixação em parede de alvenaria", "Acabamento sensível a produtos abrasivos"] : [],
    review: i<3 ? "Costumo utilizar esse tipo de peça em projetos de loja porque resolve exposição vertical sem obra. O acabamento segura bem o uso diário e a instalação é simples." : "",
    valeapena: i<3 ? "Sim. É uma excelente opção pra quem quer expor mais produto por metro quadrado sem investir em mobiliário caro." : "",
    // showroom mock: Tok&Stok nos itens 0,2,4 — mas 4 tem checkbox desligado (não aparece)
    showroom: [0,2,4].includes(i) ? "Tok&Stok" : (i===1 ? "Leroy Merlin" : ""),
    showroomOk: [0,2].includes(i) || i===1,  // item 4 (Tok&Stok) fica de fora
    showroomCor: [0,1,2,4].includes(i) ? (i===1 ? "#78BE20" : "#EE7D2C") : "",
    showroomManifesto: i===0 ? "A parceria com a Tok&Stok existe porque poucos entendem que mobiliário residencial bem escolhido resolve varejo comercial pequeno — e essa é a única loja no Brasil que trata cada peça como decisão de design, não só de estoque." : (i===1 ? "O Leroy Merlin entrou pra essa curadoria por um motivo simples: quando o lojista precisa transformar espaço sem obra, é lá que a solução chega no dia seguinte." : ""),
    showroomLogoUrl: null,
    showroomBannerUrl: null,
    ...r, link: cleanUrl(r.link)
  }));
}

async function main() {
  console.log(MOCK ? "Modo MOCK\n" : "Lendo do Notion...\n");
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(IMG_DIR, { recursive: true });

  const rows = MOCK ? mockRows() : await fetchFromNotion();
  console.log(`${rows.length} produtos publicados.`);

  const produtos = [];
  for (const r of rows) {
    if (!r.nome) { console.warn("  ! Sem nome, pulando."); continue; }
    const imagens = [];
    if (r.fotoUrls?.length) {
      process.stdout.write(`  · ${r.nome} (${r.fotoUrls.length} foto(s)) ... `);
      for (let fi = 0; fi < r.fotoUrls.length; fi++) {
        const img = await downloadImage(r.fotoUrls[fi], r.id + "-" + fi);
        if (img) imagens.push(img);
      }
      console.log(`${imagens.length} ok`);
    }
    const imagem = imagens[0] || null;
    produtos.push({
      id:r.id, nome:r.nome, categorias:r.categorias, categoria:r.categoria,
      descricao:r.descricao, loja:r.loja, link:r.link,
      cupom:r.cupom, desconto:r.desconto, badge:r.badge,
      nota:r.nota??null, pontos:r.pontos||[], review:r.review||"", valeapena:r.valeapena||"",
      showroom:r.showroom||"", showroomOk:!!r.showroomOk,
      showroomCor:r.showroomCor||"", showroomManifesto:r.showroomManifesto||"",
      showroomLogoUrl:r.showroomLogoUrl||null, showroomBannerUrl:r.showroomBannerUrl||null,
      destaque:r.destaque, imagem, imagens
    });
  }

  const categorias = [];
  for (const p of produtos)
    if (!categorias.includes(p.categoria)) categorias.push(p.categoria);

  // CNAME para domínio customizado (lê de variável de ambiente, opcional)
  if (process.env.CNAME_DOMAIN) {
    await fs.writeFile(path.join(DIST, "CNAME"), process.env.CNAME_DOMAIN.trim());
    console.log(`CNAME: ${process.env.CNAME_DOMAIN.trim()}`);
  }

  const data = { generatedAt: new Date().toISOString(), total: produtos.length, categorias, produtos };
  await fs.writeFile(path.join(DIST, "products.json"), JSON.stringify(data, null, 2));
  await fs.copyFile("index.html", path.join(DIST, "index.html"));
  await fs.writeFile(path.join(DIST, ".nojekyll"), "");

  // ---- Páginas de Showroom (uma por showroom selecionado E com "Disponível Showroom" marcado) ----
  const showrooms = {};
  for (const p of produtos) {
    if (!p.showroom || !p.showroomOk) continue; // precisa ter showroom E checkbox marcado
    if (!showrooms[p.showroom]) showrooms[p.showroom] = [];
    showrooms[p.showroom].push(p);
  }
  const showroomsMeta = [];
  for (const [nome, prods] of Object.entries(showrooms)) {
    const slug = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
    const dir = path.join(DIST, "parceiros", slug);
    await fs.mkdir(dir, { recursive: true });

    // Pega assets do 1º produto que tiver preenchido (cor/manifesto/logo/banner são do showroom, não do produto)
    const findFirst = (key) => { for (const p of prods) if (p[key]) return p[key]; return null; };
    const cor = findFirst("showroomCor") || "";
    const manifesto = findFirst("showroomManifesto") || "";
    const logoUrl = findFirst("showroomLogoUrl");
    const bannerUrl = findFirst("showroomBannerUrl");

    // Baixa logo e banner (URLs do Notion expiram)
    let logoLocal = null, bannerLocal = null;
    if (logoUrl) {
      logoLocal = await downloadImage(logoUrl, `showroom-${slug}-logo`);
      if (logoLocal) {
        // move da /dist/images pra /dist/parceiros/{slug}/logo.ext
        const from = path.join(DIST, logoLocal);
        const ext = path.extname(logoLocal);
        const to = path.join(dir, `logo${ext}`);
        await fs.rename(from, to);
        logoLocal = `logo${ext}`;
      }
    }
    if (bannerUrl) {
      bannerLocal = await downloadImage(bannerUrl, `showroom-${slug}-banner`);
      if (bannerLocal) {
        const from = path.join(DIST, bannerLocal);
        const ext = path.extname(bannerLocal);
        const to = path.join(dir, `banner${ext}`);
        await fs.rename(from, to);
        bannerLocal = `banner${ext}`;
      }
    }

    const meta = {
      nome, slug, total: prods.length,
      cor, manifesto,
      logo: logoLocal,
      banner: bannerLocal,
      produtos: prods,
    };
    await fs.writeFile(path.join(dir, "products.json"), JSON.stringify(meta, null, 2));
    await fs.copyFile("parceiro.html", path.join(dir, "index.html"));
    showroomsMeta.push({ nome, slug, total: prods.length, cor });
    console.log(`  Showroom: ${nome} (${prods.length} produtos${cor?`, cor ${cor}`:''}${logoLocal?', logo ok':''}${bannerLocal?', banner ok':''})`);
  }
  await fs.writeFile(path.join(DIST, "showrooms.json"), JSON.stringify(showroomsMeta, null, 2));

  console.log(`\nPronto. ${produtos.length} produtos, ${categorias.length} categorias, ${showroomsMeta.length} showrooms -> /dist`);
}

main().catch((e) => { console.error("\nERRO:", e.message); process.exit(1); });
