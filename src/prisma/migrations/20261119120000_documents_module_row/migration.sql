-- Garante o módulo "documents" (acesso por cargo a pastas e arquivos). Hoje só o script manual
-- src/prisma/modules.js cria esta linha; o deploy roda apenas "migrate deploy", então ela vai aqui.
-- Sem mudança de schema: as concessões usam RolePermission(customRoleId, moduleId, action, resourceId).
INSERT INTO "Module" ("id", "key", "name", "createdAt")
VALUES ('module_documents', 'documents', 'Documentos', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
