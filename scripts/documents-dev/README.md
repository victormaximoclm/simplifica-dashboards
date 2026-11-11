# Documentos: ambiente de desenvolvimento

Scripts **somente locais** para testar o módulo de Documentos. Eles se recusam a rodar com `NODE_ENV=production` ou contra banco/app que não sejam locais.

## Acesso

- URL: <http://localhost:3000/br/documents>
- Senha de todos os usuários de teste: `Mock@12345` (apenas ambiente local)

| Perfil | E-mail | Workspace | O que pode |
|---|---|---|---|
| superAdmin | `mock.superadmin@example.test` | todos | tudo |
| subAdmin | `mock.subadmin@example.test` | [MOCK] Alfa (vê Alfa e Beta; **não** vê o Privado) | criar, editar, excluir |
| admin | `mock.admin.alfa@example.test` | [MOCK] Alfa | ver e baixar |
| admin | `mock.admin.beta@example.test` | [MOCK] Beta | ver e baixar |
| user | `mock.user.alfa@example.test` | [MOCK] Alfa | ver e baixar |
| user (com função `[MOCK] Leitor Beta`) | `mock.user.beta@example.test` | [MOCK] Beta | ver e baixar |
| convidado | `mock.convidado@example.test` | convidado (view) do [MOCK] Privado | ver e baixar |

## Subir, parar e logs

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build   # inclui Mailpit
docker compose logs -f app
curl http://localhost:3000/api/health
docker compose stop        # para sem apagar nada
```

> Nunca use `docker compose down -v`: apaga o banco **e** o volume `documents` com os arquivos.

## Banco e módulo

```bash
docker compose exec app node src/prisma/modules.js            # registra o módulo "documents" (idempotente)
docker compose exec postgres psql -U simplifica simplifica     # psql
docker compose exec postgres psql -U simplifica simplifica -c 'SELECT key FROM "Module";'
npx dotenv -e .env -- npx prisma studio --schema src/prisma/schema.prisma
```

Conferir drift entre migrations e schema (usa um banco temporário e o apaga no fim):

```bash
docker compose exec postgres createdb -U simplifica shadow_check
npx dotenv -e .env -- npx prisma migrate diff --from-migrations src/prisma/migrations --to-schema-datamodel src/prisma/schema.prisma \
  --shadow-database-url "postgresql://simplifica:simplifica123@localhost:5433/shadow_check" --exit-code
docker compose exec postgres dropdb -U simplifica shadow_check
```

## Dados de teste

```bash
pnpm documents:mock            # cria workspaces/usuários/pastas/arquivos [MOCK] (não duplica)
pnpm documents:mock --reset    # recria só os documentos [MOCK]
pnpm documents:mock:clean      # remove SOMENTE o que o script criou (banco + arquivos do storage)
```

Os documentos são criados pela API real (a app precisa estar no ar), então o `storageKey`, o disco e o banco ficam coerentes. Estrutura no [MOCK] Alfa: `Contratos/{2024,2025}`, `Financeiro/Notas Fiscais`, `RH/Políticas`, `Marketing/Imagens`, `Nivel 1/…/Nivel 10`, `Pasta vazia`, `Muitos itens` (60 itens), um ZIP de ~20 MB e um arquivo de cada tipo permitido.

## Smoke test de API

```bash
pnpm documents:smoke                   # confere blobs no disco via `docker compose exec app`
pnpm documents:smoke --storage=local   # app rodando no host (usa STORAGE_DIR ou ./storage)
pnpm documents:smoke --storage=skip    # sem checagem de disco
```

Ele trabalha em pastas `[SMOKE] <data>` e as remove no fim. O login tem limite de 8 tentativas/min, então se você rodar o teste várias vezes seguidas ele espera a janela sozinho.

## Storage dentro do container

```bash
docker compose exec app ls -la /app/storage                # uma pasta por workspace
docker compose exec app du -sh /app/storage
docker compose exec app sh -c 'touch /app/storage/.w && rm /app/storage/.w && echo gravavel'
```
