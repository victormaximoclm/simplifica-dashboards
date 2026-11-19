'use client'

import { Fragment, useMemo } from 'react'

import { formatFileSize, getDocumentItemType } from '@/libs/documentFileTypes'
import { sanitizeLinkHref } from '@/libs/documentHtml'
import { SITE_IMAGE_MIMES, sanitizeSiteBlocks } from '@/libs/documentSite'
import { formMutedCls } from '@/views/forms/formStyles'

/**
 * Renderiza os blocos de uma página do Site em React, nó a nó, sem innerHTML. Só desenha tipos de nó, de bloco e
 * marcas conhecidos e refaz a limpeza do conteúdo e dos links aqui, mesmo que o servidor já tenha limpado (o
 * conteúdo pode ter entrado no banco por outro caminho). Arquivos e imagens vêm do mapa `files` (resolvido pelo
 * servidor): sem entrada disponível, o bloco mostra "indisponível" e nenhum dado do arquivo.
 */

const TEXT_ALIGNS = ['center', 'right', 'justify']

// Das marcas mais internas para as mais externas; o link é sempre o elemento de fora
const MARK_ORDER = [
  ['code', 'code', 'rounded px-1 font-mono text-[0.9em] bg-[var(--mui-palette-action-hover)]'],
  ['strike', 's', ''],
  ['underline', 'u', ''],
  ['italic', 'em', ''],
  ['bold', 'strong', 'font-semibold']
]

const HEADINGS = {
  1: ['h2', 'mbs-8 mbe-3 text-2xl font-semibold'],
  2: ['h3', 'mbs-6 mbe-2 text-xl font-semibold'],
  3: ['h4', 'mbs-5 mbe-2 text-lg font-semibold']
}

const IMAGE_WIDTHS = { sm: 'max-w-xs', md: 'max-w-2xl', full: 'w-full' }

const textColor = 'text-[var(--mui-palette-text-primary)]'
const cardCls = 'flex items-center gap-3 rounded-xl border border-[var(--mui-palette-divider)] p-3 mbe-3'

const actionCls =
  'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium cursor-pointer border border-[var(--mui-palette-divider)] bg-transparent no-underline text-[var(--mui-palette-text-primary)] hover:bg-[var(--mui-palette-action-hover)]'

const alignStyle = node => {
  const align = node.attrs?.textAlign

  return TEXT_ALIGNS.includes(align) ? { textAlign: align } : undefined
}

function renderText(node, key) {
  const marks = node.marks ?? []
  let element = node.text

  for (const [type, Tag, className] of MARK_ORDER) {
    if (marks.some(mark => mark.type === type)) element = <Tag className={className || undefined}>{element}</Tag>
  }

  const link = marks.find(mark => mark.type === 'link')
  const href = link ? sanitizeLinkHref(link.attrs?.href) : null

  if (href) {
    element = (
      <a href={href} target='_blank' rel='noopener noreferrer' className='text-[var(--mui-palette-primary-main)] underline'>
        {element}
      </a>
    )
  }

  return <Fragment key={key}>{element}</Fragment>
}

function renderNode(node, key) {
  if (!node) return null
  if (node.type === 'text') return renderText(node, key)
  if (node.type === 'hardBreak') return <br key={key} />
  if (node.type === 'horizontalRule') return <hr key={key} className='my-6 border-[var(--mui-palette-divider)]' />

  const children = (node.content ?? []).map((child, index) => renderNode(child, index))

  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} style={alignStyle(node)} className={`mbe-3 leading-7 ${textColor}`}>
          {children.length ? children : <br />}
        </p>
      )

    case 'heading': {
      const [Tag, className] = HEADINGS[node.attrs?.level] ?? HEADINGS[2]

      return (
        <Tag key={key} style={alignStyle(node)} className={`${className} ${textColor}`}>
          {children}
        </Tag>
      )
    }

    case 'bulletList':
      return (
        <ul key={key} className={`mbe-3 list-disc ps-6 leading-7 ${textColor}`}>
          {children}
        </ul>
      )

    case 'orderedList': {
      const start = Number(node.attrs?.start)

      return (
        <ol
          key={key}
          start={Number.isInteger(start) && start > 1 ? start : undefined}
          className={`mbe-3 list-decimal ps-6 leading-7 ${textColor}`}
        >
          {children}
        </ol>
      )
    }

    case 'listItem':
      return <li key={key}>{children}</li>

    case 'blockquote':
      return (
        <blockquote
          key={key}
          className={`mbe-3 border-is-4 border-[var(--mui-palette-primary-main)] ps-4 leading-7 ${textColor}`}
        >
          {children}
        </blockquote>
      )

    case 'codeBlock':
      return (
        <pre key={key} className='mbe-3 overflow-x-auto rounded-lg p-4 text-sm bg-[var(--mui-palette-action-hover)]'>
          <code>{children}</code>
        </pre>
      )

    default:
      return <Fragment key={key}>{children}</Fragment>
  }
}

