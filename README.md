# arq.semfiltro — Catálogo de afiliados

Site de catálogo gerado automaticamente a partir do seu Notion.
Você cadastra no Notion → aperta um botão → site no ar. Nunca precisa mexer em código.

---

## Como funciona

```
NOTION (você cadastra)  →  ROBÔ (GitHub Actions)  →  SITE (GitHub Pages)
```

O robô lê só os produtos com **Status = Publicado**, baixa as fotos, e publica o site.

---

## Instalação (uma vez só, ~10 minutos)

### Passo 1 — Pegar o ID do banco do Notion

1. Abra seu banco "Meus Itens" no Notion **como página inteira** (não inline).
2. Copie o link da página (botão Share → Copy link, ou da barra de endereço).
3. O link é tipo:
   `https://www.notion.so/.../`**`230a1b2c3d4e5f6...`**`?v=...`
   O código de **32 caracteres** antes do `?v=` é o **DATABASE_ID**. Guarde.

### Passo 2 — Confirmar a conexão no banco

No banco "Meus Itens": menu **···** (canto sup. direito) → **Connections** →
adicione **"ArqSemFiltro Curadoria"**. (Sem isso o robô tem a chave mas não enxerga a tabela.)

### Passo 3 — Criar o repositório no GitHub

1. github.com → **New repository** → nome ex: `arqsemfiltro-catalogo` → **Public** → Create.
2. Faça upload de TODOS estes arquivos (mantendo a estrutura de pastas):
   - `build.js`
   - `index.html`
   - `package.json`
   - `.github/workflows/build.yml`  ← a pasta `.github/workflows` precisa existir
   - `README.md`
   > NÃO suba a pasta `node_modules` nem `dist` (são gerados sozinhos).

### Passo 4 — Guardar as chaves no cofre (Secrets)

No repositório → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
Crie **dois** segredos:

| Name | Secret (valor) |
|------|----------------|
| `NOTION_TOKEN` | o token `ntn_...` que você gerou na conexão |
| `NOTION_DATABASE_ID` | o ID de 32 caracteres do Passo 1 |

> É aqui que a chave fica guardada e criptografada. Ninguém vê, nem nas Actions.

### Passo 5 — Ligar o GitHub Pages

Repositório → **Settings** → **Pages** → em **Source**, selecione **GitHub Actions**.

### Passo 6 — Rodar pela primeira vez

Repositório → aba **Actions** → workflow **"Atualizar site"** → botão **Run workflow** → **Run**.
Aguarde ~1 minuto. Quando ficar verde, seu site está no ar.
O endereço aparece em **Settings → Pages** (tipo `https://SEUUSUARIO.github.io/arqsemfiltro-catalogo`).

### Passo 7 — Colar no Linktree

Pegue o endereço do site e coloque no seu Linktree. Pronto.

---

## Dia a dia (depois de instalado)

1. Cadastra produto novo no Notion (Nome, Categoria, Foto, Link de afiliado, Loja, Descrição, Cupom).
2. Muda o **Status** para **Publicado**.
3. Vai em **Actions → Atualizar site → Run workflow**.
4. Em ~1 min o site atualiza sozinho.

> O robô também roda sozinho todo dia de manhã. Mas o botão é pra quando você quiser na hora.

---

## Colunas do Notion que o robô usa

| Coluna | Papel |
|--------|-------|
| **Nome** | Título do card |
| **Foto** | Imagem (baixada e rehospedada) |
| **Destaque** | Vai pro topo do site |
| **Categoria** | Agrupa em seções |
| **Link** | Botão "Ver na loja" (seu link de afiliado) |
| **Loja** | Tag no card |
| **Status** | Só "Publicado" aparece |
| **Descrição** | Texto do card |
| **CUPOM** | Selo de cupom no card |
| Link Original | ignorado de propósito |
| Preço | ignorado (não aparece no site) |

---

## Problemas comuns

- **Site vazio / "Catálogo vazio"** → nenhum produto com Status = `Publicado`, ou a conexão não foi adicionada no banco (Passo 2).
- **Action falha com erro de token** → confira os Secrets (Passo 4); o nome tem que ser exatamente `NOTION_TOKEN` e `NOTION_DATABASE_ID`.
- **Produto sem foto** → card mostra "[ sem foto ]"; suba uma imagem na coluna Foto.
