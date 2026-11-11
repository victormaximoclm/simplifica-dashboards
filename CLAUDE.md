# Simpla Insights (simplifica-dashboards)

## Visão geral do código

Painel multi-workspace em Next.js 16 (App Router, JavaScript/JSX) que entrega dashboards do Power BI, formulários ligados a webhooks do n8n e o módulo de Documentos (pastas, arquivos, documentos HTML e templates).

**Stack:** Next.js 16, React 19, MUI 7 + Tailwind 4 (utilitários `!important`), Prisma 6 + PostgreSQL, NextAuth 4 (JWT), Redis, TipTap, Docker.

**Estrutura:** `src/app/[lang]` (páginas), `src/app/api` (rotas), `src/views` (telas), `src/libs` (regras de negócio), `src/prisma` (schema e migrations), `scripts/documents-dev` (mock e smoke test). `@core`, `@menu` e `@layouts` são código do template.

Para a arquitetura detalhada, veja [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Convenções

- Textos de interface e mensagens em português; só o menu lateral usa os dicionários de `src/data/dictionaries`.
- Sem ponto e vírgula, aspas simples, 120 colunas (Prettier), linha em branco antes de `return`.
- Papéis: `superAdmin > subAdmin > admin > user`. Regras de acesso por workspace ficam em `src/utils/roleHelpers.js` e `src/libs/workspaceAccess.js`.
- Permissões de Documentos: um único ponto de decisão, `src/libs/documentPermissions.js`.

## Comandos

- Subir local: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`
- Mock e smoke do módulo de Documentos (via serviço `tools`, sem Node no host): `docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm tools pnpm documents:mock` e `... pnpm documents:smoke --storage=local`
- Nunca use `docker compose down -v`: apaga o banco e os arquivos enviados.