const Unavailable = ({ icon, text }) => (
  <div className={`${cardCls} ${formMutedCls}`}>
    <i className={`${icon} text-2xl shrink-0`} />
    <span className='text-sm'>{text}</span>
  </div>
)

const ImageBlock = ({ block, file, onOpenFile }) => {
  if (!file?.available || !SITE_IMAGE_MIMES.includes(file.mimeType)) {
    return <Unavailable icon='tabler-photo-off' text='Imagem indisponível' />
  }

  return (
    <figure className={`mbe-4 mx-0 ${IMAGE_WIDTHS[block.width] ?? IMAGE_WIDTHS.md}`}>
      <button
        type='button'
        onClick={() => onOpenFile(file)}
        aria-label={`Ampliar ${block.alt || file.name}`}
        className='block w-full cursor-zoom-in bg-transparent border-0 p-0'
      >
        <img
          src={`/api/documents/files/${file.id}/preview`}
          alt={block.alt}
          loading='lazy'
          className='block w-full h-auto rounded-lg'
        />
      </button>
      {block.caption && <figcaption className={`mbs-2 text-sm ${formMutedCls}`}>{block.caption}</figcaption>}
    </figure>
  )
}

const FileBlock = ({ block, file, onOpenFile }) => {
  if (!file?.available) return <Unavailable icon='tabler-file-off' text='Arquivo indisponível' />

  const type = getDocumentItemType(file)

  return (
    <div className={cardCls}>
      <i className={`${type?.icon ?? 'tabler-file'} text-3xl shrink-0 text-[var(--mui-palette-primary-main)]`} />
      <div className='flex-1 min-w-0'>
        <p className={`truncate font-medium ${textColor}`} title={block.label || file.name}>
          {block.label || file.name}
        </p>
        <p className={`truncate text-sm ${formMutedCls}`}>
          {[type?.label, formatFileSize(file.size), block.description].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className='flex flex-wrap gap-2 shrink-0'>
        {file.inlinePreview && (
          <button type='button' onClick={() => onOpenFile(file)} className={actionCls}>
            <i className='tabler-eye text-base' />
            Visualizar
          </button>
        )}
        <a href={`/api/documents/files/${file.id}/download`} rel='noopener' className={actionCls}>
          <i className='tabler-download text-base' />
          Baixar
        </a>
      </div>
    </div>
  )
}

const LinkBlock = ({ block }) => {
  const href = sanitizeLinkHref(block.url)

  if (!href) return null

  let host = ''

  try {
    host = new URL(href).host
  } catch {
    // mailto: não tem host
  }

  return (
    <a href={href} target='_blank' rel='noopener noreferrer' className={`${cardCls} no-underline hover:bg-[var(--mui-palette-action-hover)]`}>
      <i className='tabler-link text-3xl shrink-0 text-[var(--mui-palette-primary-main)]' />
      <div className='flex-1 min-w-0'>
        <p className={`truncate font-medium ${textColor}`}>{block.label || href}</p>
        <p className={`truncate text-sm ${formMutedCls}`}>
          {[host || href, block.description].filter(Boolean).join(' · ')}
        </p>
      </div>
      <i className='tabler-external-link text-lg shrink-0' />
    </a>
  )
}

const SiteBlocks = ({ blocks, files = {}, onOpenFile, emptyText }) => {
  const safeBlocks = useMemo(() => sanitizeSiteBlocks(blocks), [blocks])

  if (!safeBlocks.length) return <p className={`text-sm ${formMutedCls}`}>{emptyText}</p>

  return (
    <div>
      {safeBlocks.map(block => {
        if (block.type === 'image') return <ImageBlock key={block.id} block={block} file={files[block.fileId]} onOpenFile={onOpenFile} />
        if (block.type === 'file') return <FileBlock key={block.id} block={block} file={files[block.fileId]} onOpenFile={onOpenFile} />
        if (block.type === 'link') return <LinkBlock key={block.id} block={block} />

        return <section key={block.id}>{(block.doc?.content ?? []).map((node, index) => renderNode(node, index))}</section>
      })}
    </div>
  )
}

export default SiteBlocks
