import { prisma } from '@/libs/prisma'

/**
 * Create a notification.
 * @param {Object} params
 * @param {string} params.type - user_invited | user_role_changed | user_status_changed | user_status_pending | user_deleted | dashboard_created | dashboard_deleted | dashboard_updated
 * @param {string} params.title - Short notification title
 * @param {string} params.message - Notification description
 * @param {string|null} params.workspaceId - Workspace scope (null = global)
 * @param {string|null} params.createdById - User who triggered the action
 * @param {string|null} params.dashboardId - Dashboard relacionado (obrigatório para type dashboard_updated — filtro de permissão no GET)
 */
export async function createNotification({
  type,
  title,
  message,
  workspaceId = null,
  createdById = null,
  dashboardId = null
}) {
  try {
    await prisma.notification.create({
      data: {
        type,
        title,
        message,
        workspaceId,
        createdById,
        dashboardId
      }
    })
  } catch (err) {
    console.error('Erro ao criar notificação:', err)
  }
}
