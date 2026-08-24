export function canShareDash(adminPermissions = []) {
  return adminPermissions.some(permission => permission.moduleKey === 'dashboards' && permission.action === 'share')
}

export function canShareForms(adminPermissions = []) {
  return adminPermissions.some(permission => permission.moduleKey === 'forms' && permission.action === 'share')
}

export function canUploadDocuments(adminPermissions = []) {
  return adminPermissions.some(permission => permission.moduleKey === 'documents' && permission.action === 'upload')
}
