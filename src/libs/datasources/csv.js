function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  result.push(current.trim())
  return result
}

function parseCsv(text) {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(parseCsvLine)
}

/**
 * Carrega opções de um CSV público (URL direta ou Google Drive export)
 */
export async function getRows(_accessToken, { url, labelColumn = 0, valueColumn = 1, hasHeader = true }) {
  if (!url) throw new Error('URL do CSV é obrigatória')

  const res = await fetch(url)
  if (!res.ok) throw new Error('Erro ao buscar CSV')

  const rows = parseCsv(await res.text())
  const dataRows = hasHeader ? rows.slice(1) : rows
  const labelIdx = Number(labelColumn)
  const valueIdx = Number(valueColumn)

  return dataRows
    .map(row => ({
      label: String(row[labelIdx] ?? '').trim(),
      value: String(row[valueIdx] ?? '').trim()
    }))
    .filter(r => r.label && r.value)
}
