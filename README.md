# 🚀 SaaS Dashboards

SaaS para gerenciamento seguro de dashboards (ex: Power BI) com controle de acesso por usuário e workspace.

## 💡 Problema

Empresas que utilizam dashboards, ou desenvolvem para clientes enfrentam dificuldades como:

- Falta de controle de acesso por usuário
- Dificuldade em organizar múltiplos dashboards por equipe e por empresa cliente

## ✅ Solução

O SaaS Dashboards resolve isso permitindo:

- 🔐 Autenticação de usuários (login seguro)
- 🧑‍🤝‍🧑 Controle de acesso por cargos (RBAC)
- 🏢 Multi-workspaces (equipes separadas)
- 📊 Integração com dashboards externos (ex: Power BI via iframe)
- 📧 Sistema de envio de emails (SMTP)
- 🧾 Auditoria (dois painéis): **Acesso** e **Ações Críticas** (para Super Admin / Sub Admin)
- 🧱 Camada de segurança para embed

## 🖼️ Preview

Em breve.

## Stack

- **Frontend/Backend:** Next.js 14+ (App Router)
- **UI:** Material UI (Vuexy template)
- **Banco de dados:** PostgreSQL 16
- **ORM:** Prisma
- **Autenticação:** NextAuth.js
- **Containerização:** Docker + Docker Compose
- **Observabilidade:** logs estruturados com `requestId` + Error Tracking interno (banco)
- **Rate limit:** Redis (com fallback em memória para dev)

---

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) >= 24
- [Docker Compose](https://docs.docker.com/compose/install/) >= 2.20
- (Apenas para desenvolvimento local sem Docker) Node.js >= 20 e pnpm >= 9

---

## Auditoria (Audit Logs)

O sistema possui **dois audits** (visões separadas), pensados para auditoria rápida e sem ruído.

- **Audit de Acesso**: logins e acessos relevantes.
- **Audit de Ações Críticas**: ações administrativas em usuários e workspaces (ex.: criar/editar/deletar, convites e reset de senha).

Ambos suportam:

- Filtro por **Workspace**
- Filtro por **Usuário**
- Filtro por **Período**
- Coluna com **nome legível do recurso** (ex.: título do dashboard) para facilitar auditoria

> Observação: a auditoria é focada em ações com intenção do usuário (não é analytics).

---

## Power BI (Embed)

Este projeto funciona bem com dashboards do tipo **“Publicar na Web”** (públicos por natureza). O objetivo aqui é:

- **Não expor** o link do Power BI no frontend/código-fonte
- **Obrigar** autenticação e permissão antes de abrir o dashboard dentro do SaaS

Fluxo simplificado:

- Frontend usa `<iframe src="/api/embed/dashboard/:id" />`
- Backend valida sessão + RBAC e responde com um redirect para o Power BI (sem entregar o `embedUrl` para o frontend)

---

## Deploy em Produção (Docker)

### 1. Clone o repositório

```bash
git clone <url-do-repositorio> simplifica-dashboards
cd simplifica-dashboards
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` e preencha **todas** as variáveis. No mínimo:

| Variável              | Descrição                                                |
| --------------------- | -------------------------------------------------------- |
| `DB_USER`             | Usuário do PostgreSQL                                    |
| `DB_PASSWORD`         | **Senha forte** do PostgreSQL                            |
| `DB_NAME`             | Nome do banco                                            |
| `NEXTAUTH_SECRET`     | Token secreto (gere com `openssl rand -base64 32`)       |
| `NEXTAUTH_URL`        | URL pública da aplicação + `/api/auth`                   |
| `NEXT_PUBLIC_APP_URL` | URL pública da aplicação (ex: `https://app.exemplo.com`) |
| `NEXT_PUBLIC_API_URL` | URL pública + `/api`                                     |
| `API_URL`             | Igual a `NEXT_PUBLIC_API_URL`                            |
| `REDIS_URL`           | Redis para rate limit (recomendado em produção)          |
| `SMTP_HOST`           | Servidor SMTP                                            |
| `SMTP_PORT`           | Porta SMTP (587 para TLS, 465 para SSL)                  |
| `SMTP_USER`           | Usuário SMTP                                             |
| `SMTP_PASS`           | Senha SMTP                                               |
| `SMTP_FROM`           | Remetente dos emails                                     |

### 3. Suba os serviços

```bash
docker compose up -d --build
```

Isso irá:

1. Criar e iniciar o PostgreSQL com volume persistente
2. Buildar a imagem da aplicação Next.js
3. Aplicar o schema do banco automaticamente via `prisma db push`
4. Iniciar a aplicação na porta `3000`

### 4. Verifique os logs

```bash
docker compose logs -f app
```

### 5. Acesse

Abra `http://seu-servidor:3000` no navegador.

---

## Desenvolvimento Local

### Opção A: Docker completo

```bash
# Sobe todos os serviços (app + postgres + mailpit para emails de teste)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

### Opção B: Apenas serviços auxiliares via Docker

```bash
# Sobe PostgreSQL e Mailpit
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres mailpit

# Instale dependências
pnpm install

# Aplique o schema no banco
npx prisma db push --schema src/prisma/schema.prisma

# (Opcional) Popule dados iniciais
node src/prisma/seed.js

# (Opcional) Seed minimo para QA
node src/prisma/seed.js --qa

# Inicie o servidor de desenvolvimento
pnpm dev
```

A aplicação estará em `http://localhost:3000`.
Mailpit (inbox de teste) estará em `http://localhost:8025`.

---

## Variáveis de Ambiente — Referência Completa

Veja o arquivo [`.env.example`](.env.example) para a lista completa com descrições.
