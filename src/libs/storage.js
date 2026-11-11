import crypto from 'crypto'
import { createReadStream } from 'fs'
import fs from 'fs/promises'
import path from 'path'

/**
 * Armazenamento de arquivos binários (módulo de Documentos).
 *
 * Interface pública: put, get, delete, exists, generateStorageKey.
 * O driver atual é o disco local (STORAGE_DIR). Um driver S3 futuro só precisa implementar
 * os mesmos métodos de `localDriver` e ser selecionado em `getDriver()`.
 *
 * A chave (`storageKey`) é sempre gerada no servidor no formato `<workspaceId>/<uuid>`;
 * o nome enviado pelo usuário nunca entra no caminho.
 */

const STORAGE_KEY_REGEX = /^[A-Za-z0-9_-]{1,64}\/[a-f0-9-]{36}$/

export function getStorageDir() {
  return path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), 'storage'))
}

export function generateStorageKey(workspaceId) {
  const safeWorkspaceId = String(workspaceId || '')

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(safeWorkspaceId)) {
    throw new Error('workspaceId inválido para storage')
  }

  return `${safeWorkspaceId}/${crypto.randomUUID()}`
}

/** Converte a chave em caminho absoluto, recusando qualquer coisa fora de STORAGE_DIR */
function resolveKeyPath(key) {
  if (typeof key !== 'string' || !STORAGE_KEY_REGEX.test(key)) {
    throw new Error('storageKey inválida')
  }

  const root = getStorageDir()
  const filePath = path.resolve(root, ...key.split('/'))

  if (!filePath.startsWith(root + path.sep)) {
    throw new Error('storageKey fora do diretório de armazenamento')
  }

  return filePath
}

const localDriver = {
  async put(key, data) {
    const filePath = resolveKeyPath(key)

    await fs.mkdir(path.dirname(filePath), { recursive: true })

    // flag 'wx' falha se a chave já existir (nunca sobrescreve outro arquivo)
    await fs.writeFile(filePath, data, { flag: 'wx' })
  },

  async get(key) {
    const filePath = resolveKeyPath(key)
    const stat = await fs.stat(filePath)

    return { stream: createReadStream(filePath), size: stat.size }
  },

  async delete(key) {
    const filePath = resolveKeyPath(key)

    try {
      await fs.unlink(filePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  },

  async exists(key) {
    const filePath = resolveKeyPath(key)

    try {
      await fs.access(filePath)

      return true
    } catch {
      return false
    }
  }
}

function getDriver() {
  return localDriver
}

/** Grava o conteúdo (Buffer/Uint8Array) sob a chave informada */
export async function put(key, data) {
  return getDriver().put(key, data)
}

/** Retorna { stream (Node Readable), size }. Lança ENOENT se não existir. */
export async function get(key) {
  return getDriver().get(key)
}

/** Remove o conteúdo; não falha se já não existir */
async function remove(key) {
  return getDriver().delete(key)
}

export { remove as delete }

export async function exists(key) {
  return getDriver().exists(key)
}
