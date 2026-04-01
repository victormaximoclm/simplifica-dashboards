/**
 * Role hierarchy: superAdmin > subAdmin > admin > user (custom roles)
 *
 * - isHighAdmin: superAdmin OR subAdmin (can manage everything)
 * - isSuperOnly: strictly superAdmin (can assign subAdmin role)
 */

export const ROLE_HIERARCHY = ['superAdmin', 'subAdmin', 'admin', 'user']

/** Returns true for superAdmin or subAdmin */
export const isHighAdmin = role => role === 'superAdmin' || role === 'subAdmin'

/** Returns true for strictly superAdmin */
export const isSuperOnly = role => role === 'superAdmin'

/**
 * Returns the roles that a given caller role can assign to others.
 * - superAdmin can assign: subAdmin, admin, user
 * - subAdmin can assign: admin, user
 * - others cannot assign roles
 */
export const getAssignableRoles = callerRole => {
  if (callerRole === 'superAdmin') return ['subAdmin', 'admin', 'user']
  if (callerRole === 'subAdmin') return ['admin', 'user']

  return []
}
