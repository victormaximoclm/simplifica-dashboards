'use client'

import { useState } from 'react'

import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'

import { formatFileSize, getDocumentFileType } from '@/libs/documentFileTypes'
import { formCardCls, formDividerCls, formMutedCls, formScrollCls } from '@/views/forms/formStyles'

/**
 * Renderizadores da pré-visualização estruturada (dados vindos de /preview-data).
 * Todo conteúdo é renderizado como texto pelo React — nada do arquivo vira HTML.
 */

const scrollArea = `max-h-[65vh] overflow-auto rounded-lg border ${formDividerCls} ${formScrollCls}`

const TruncatedNote = ({ children }) => <p className={`text-xs ${formMutedCls} mbs-2`}>{children}</p>

const columnLabel = index => {
  let label = ''

  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + ((n - 1) % 26)) + label

  return label
}

function TextPreview({ data }) {
  return (
    <>
      <pre className={`${scrollArea} m-0 p-4 whitespace-pre-wrap break-words font-mono text-sm`}>
        {data.text || '(arquivo vazio)'}
      </pre>
      {data.truncated && (
        <TruncatedNote>Exibindo apenas o início do arquivo. Baixe para ver o conteúdo completo.</TruncatedNote>
      )}
    </>
  )
}

function SheetTable({ sheet }) {
  const columnCount = Math.max(0, ...sheet.rows.map(row => row.length))

  if (!sheet.rows.length || !columnCount) {
    return <p className={`${formMutedCls} p-4`}>Planilha vazia.</p>
  }

  const headerCell =
    'sticky top-0 z-[1] bg-[var(--mui-palette-background-paper)] px-3 py-1.5 text-xs font-medium border-b border-r text-center'

  return (
    <div className={scrollArea}>
      <table className='border-collapse text-sm min-w-full'>
        <thead>
          <tr>
            <th className={`${headerCell} ${formDividerCls} w-12`} />
            {Array.from({ length: columnCount }, (_, index) => (
              <th key={index} className={`${headerCell} ${formDividerCls}`}>
                {columnLabel(index)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className='hover:bg-[var(--mui-palette-action-hover)]'>
              <td className={`px-3 py-1.5 text-xs text-center border-b border-r ${formDividerCls} ${formMutedCls}`}>
                {rowIndex + 1}
              </td>
              {Array.from({ length: columnCount }, (_, columnIndex) => (
                <td
                  key={columnIndex}
                  title={row[columnIndex] || undefined}
                  className={`px-3 py-1.5 border-b border-r ${formDividerCls} max-w-[260px] truncate whitespace-nowrap`}
                >
                  {row[columnIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TablePreview({ data }) {
  const [active, setActive] = useState(0)
  const sheets = data.sheets ?? []
  const sheet = sheets[active]

  if (!sheet) return <p className={formMutedCls}>Nenhuma planilha encontrada.</p>

  return (
    <>
      {sheets.length > 1 && (
        <Tabs value={active} onChange={(_, value) => setActive(value)} variant='scrollable' className='mbe-2'>
          {sheets.map((item, index) => (
            <Tab key={`${item.name}-${index}`} label={item.name} value={index} />
          ))}
        </Tabs>
      )}
      <SheetTable sheet={sheet} />
      {(sheet.truncated || data.truncatedSheets) && (
        <TruncatedNote>Exibindo até 200 linhas, 30 colunas e 10 abas. Baixe para ver o arquivo completo.</TruncatedNote>
      )}
    </>
  )
}

const HEADING_CLASSES = [
  '',
  'text-2xl font-bold',
  'text-xl font-bold',
  'text-lg font-semibold',
  'text-base font-semibold'
]

function DocumentPreview({ data }) {
  return (
    <>
      {/* "Folha" clara, como um documento impresso, independente do tema */}
      <div className={`${scrollArea} bg-[#f3f4f6] p-4 sm:p-8`}>
        <article className='mx-auto max-w-[800px] bg-white text-[#1f2937] shadow-md rounded p-6 sm:p-12 text-[15px] leading-relaxed'>
          {data.blocks.length === 0 && <p className='text-[#6b7280]'>(documento vazio)</p>}
          {data.blocks.map((block, index) =>
            block.type === 'table' ? (
              <table key={index} className='my-4 w-full border-collapse text-sm'>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className='border border-[#d1d5db] px-2 py-1 align-top whitespace-pre-wrap'>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p
                key={index}
                className={`whitespace-pre-wrap min-h-[1em] mbe-2 ${HEADING_CLASSES[Math.min(block.heading, 4)] ?? ''} ${
                  block.list ? 'ps-6 relative' : ''
                }`}
              >
                {block.list && <span className='absolute start-2'>•</span>}
                {block.runs.map((run, runIndex) => (
                  <span
                    key={runIndex}
                    className={`${run.bold ? 'font-bold' : ''} ${run.italic ? 'italic' : ''} ${run.underline ? 'underline' : ''}`}
                  >
                    {run.text}
                  </span>
                ))}
              </p>
            )
          )}
        </article>
      </div>
      {data.truncated && <TruncatedNote>Documento longo: exibindo apenas o início.</TruncatedNote>}
    </>
  )
}

function SlidesPreview({ data }) {
  if (!data.slides.length) return <p className={formMutedCls}>Apresentação sem slides.</p>

  return (
    <>
      <div className={`${scrollArea} p-4 flex flex-col gap-4 items-center bg-[var(--mui-palette-action-hover)]`}>
        {data.slides.map(slide => (
          <section
            key={slide.number}
            className='w-full max-w-[800px] aspect-video bg-white text-[#1f2937] rounded shadow-md p-6 sm:p-10 flex flex-col gap-3 overflow-hidden'
          >
            <span className='text-xs text-[#9ca3af]'>Slide {slide.number}</span>
            {slide.paragraphs.length === 0 && <p className='text-[#9ca3af] m-auto'>(slide sem texto)</p>}
            {slide.paragraphs.map((paragraph, index) =>
              index === 0 ? (
                <h3 key={index} className='text-2xl font-bold m-0 break-words'>
                  {paragraph}
                </h3>
              ) : (
                <p key={index} className='m-0 break-words'>
                  • {paragraph}
                </p>
              )
            )}
          </section>
        ))}
      </div>
      {data.truncated && <TruncatedNote>Exibindo os primeiros 100 slides.</TruncatedNote>}
    </>
  )
}

function ArchivePreview({ data }) {
  return (
    <>
      <p className={`text-sm ${formMutedCls} mbe-2`}>
        {data.total} {data.total === 1 ? 'item' : 'itens'} no arquivo compactado
      </p>
      <ul className={`${scrollArea} ${formCardCls} m-0 p-0 list-none`}>
        {data.entries.map((entry, index) => (
          <li
            key={`${entry.name}-${index}`}
            className={`flex items-center gap-3 px-4 py-2 border-b last:border-b-0 ${formDividerCls}`}
          >
            <i
              className={`${
                entry.isDirectory
                  ? 'tabler-folder text-[var(--mui-palette-primary-main)]'
                  : (getDocumentFileType(entry.name)?.icon ?? 'tabler-file')
              } text-lg shrink-0`}
            />
            <span className='flex-1 min-w-0 truncate text-sm' title={entry.name}>
              {entry.name}
            </span>
            {entry.encrypted && <i className='tabler-lock text-sm' title='Protegido por senha' />}
            {!entry.isDirectory && (
              <span className={`text-xs ${formMutedCls} shrink-0`}>{formatFileSize(entry.size)}</span>
            )}
          </li>
        ))}
      </ul>
      {data.truncated && <TruncatedNote>Exibindo os primeiros 1000 itens.</TruncatedNote>}
    </>
  )
}

// sandbox vazio: sem scripts, formulários, popups nem acesso à origem do app
export const HtmlPreview = ({ data, title = 'Documento' }) => (
  <iframe sandbox='' srcDoc={data.html} title={title} className='w-full h-[70vh] border-0 rounded-lg bg-[#f4f5f7]' />
)

const RENDERERS = {
  html: HtmlPreview,
  text: TextPreview,
  table: TablePreview,
  document: DocumentPreview,
  slides: SlidesPreview,
  archive: ArchivePreview
}

const FilePreviewContent = ({ data }) => {
  const Renderer = RENDERERS[data?.kind]

  if (!Renderer) return <p className={formMutedCls}>Formato de pré-visualização desconhecido.</p>

  return <Renderer data={data} />
}

export default FilePreviewContent
