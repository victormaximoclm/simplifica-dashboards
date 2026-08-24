export const hasAdminPermission = (adminPermissions, moduleKey) =>
  adminPermissions?.some(p => p.moduleKey === moduleKey) ?? false
