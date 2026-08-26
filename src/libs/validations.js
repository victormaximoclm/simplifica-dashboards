// Valibot schemas for server-side API route validation.
import * as v from 'valibot'

// ── Auth / Setup ────────────────────────────
export const loginSchema = v.object({
  email: v.pipe(v.string(), v.email('Email inválido')),
  password: v.pipe(v.string(), v.minLength(1, 'Senha é obrigatória'))
})

export const setupSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, 'Nome é obrigatório')),
  email: v.pipe(v.string(), v.email('Email inválido')),
  password: v.pipe(v.string(), v.minLength(6, 'A senha deve ter pelo menos 6 caracteres'))
})

// ── Password ────────────────────────────────
export const changePasswordSchema = v.object({
  currentPassword: v.pipe(v.string(), v.minLength(1, 'Senha atual é obrigatória')),
  newPassword: v.pipe(v.string(), v.minLength(6, 'Nova senha deve ter pelo menos 6 caracteres'))
})

// ── Profile ─────────────────────────────────
export const updateProfileSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.minLength(1))),
  image: v.optional(v.nullable(v.string()))
})

// ── Workspaces ──────────────────────────────
export const workspaceGuestSchema = v.object({
  userId: v.pipe(v.string(), v.minLength(1)),
  permission: v.picklist(['view', 'edit', 'create'], 'Nível de permissão inválido')
})

export const createWorkspaceSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, 'Nome é obrigatório')),
  isPrivate: v.optional(v.boolean()),
  guests: v.optional(v.array(workspaceGuestSchema))
})

// ── Users ───────────────────────────────────
export const inviteUserSchema = v.object({
  email: v.pipe(v.string(), v.email('E-mail inválido')),
  workspaceId: v.optional(v.nullable(v.string())),
  role: v.optional(v.string()),
  customRoleId: v.optional(v.nullable(v.string()))
})

// ── Dashboards ──────────────────────────────
export const createDashboardSchema = v.object({
  iframeCode: v.pipe(v.string(), v.minLength(1, 'Código iframe é obrigatório')),
  workspaceId: v.pipe(v.string(), v.minLength(1, 'Workspace é obrigatório')),
  allowedRoleIds: v.optional(v.array(v.string())),
  title: v.optional(v.string())
})

// ── Custom Roles ────────────────────────────
export const createCustomRoleSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, 'Nome do cargo é obrigatório')),
  workspaceId: v.pipe(v.string(), v.minLength(1, 'Workspace é obrigatório'))
})

// ── Notifications ───────────────────────────
export const dismissNotificationSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1, 'ID da notificação é obrigatório'))
})

export const markReadSchema = v.object({
  notificationIds: v.optional(v.array(v.string())),
  readAll: v.optional(v.boolean())
})

export const acceptInviteSchema = v.object({
  token: v.pipe(v.string(), v.minLength(1, 'Token é obrigatório')),
  name: v.pipe(v.string(), v.minLength(1, 'Nome é obrigatório')),
  password: v.pipe(v.string(), v.minLength(6, 'A senha deve ter no mínimo 6 caracteres')),
  termsAccepted: v.literal(true, 'Você precisa aceitar os Termos de Uso')
})

/**
 * Parses a request body against a valibot schema.
 * Returns { success: true, data } or { success: false, message }.
 */
export function parseBody(schema, body) {
  const result = v.safeParse(schema, body)

  if (!result.success) {
    const firstIssue = result.issues[0]

    return { success: false, message: firstIssue?.message || 'Dados inválidos' }
  }

  return { success: true, data: result.output }
}
