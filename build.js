// ============================================================
//  arq.semfiltro — Robô de build v3
//  Categoria = Relation (busca o nome das páginas relacionadas)
// ============================================================

import { Client } from "@notionhq/client";
import { promises as fs } from "fs";
import path from "path";

const MOCK = process.env.MOCK === "1";

const COL = {
  nome:      "Nome",
  foto:      "Foto",
  destaque:  "Destaque",
  categoria: "Categoria",   // Relation → busca nome das páginas
  link:      "Link",
  loja:      "Loja",
  status:    "Status",
  descricao: "Descrição",
  cupom:     "CUPOM",
};
const STATUS_PUBLICADO = "Publicado";
const DIST    = "dist";
const IMG_DIR = path.join(DIST, "images");

const txt = (rich) => (rich || []).map((r) => r.plain_text).join("").trim();

function readProps(props) {
  const p = (name) => props[name];

  const title     = p(COL.nome)?.title;
  // Relation → array de { id: "page-id" }
  const catRels   = p(COL.categoria)?.relation || [];
  const loja      = p(COL.loja)?.select;
  const status    = p(COL.status)?.status;
  const link      = p(COL.link)?.url;
  const cupom     = p(COL.cupom)?.rich_text;
  const desc      = p(COL.descricao)?.rich_text;
  const destaque  = p(COL.destaque)?.checkbox;
  const fotoFiles = p(COL.foto)?.files || [];

  // Coleta URLs de TODAS as fotos (não só a primeira)
  const fotoUrls = fotoFiles.map(f =>
    f.type === "external" ? f.external?.url : f.file?.url
  ).filter(Boolean);

  return {
    nome:      title ? txt(title) : "",
    catIds:    catRels.map(r => r.id),   // IDs que vamos resolver depois
    categorias: [],                       // preenchido após resolver IDs
    categoria:  "Sem categoria",          // preenchido após resolver IDs
    loja:      loja?.name || "",
    status:    status?.name || "",
    link:      link || "",
    cupom:     cupom ? txt(cupom) : "",
    descricao: desc ? txt(desc) : "",
    destaque:  !!destaque,
    fotoUrls,
  };
}

// Busca o nome de uma página pelo ID (para resolver a Relation)
const pageNameCache = new Map();
async function resolvePageName(notion, pageId) {
  if (pageNameCache.has(pageId)) return pageNameCache.get(pageId);
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    // Título pode estar em qualquer propriedade do tipo title
    const props = page.properties || {};
    const titleProp = Object.values(props).find(p => p.type === "title");
    const name = titleProp ? txt(titleProp.title) : "Sem categoria";
    pageNameCache.set(pageId, name);
    return name;
  } catch (e) {
    console.warn("  ! Não consegui resolver categoria ID:", pageId, e.message);
    return "Sem categoria";
  }
}

function extFromUrl(url, contentType) {
  try {
    const clean = new URL(url).pathname.toLowerCase();
    const m = clean.match(/\.(jpe?g|png|webp|gif|avif)$/);
    if (m) return m[0];
  } catch (_) {}
  const map = { "image/jpeg":".jpg","image/png":".png","image/webp":".webp","image/gif":".gif","image/avif":".avif" };
  return map[contentType] || ".jpg";
}

async function downloadImage(url, id) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const ct  = res.headers.get("content-type") || "";
    const ext = extFromUrl(url, ct);
    const fileName = id.replace(/-/g, "") + ext;
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

  // 1. Busca todos os produtos publicados
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

  // 2. Resolve os IDs de categoria para nomes (com cache — não bate na API repetido)
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
  const base = [
    ["Coifa Industrial",        ["Alimentação","Operacional"], "Mercado Livre", "Elimina gordura e odor sem reforma pesada. Exigência da vigilância sanitária que vira argumento de venda.", "ARQSF10", true],
    ["Poltrona Snaky Laranja",  ["Varejo","Decoração"],        "Tokstok",       "Uma peça que vira Instagram espontâneo do cliente. Marketing que você não paga.", "", true],
    ["KIT 200 Cabides Veludo",  ["Visual Merchandising"],      "Mercado Livre", "Cabide de veludo não cai, não deforma, não envergonha. Detalhe que eleva a percepção do produto.", "CASA15", true],
    ["Câmera Intelbras iM7",    ["Operacional"],               "Mercado Livre", "Câmera visível reduz furto e aumenta percepção de segurança. Cliente seguro compra mais.", "", false],
    ["Bancada Inox 110cm",      ["Alimentação"],               "Mercado Livre", "Inox = higiene visual. Em alimentação, é o sinal que o cliente procura antes de pedir.", "", false],
    ["Letreiro LED Fachada",    ["Iluminação","Varejo"],       "Mercado Livre", "Fachada que se lê de longe vende antes do cliente atravessar a rua.", "", false],
  ];
  return base.map(([nome, categorias, loja, descricao, cupom, destaque], i) => ({
    id: "mock-id-000" + i,
    nome, catIds: [], categorias, categoria: categorias[0],
    loja, descricao, cupom,
    link: "https://exemplo.com/" + i,
    status: STATUS_PUBLICADO, destaque: !!destaque,
    fotoUrls: [], imagens: [],
    // mock: simula múltiplas fotos via placeholder
    imagem: null,
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
    if (r.fotoUrls && r.fotoUrls.length) {
      process.stdout.write(`  · ${r.nome} (${r.fotoUrls.length} foto(s)) ... `);
      for (let fi = 0; fi < r.fotoUrls.length; fi++) {
        const img = await downloadImage(r.fotoUrls[fi], r.id + "-" + fi);
        if (img) imagens.push(img);
      }
      console.log(`${imagens.length} ok`);
    }
    // Compatibilidade: imagem = primeira foto (usada no banner de destaque)
    const imagem = imagens[0] || null;
    produtos.push({
      id:r.id, nome:r.nome, categorias:r.categorias, categoria:r.categoria,
      descricao:r.descricao, loja:r.loja, link:r.link, cupom:r.cupom,
      destaque:r.destaque, imagem, imagens
    });
  }

  // Ordem das categorias preserva a sequência em que aparecem nos produtos
  const categorias = [];
  for (const p of produtos)
    if (!categorias.includes(p.categoria)) categorias.push(p.categoria);

  const data = { generatedAt: new Date().toISOString(), total: produtos.length, categorias, produtos };
  await fs.writeFile(path.join(DIST, "products.json"), JSON.stringify(data, null, 2));
  await fs.copyFile("index.html", path.join(DIST, "index.html"));
  await fs.writeFile(path.join(DIST, ".nojekyll"), "");
  console.log(`\nPronto. ${produtos.length} produtos, ${categorias.length} categorias -> /dist`);
}

main().catch((e) => { console.error("\nERRO:", e.message); process.exit(1); });
