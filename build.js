// ============================================================
//  arq.semfiltro — Robô de build v2
// ============================================================

import { Client } from "@notionhq/client";
import { promises as fs } from "fs";
import path from "path";

const MOCK = process.env.MOCK === "1";

const COL = {
  nome:      "Nome",
  foto:      "Foto",
  destaque:  "Destaque",
  categoria: "Categoria",   // multi_select
  link:      "Link",
  loja:      "Loja",        // select
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

  const title      = p(COL.nome)?.title;
  // ← CORREÇÃO: categoria agora é multi_select (array de objetos)
  const cats       = p(COL.categoria)?.multi_select || [];
  const loja       = p(COL.loja)?.select;
  const status     = p(COL.status)?.status;
  const link       = p(COL.link)?.url;
  const cupom      = p(COL.cupom)?.rich_text;
  const desc       = p(COL.descricao)?.rich_text;
  const destaque   = p(COL.destaque)?.checkbox;
  const fotoFiles  = p(COL.foto)?.files || [];

  let fotoUrl = null;
  if (fotoFiles.length) {
    const f = fotoFiles[0];
    fotoUrl = f.type === "external" ? f.external?.url : f.file?.url;
  }

  // multi_select → array de strings; produto aparece na PRIMEIRA categoria
  // mas guardamos todas pra uso futuro
  const categorias = cats.map(c => c.name);

  return {
    nome:       title ? txt(title) : "",
    categorias,                                    // array ["Cat A", "Cat B"]
    categoria:  categorias[0] || "Sem categoria",  // agrupa pela primeira
    loja:       loja?.name || "",
    status:     status?.name || "",
    link:       link || "",
    cupom:      cupom ? txt(cupom) : "",
    descricao:  desc ? txt(desc) : "",
    destaque:   !!destaque,
    fotoUrl,
  };
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

  return rows;
}

function mockRows() {
  const base = [
    ["Coifa Industrial", ["Equipamentos","Alimentação"], "Mercado Livre", "Elimina gordura e odor sem reforma pesada. Exigência da vigilância sanitária que vira argumento de venda.", "ARQSF10", true],
    ["Poltrona Snaky Laranja", ["Mobiliário"], "Tokstok", "Uma peça que vira Instagram espontâneo do cliente. Marketing que você não paga.", "", true],
    ["KIT 200 Cabides Veludo", ["Mobiliário","Comunicação Visual"], "Mercado Livre", "Cabide de veludo não cai, não deforma, não envergonha. Detalhe que eleva a percepção do produto.", "CASA15", true],
    ["Câmera Intelbras iM7", ["Tecnologia"], "Mercado Livre", "Câmera visível reduz furto e aumenta percepção de segurança. Cliente seguro compra mais.", "", false],
    ["Bancada Inox 110cm", ["Equipamentos"], "Mercado Livre", "Inox = higiene visual. Em alimentação, é o sinal que o cliente procura antes de pedir.", "", false],
  ];
  return base.map(([nome, categorias, loja, descricao, cupom, destaque], i) => ({
    id: "mock-id-000" + i,
    nome, categorias, categoria: categorias[0], loja, descricao, cupom,
    link: "https://exemplo.com/" + i,
    status: STATUS_PUBLICADO, destaque: !!destaque, fotoUrl: null, imagem: null,
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
    let imagem = null;
    if (r.fotoUrl) {
      process.stdout.write(`  · ${r.nome} ... `);
      imagem = await downloadImage(r.fotoUrl, r.id);
      console.log(imagem ? "ok" : "sem foto");
    }
    produtos.push({ id:r.id, nome:r.nome, categorias:r.categorias, categoria:r.categoria,
                    descricao:r.descricao, loja:r.loja, link:r.link, cupom:r.cupom,
                    destaque:r.destaque, imagem });
  }

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
