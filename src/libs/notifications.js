import { prisma } from '@/libs/prisma'

/**
 * Create a notification.
 * @param {Object} params
 * @param {string} params.type - user_invited | user_role_changed | user_status_changed | user_status_pending | user_deleted | dashboard_created | dashboard_deleted
 * @param {string} params.title - Short notification title
 * @param {string} params.message - Notification description
 * @param {string|null} params.workspaceId - Workspace scope (null = global)
 * @param {string|null} params.createdById - User who triggered the action
 */
export async function createNotification({ type, title, message, workspaceId = null, createdById = null }) {
  try {
    await prisma.notification.create({
      data: {
        type,
        title,
        message,
        workspaceId,
        createdById
      }
    })
  } catch (err) {
    console.error('Erro ao criar notificação:', err)
  }
}
