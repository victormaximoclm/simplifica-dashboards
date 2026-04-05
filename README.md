# 🚀 SaaS Dashboards

SaaS para gerenciamento seguro de dashboards (ex: Power BI) com controle de acesso por usuário e workspace.

## 💡 Problema

Empresas que utilizam dashboards enfrentam dificuldades como:
- Links públicos inseguros (risco de vazamento de dados - LGPD)
- Falta de controle de acesso por usuário
- Dificuldade em organizar múltiplos dashboards por equipe

## ✅ Solução

O SaaS Dashboards resolve isso permitindo:

- 🔐 Autenticação de usuários (login seguro)
- 🧑‍🤝‍🧑 Controle de acesso por cargos (RBAC)
- 🏢 Multi-workspaces (equipes separadas)
- 📊 Integração com dashboards externos (ex: Power BI via iframe/API)
- 📧 Sistema de envio de emails (SMTP)

## 🖼️ Preview


## Stack

- **Frontend/Backend:** Next.js 14+ (App Router)
- **UI:** Material UI (Vuexy template)
- **Banco de dados:** PostgreSQL 16
- **ORM:** Prisma
- **Autenticação:** NextAuth.js
- **Containerização:** Docker + Docker Compose

---

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) >= 24
- [Docker Compose](https://docs.docker.com/compose/install/) >= 2.20
- (Apenas para desenvolvimento local sem Docker) Node.js >= 20 e pnpm >= 9

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
