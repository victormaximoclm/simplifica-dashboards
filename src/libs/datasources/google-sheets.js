import { getRows as getCsvRows } from './csv'

/**
 * Planilha Google publicada — export CSV
 * spreadsheetId + gid (aba)
 */
export async function getRows(accessToken, config) {
  const { spreadsheetId, gid = '0', labelColumn, valueColumn, hasHeader } = config

  if (!spreadsheetId) throw new Error('spreadsheetId é obrigatório')

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`

  return getCsvRows(accessToken, { url, labelColumn, valueColumn, hasHeader })
}
