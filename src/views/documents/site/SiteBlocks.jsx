'use client'

import { Fragment, useMemo } from 'react'

import { sanitizeLinkHref } from '@/libs/documentHtml'
import { sanitizeSiteBlocks } from '@/libs/documentSite'
import { formMutedCls } from '@/views/forms/formStyles'

/**
 * Renderiza os blocos de uma página do Site em React, nó a nó, sem innerHTML. Só desenha tipos de nó e marcas
 * conhecidos e refaz a limpeza do conteúdo e dos links aqui, mesmo que o servidor já tenha limpado (o conteúdo
 * pode ter entrado no banco por outro caminho).
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

const textColor = 'text-[var(--mui-palette-text-primary)]'

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

const SiteBlocks = ({ blocks, emptyText }) => {
  const safeBlocks = useMemo(() => sanitizeSiteBlocks(blocks), [blocks])

  if (!safeBlocks.length) return <p className={`text-sm ${formMutedCls}`}>{emptyText}</p>

  return (
    <div>
      {safeBlocks.map(block => (
        <section key={block.id}>{(block.doc?.content ?? []).map((node, index) => renderNode(node, index))}</section>
      ))}
    </div>
  )
}

export default SiteBlocks
