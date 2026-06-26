// ============================================================
//  arq.semfiltro — Robô de build
//  Lê o banco do Notion, baixa as fotos, e monta o site em /dist
//  Você NUNCA precisa editar este arquivo.
// ============================================================

import { Client } from "@notionhq/client";
import { promises as fs } from "fs";
import path from "path";

const MOCK = process.env.MOCK === "1";

// ---- Nomes EXATOS das colunas no seu Notion ----
const COL = {
  nome: "Nome",
  foto: "Foto",
  destaque: "Destaque",
  categoria: "Categoria",
  link: "Link",            // link de afiliado (o "Link Original" é ignorado de propósito)
  loja: "Loja",
  status: "Status",
  descricao: "Descrição",
  cupom: "CUPOM",
};
const STATUS_PUBLICADO = "Publicado";

const DIST = "dist";
const IMG_DIR = path.join(DIST, "images");

// ------------------------------------------------------------
// Helpers para ler as propriedades do Notion sem quebrar
// ------------------------------------------------------------
const txt = (rich) => (rich || []).map((r) => r.plain_text).join("").trim();

function readProps(props) {
  const p = (name) => props[name];
  const title = p(COL.nome)?.title;
  const cat = p(COL.categoria)?.select;
  const loja = p(COL.loja)?.select;
  const status = p(COL.status)?.status;
  const link = p(COL.link)?.url;
  const cupom = p(COL.cupom)?.rich_text;
  const desc = p(COL.descricao)?.rich_text;
  const destaque = p(COL.destaque)?.checkbox;
  const fotoFiles = p(COL.foto)?.files || [];

  let fotoUrl = null;
  if (fotoFiles.length) {
    const f = fotoFiles[0];
    fotoUrl = f.type === "external" ? f.external?.url : f.file?.url;
  }

  return {
    nome: title ? txt(title) : "",
    categoria: cat?.name || "Sem categoria",
    loja: loja?.name || "",
    status: status?.name || "",
    link: link || "",
    cupom: cupom ? txt(cupom) : "",
    descricao: desc ? txt(desc) : "",
    destaque: !!destaque,
    fotoUrl,
  };
}

// ------------------------------------------------------------
// Download de imagem (resolve o problema do link que expira)
// ------------------------------------------------------------
function extFromUrl(url, contentType) {
  try {
    const clean = new URL(url).pathname.toLowerCase();
    const m = clean.match(/\.(jpe?g|png|webp|gif|avif)$/);
    if (m) return m[0];
  } catch (_) {}
  const map = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
    "image/gif": ".gif", "image/avif": ".avif",
  };
  return map[contentType] || ".jpg";
}

async function downloadImage(url, id) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const ct = res.headers.get("content-type") || "";
    const ext = extFromUrl(url, ct);
    const fileName = id.replace(/-/g, "") + ext;
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(path.join(IMG_DIR, fileName), buf);
    return "images/" + fileName;
  } catch (e) {
    console.warn("  ! Falha ao baixar foto:", e.message);
    return null;
  }
}

// ------------------------------------------------------------
// Busca no Notion (com paginação) — só Status = Publicado
// ------------------------------------------------------------
async function fetchFromNotion() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!process.env.NOTION_TOKEN || !databaseId) {
    throw new Error("Faltam NOTION_TOKEN e/ou NOTION_DATABASE_ID nas variáveis de ambiente.");
  }

  const rows = [];
  let cursor = undefined;
  do {
    const resp = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      filter: { property: COL.status, status: { equals: STATUS_PUBLICADO } },
    });
    for (const page of resp.results) {
      rows.push({ id: page.id, ...readProps(page.properties) });
    }
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  return rows;
}

// ------------------------------------------------------------
// Dados de mentira (para testar o robô sem o Notion)
// ------------------------------------------------------------
function mockRows() {
  const base = [
    ["Cafeteira Espresso Saeco", "Equipamentos", "Saeco Shop", "Máquina que entrega café de cafeteria no balcão. Padroniza o sabor e tira a desculpa do 'tá ruim hoje'.", "CASONA10"],
    ["Moedor de grãos profissional", "Equipamentos", "Koa", "Café moído na hora vende o dobro de percepção. O cliente sente no aroma antes de provar.", ""],
    ["Freezer expositor vertical", "Refrigeração", "Metalfrio", "Produto que aparece, vende. Freezer de vidro na altura certa transforma estoque em vitrine.", ""],
    ["Balcão refrigerado de toppings", "Refrigeração", "Mercado Livre", "Toppings à vista = ticket maior. O olho pede o que a boca nem sabia que queria.", "ARQ15"],
    ["Display de calçada A-frame", "Comunicação Visual", "Mercado Livre", "O vendedor mais barato da loja fica na calçada. Promo do dia converte quem ia passar reto.", ""],
    ["Letreiro luminoso LED fachada", "Comunicação Visual", "Mercado Livre", "Fachada que se lê de longe vende antes do cliente atravessar a rua.", ""],
  ];
  return base.map(([nome, categoria, loja, descricao, cupom], i) => ({
    id: "mock-id-000000000000000000000" + i,
    nome, categoria, loja, descricao, cupom,
    link: "https://exemplo.com/afiliado/" + i,
    status: STATUS_PUBLICADO,
    destaque: i < 2,
    fotoUrl: null, // sem foto no mock -> usa placeholder
  }));
}

// ------------------------------------------------------------
// Monta o dist/
// ------------------------------------------------------------
async function main() {
  console.log(MOCK ? "Rodando em modo MOCK (sem Notion)\n" : "Lendo do Notion...\n");

  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(IMG_DIR, { recursive: true });

  const rows = MOCK ? mockRows() : await fetchFromNotion();
  console.log(`Encontrados ${rows.length} produtos publicados.`);

  const produtos = [];
  for (const r of rows) {
    if (!r.nome) { console.warn("  ! Produto sem nome, pulando."); continue; }
    let imagem = null;
    if (r.fotoUrl) {
      process.stdout.write(`  · ${r.nome} ... `);
      imagem = await downloadImage(r.fotoUrl, r.id);
      console.log(imagem ? "foto ok" : "sem foto");
    }
    produtos.push({
      id: r.id,
      nome: r.nome,
      categoria: r.categoria,
      descricao: r.descricao,
      loja: r.loja,
      link: r.link,
      cupom: r.cupom,
      destaque: r.destaque,
      imagem,
    });
  }

  // ordem das categorias = ordem em que aparecem (controle pela ordenação do Notion)
  const categorias = [];
  for (const p of produtos) {
    if (!categorias.includes(p.categoria)) categorias.push(p.categoria);
  }

  const data = {
    generatedAt: new Date().toISOString(),
    total: produtos.length,
    categorias,
    produtos,
  };

  await fs.writeFile(path.join(DIST, "products.json"), JSON.stringify(data, null, 2));
  await fs.copyFile("index.html", path.join(DIST, "index.html"));
  // arquivo vazio que impede o GitHub Pages de processar com Jekyll
  await fs.writeFile(path.join(DIST, ".nojekyll"), "");

  console.log(`\nPronto. ${produtos.length} produtos, ${categorias.length} categorias -> /dist`);
}

main().catch((e) => { console.error("\nERRO:", e.message); process.exit(1); });
