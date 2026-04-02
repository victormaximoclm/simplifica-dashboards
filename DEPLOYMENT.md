# Implantação: local, Docker e EasyPanel

## Porta

- Aplicação Next.js: **3000** (interna ao container `PORT=3000`).
- PostgreSQL no compose: **5432** interno; no host costuma ser **5433** (`DB_PORT_EXTERNAL`).

## Health check

- **HTTP GET** `/api/health` → `200` e JSON `{ "status": "ok", ... }`.
- No EasyPanel, configure o health check para esse path na porta do serviço web.

## Variáveis obrigatórias (produção)

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL PostgreSQL (no Docker use host `postgres`, porta `5432`). |
| `NEXTAUTH_SECRET` | Segredo forte (ex.: `openssl rand -base64 32`). |
| `NEXTAUTH_URL` | URL pública do site (ex.: `https://app.exemplo.com`). |
| `API_URL` | Base da API para o servidor chamar a si mesmo (ex.: `https://app.exemplo.com/api`). |
| `NEXT_PUBLIC_APP_URL` | Mesma origem pública, sem barra final (e-mails e links). |
| `NEXT_PUBLIC_API_URL` | URL pública `/api` para o browser. |

SMTP e OAuth Google são opcionais conforme recursos usados.

## EasyPanel

1. Build: Dockerfile na raiz; contexto do repositório.
2. Variáveis: copiar de `.env.example` e preencher segredos.
3. Proxy reverso: encaminhar HTTPS para a porta do container **3000**.
4. Health: path `/api/health`, intervalo sugerido 30s.

## Docker Compose

```bash
cp .env.example .env
# Edite DATABASE_URL se for app só no host; dentro do compose use host postgres:5432

docker compose up -d --build
```

O entrypoint executa `prisma db push` e, se `SEED_ON_START=true`, o seed em modo produção (sem dados de teste).
