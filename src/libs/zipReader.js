import zlib from 'zlib'

/**
 * Leitor mínimo de ZIP (diretório central) usado pela pré-visualização de Documentos.
 * Suporta os métodos "store" (0) e "deflate" (8). Não suporta ZIP64 nem arquivos criptografados.
 * A descompactação sempre tem limite de saída (proteção contra "zip bomb").
 */

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const MAX_ENTRIES = 10000

export class ZipReadError extends Error {}

function findEndOfCentralDirectory(buffer) {
  // O registro final tem 22 bytes + comentário de até 65535 bytes
  const lowest = Math.max(0, buffer.length - 22 - 65535)

  for (let offset = buffer.length - 22; offset >= lowest; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }

  throw new ZipReadError('Arquivo ZIP inválido ou corrompido')
}

/** Lista as entradas do ZIP sem descompactar nada */
export function readZipEntries(buffer) {
  if (buffer.length < 22) throw new ZipReadError('Arquivo ZIP inválido ou corrompido')

  const eocd = findEndOfCentralDirectory(buffer)
  const total = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)

  if (total === 0xffff || offset === 0xffffffff) {
    throw new ZipReadError('Arquivos ZIP64 não são suportados na pré-visualização')
  }

  const entries = []

  for (let index = 0; index < Math.min(total, MAX_ENTRIES); index++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new ZipReadError('Arquivo ZIP inválido ou corrompido')
    }

    const flags = buffer.readUInt16LE(offset + 8)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString(flags & 0x800 ? 'utf8' : 'latin1')

    entries.push({
      name,
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      size: buffer.readUInt32LE(offset + 24),
      localOffset: buffer.readUInt32LE(offset + 42),
      encrypted: !!(flags & 0x1),
      isDirectory: name.endsWith('/')
    })

    offset += 46 + nameLength + extraLength + commentLength
  }

  return { entries, total }
}

/** Descompacta uma entrada; lança ZipReadError se passar de maxBytes */
export function readZipEntry(buffer, entry, maxBytes) {
  if (entry.encrypted) throw new ZipReadError('Arquivo protegido por senha')

  const local = entry.localOffset

  if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) {
    throw new ZipReadError('Arquivo ZIP inválido ou corrompido')
  }

  const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
  const data = buffer.subarray(start, start + entry.compressedSize)

  if (entry.method === 0) {
    if (data.length > maxBytes) throw new ZipReadError('Conteúdo grande demais para pré-visualizar')

    return Buffer.from(data)
  }

  if (entry.method === 8) {
    try {
      return zlib.inflateRawSync(data, { maxOutputLength: maxBytes })
    } catch (error) {
      if (error?.code === 'ERR_BUFFER_TOO_LARGE') throw new ZipReadError('Conteúdo grande demais para pré-visualizar')

      throw new ZipReadError('Não foi possível descompactar o arquivo')
    }
  }

  throw new ZipReadError('Método de compressão não suportado na pré-visualização')
}

/** Abre o ZIP e devolve um leitor por nome de entrada */
export function openZip(buffer, maxBytesPerEntry) {
  const { entries, total } = readZipEntries(buffer)
  const byName = new Map(entries.map(entry => [entry.name, entry]))

  return {
    entries,
    total,
    has: name => byName.has(name),
    readText(name) {
      const entry = byName.get(name)

      if (!entry) throw new ZipReadError(`Parte "${name}" não encontrada no arquivo`)

      return readZipEntry(buffer, entry, maxBytesPerEntry).toString('utf8')
    }
  }
}
