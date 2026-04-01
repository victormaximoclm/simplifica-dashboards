import nodemailer from 'nodemailer'

const escapeHtml = value =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
})

export async function sendInviteEmail({ to, inviteToken, workspaceName }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const inviteUrl = `${appUrl}/accept-invite?token=${encodeURIComponent(inviteToken)}`
  const logoUrl = `${appUrl}/images/logos/simplifica-email-logo.svg`
  const year = new Date().getFullYear()
  const safeWorkspaceName = escapeHtml(workspaceName || 'seu espaço de trabalho')
  const safeInviteUrl = escapeHtml(inviteUrl)
  const safeLogoUrl = escapeHtml(logoUrl)

  const safeWorkspaceNameForSubject = String(workspaceName || 'seu espaço de trabalho')
    .replace(/[\r\n]+/g, ' ')
    .trim()

  const mailOptions = {
    from: process.env.SMTP_FROM || '"Plataforma" <noreply@plataforma.com>',
    to,
    subject: `Convite para acessar a Simplifica - ${safeWorkspaceNameForSubject}`,
    html: `
      <div style="margin:0;padding:24px 12px;background:#f6f7fb;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #eceef3;">
                <tr>
                  <td style="padding:28px 28px 10px 28px;" align="center">
                    <img src="${safeLogoUrl}" alt="Simplifica" width="180" style="display:block;border:0;outline:none;text-decoration:none;" />
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
                    <h1 style="margin:0 0 10px 0;font-size:22px;line-height:1.3;">Voce foi convidado(a) para a Simplifica</h1>
                    <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#4b5563;">Voce recebeu um convite para acessar o workspace <strong style="color:#111827;">${safeWorkspaceName}</strong>.</p>
                    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#4b5563;">Clique no botao abaixo para aceitar o convite e definir sua senha.</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 28px 8px 28px;">
                    <a href="${safeInviteUrl}" style="display:inline-block;background:#E66C37;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;padding:12px 24px;border-radius:10px;" target="_blank" rel="noopener noreferrer">
                      Aceitar convite e criar senha
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;color:#4b5563;">
                    <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;">Se o botao nao funcionar, copie e cole este link no navegador:</p>
                    <p style="margin:0 0 20px 0;font-size:13px;line-height:1.6;word-break:break-all;">
                      <a href="${safeInviteUrl}" style="color:#E66C37;text-decoration:underline;">${safeInviteUrl}</a>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 22px 28px;font-family:Arial,Helvetica,sans-serif;color:#6b7280;">
                    <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;">Este convite expira em <strong>7 dias</strong>.</p>
                    <p style="margin:0;font-size:12px;line-height:1.5;">Se voce nao esperava este e-mail, pode ignora-lo com seguranca.</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;">
                <tr>
                  <td align="center" style="padding:14px 8px 0 8px;font-family:Arial,Helvetica,sans-serif;color:#9ca3af;font-size:11px;">
                    &copy; ${year} Simplifica. Todos os direitos reservados.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `
  }

  return transporter.sendMail(mailOptions)
}
