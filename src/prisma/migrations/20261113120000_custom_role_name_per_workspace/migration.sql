-- O nome do cargo era único no banco inteiro; passa a ser único apenas dentro do workspace
-- (já garantido por CustomRole_workspaceId_name_key).
DROP INDEX IF EXISTS "CustomRole_name_key";
