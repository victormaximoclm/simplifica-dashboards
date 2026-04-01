# Simplifica Dashboards

Plataforma de gerenciamento de dashboards multi-workspace com controle de acesso baseado em cargos.

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

## Estrutura de Arquivos Relevantes

```
├── .env.example            # Template de variáveis de ambiente
├── Dockerfile              # Build multi-stage para produção
├── docker-compose.yml      # Produção: app + PostgreSQL
├── docker-compose.dev.yml  # Extensão para desenvolvimento (Mailpit)
├── docker-entrypoint.sh    # Entrypoint: migra banco + inicia app
├── next.config.mjs         # Configuração do Next.js
├── src/
│   ├── prisma/
│   │   ├── schema.prisma   # Schema do banco de dados
│   │   └── seed.js         # Script de seed (dados iniciais)
│   ├── libs/
│   │   ├── auth.js         # Configuração do NextAuth.js
│   │   └── mail.js         # Configuração de SMTP/email
│   └── ...
```

---

## Comandos Úteis

```bash
# Rebuildar apenas a aplicação
docker compose up -d --build app

# Ver logs em tempo real
docker compose logs -f app

# Parar todos os serviços
docker compose down

# Parar e remover volumes (CUIDADO: apaga dados do banco)
docker compose down -v

# Acessar o banco via psql
docker compose exec postgres psql -U simplifica -d simplifica

# Rodar migration manualmente dentro do container
docker compose exec app npx prisma db push --schema src/prisma/schema.prisma
```

---

## Variáveis de Ambiente — Referência Completa

Veja o arquivo [`.env.example`](.env.example) para a lista completa com descrições.
