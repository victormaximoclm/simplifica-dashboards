# Simpla Insights

Plataforma SaaS para **gestão segura de dashboards** (ex.: Power BI) e **formulários dinâmicos**, com autenticação, workspaces isolados e controle de acesso por perfil (RBAC).

Repositório: `simplifica-dashboard` · Interface: **Simpla Insights**

---

## Índice

- [Visão geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Requisitos](#requisitos)
- [Início rápido (Docker)](#início-rápido-docker)
- [Desenvolvimento local](#desenvolvimento-local)
- [Primeiro acesso (setup)](#primeiro-acesso-setup)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Power BI (embed seguro)](#power-bi-embed-seguro)
- [Formulários dinâmicos](#formulários-dinâmicos)
- [Auditoria](#auditoria)
- [Deploy e saúde da aplicação](#deploy-e-saúde-da-aplicação)
- [Scripts úteis](#scripts-úteis)

---

## Visão geral

O Simpla Insights centraliza painéis externos e fluxos de coleta de dados para equipes que precisam:

- Exibir dashboards **sem expor URLs de embed** no front-end
- Separar dados e usuários por **workspace**
- Auditar logins e ações administrativas sensíveis
- Publicar **formulários** com links temporários e integração a automações (webhooks / n8n)

---

## Funcionalidades

| Área | Descrição |
|------|-----------|
| **Autenticação** | Login por credenciais (NextAuth); OAuth Google opcional |
| **RBAC** | Papéis globais (`superAdmin`, `subAdmin`, `admin`, `user`) + **funções customizadas** por workspace |
| **Workspaces** | Multi-tenant: usuários, dashboards e formulários por equipe |
| **Dashboards** | Cadastro de iframes (Power BI etc.) com proxy de embed autenticado |
| **Formulários** | Builder visual, links públicos com expiração, envio para webhook |
| **Integrações** | ClickUp (OAuth por workspace), datasources via webhook/n8n |
| **E-mail** | Convites, reset de senha e notificações via SMTP |
| **Auditoria** | Dois painéis: acesso (logins) e ações críticas (admin) |
| **Observabilidade** | Logs estruturados com `requestId`; eventos de erro persistidos no banco |
| **Rate limit** | Redis em produção; fallback em memória no desenvolvimento |

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| App | [Next.js](https://nextjs.org/) 16 (App Router) + React 19 |
| UI | MUI 7, Tailwind CSS 4 |
| Banco | PostgreSQL 16 |
| ORM | Prisma 6 |
| Auth | NextAuth.js 4 |
| Cache / rate limit | Redis 7 |
| E-mail (dev) | [Mailpit](https://github.com/axllent/mailpit) |
| Runtime | Node.js 20+, [pnpm](https://pnpm.io/) 9 |
| Deploy | Docker + Docker Compose |

Base visual derivada do template MUI Next.js Admin; a lógica de negócio (workspaces, embed, forms, audit) é própria do projeto.

---

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) ≥ 24 e [Docker Compose](https://docs.docker.com/compose/install/) ≥ 2.20 **ou**
- Node.js ≥ 20, pnpm ≥ 9 e PostgreSQL 16 (desenvolvimento sem container da app)

---

## Início rápido (Docker)

### 1. Clone e entre no diretório

```bash
git clone https://github.com/SEU_USUARIO/simplifica-dashboard.git
cd simplifica-dashboard
```

### 2. Configure o ambiente

```bash
cp .env.example .env
```

Edite `.env` e defina, no mínimo: `DATABASE_URL`, `DB_PASSWORD`, `NEXTAUTH_SECRET`, URLs públicas (`NEXT_PUBLIC_*`, `NEXTAUTH_URL`, `API_URL`) e SMTP (se for usar e-mail).

> **Importante:** não use os valores padrão do `docker-compose.yml` (`simplifica123`, `troque_este_segredo_em_producao`) em produção.

### 3. Suba os serviços

```bash
docker compose up -d --build
```

Isso sobe **Redis**, **PostgreSQL** e a **app** (porta `3000`), aplica o schema com `prisma db push` no entrypoint e opcionalmente executa seed se `SEED_ON_START=true`.

### 4. Verifique

```bash
docker compose logs -f app
curl http://localhost:3000/api/health
```

Acesse `http://localhost:3000` e conclua o [setup inicial](#primeiro-acesso-setup).

---

## Desenvolvimento local

### Opção A — Tudo no Docker (recomendado)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Inclui **Mailpit** (SMTP `1025`, UI `http://localhost:8025`).

### Opção B — App no host, infra no Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis mailpit

pnpm install
npx prisma db push --schema src/prisma/schema.prisma

# Opcional: dados iniciais
node src/prisma/seed.js
node src/prisma/seed.js --qa

pnpm dev
```

- App: `http://localhost:3000`
- Postgres no host: porta `5433` (ver `DB_PORT_EXTERNAL` no `.env.example`)

---

## Primeiro acesso (setup)

Na primeira execução, sem usuários no banco, a aplicação exibe o fluxo de **criação do Super Admin** (`/api/setup`).

Depois do setup, use o login normal. Convites e reset de senha dependem de SMTP configurado.

---

## Variáveis de ambiente

Referência completa em [`.env.example`](.env.example). Resumo das principais:

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Conexão PostgreSQL (Prisma) |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Credenciais do serviço Postgres no Compose |
| `NEXTAUTH_SECRET` | Assinatura de sessão JWT (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | URL pública do site (sem `/api/auth`) |
| `NEXT_PUBLIC_APP_URL` | Origem pública (links em e-mail) |
| `NEXT_PUBLIC_API_URL` | Base `/api` para o browser |
| `API_URL` | URL que o servidor usa para chamar a própria API |
| `REDIS_URL` | Rate limit distribuído |
| `SMTP_*` | Envio de e-mails |
| `N8N_API_KEY` | (Opcional) Bearer para webhooks n8n em formulários |
| `CLICKUP_REDIRECT_URI` | (Opcional) Callback OAuth ClickUp |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | (Opcional) Login Google |

Credenciais ClickUp por workspace ficam no banco (`WorkspaceIntegration.configJson`), não no repositório.

---

## Power BI (embed seguro)

Indicado para relatórios **“Publicar na Web”** (públicos no Power BI). O objetivo é **não expor** a URL de embed no front-end e exigir sessão + permissão antes do redirect.

Fluxo:

1. O front usa `<iframe src="/api/embed/dashboard/:id" />`
2. A API valida sessão, workspace e RBAC
3. O servidor redireciona para o Power BI (URL armazenada apenas no banco)

---

## Formulários dinâmicos

- Builder com campos básicos e avançados (listas dinâmicas, busca por CPF, endereço, upload etc.)
- **Links públicos** com token, expiração e uso único (`/f/:token`)
- Envio para `webhookUrl` do formulário; datasources via **webhook/n8n** ou **ClickUp**
- Controle de quem preenche por cargo (ClickUp) ou função customizada

---

## Auditoria

Dois painéis separados (Super Admin / Sub Admin):

| Painel | Conteúdo |
|--------|----------|
| **Acesso** | Logins e eventos de acesso relevantes |
| **Ações críticas** | CRUD de usuários/workspaces, convites, reset de senha etc. |

Filtros: workspace, usuário e período. Focado em conformidade, não em analytics de produto.

---

## Deploy e saúde da aplicação

- **Health check:** `GET /api/health` → `200` com `{ "status": "ok", ... }`
- **Guia detalhado:** [DEPLOYMENT.md](DEPLOYMENT.md) (Docker, EasyPanel, variáveis de produção)
- **CI:** workflow em `.github/workflows/ci.yml` (build com Postgres de teste)

---

## Scripts úteis

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Servidor de desenvolvimento (Turbopack) |
| `pnpm build` | Build de produção |
| `pnpm start` | Servidor após build |
| `pnpm lint` | ESLint |
| `pnpm migrate` | `prisma migrate dev` (com `.env`) |
| `pnpm seed` | Seed via `src/prisma/seed.js` |

---

## Licença

Projeto **privado** (`"private": true` no `package.json`, licença `UNLICENSED`). Uso restrito conforme política do titular.
