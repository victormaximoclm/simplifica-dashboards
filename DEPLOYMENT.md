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

## Armazenamento de Documentos

> **⚠️ OBRIGATÓRIO NO EASYPANEL:** crie um *Volume/Mount* persistente apontando para **`/app/storage`** no serviço da app.
> **Sem esse mount, todos os arquivos enviados no módulo Documentos são perdidos a cada redeploy** (o banco continua
> listando os arquivos, mas o download passa a falhar).

Os arquivos do módulo Documentos são gravados em disco em `STORAGE_DIR` (no container: `/app/storage`, já definido no `Dockerfile`).

- **Docker Compose:** o volume nomeado `documents` é montado em `/app/storage`. Não remova esse volume (`docker compose down -v` apaga os arquivos).
- `DOCUMENTS_MAX_FILE_SIZE_MB` (padrão 25, teto 50, MB inteiros) define o tamanho máximo por arquivo. O teto vem de `experimental.proxyClientMaxBodySize` (`55mb`) no `next.config.mjs`, que vale para **todas** as rotas: aumentá-lo aumenta o corpo aceito em toda a API. Se houver proxy reverso na frente (Nginx etc.), ajuste também o limite de corpo dele (ex.: `client_max_body_size 30m`).

### Registro do módulo no banco (`modules.js`)

O script `src/prisma/modules.js` cadastra os módulos (`dashboards`, `forms`, `users`, `documents`) na tabela `Module`. Ele **não roda no seed nem no `docker-entrypoint.sh`**: o módulo `documents` só passa a constar no banco depois de executá-lo. É idempotente (pode rodar mais de uma vez). Em produção, dentro do container da app:

```bash
docker compose exec app node src/prisma/modules.js
```

(No EasyPanel, rode `node src/prisma/modules.js` pelo console do serviço. A `DATABASE_URL` já vem do ambiente do container.)

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
