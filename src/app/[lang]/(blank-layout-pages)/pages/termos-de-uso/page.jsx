'use client'

import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export default function TermosDeUso() {
  const [numPages, setNumPages] = useState(null)

  return (
    <div className='flex flex-col items-center p-6 min-h-screen'>
      <h1 className='text-2xl font-bold mb-6'>Termos de Uso</h1>
      <div className='w-full max-w-3xl'>
        <Document file='/docs/termos-de-uso.pdf' onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
          {Array.from({ length: numPages || 0 }, (_, i) => (
            <Page key={i + 1} pageNumber={i + 1} width={768} renderTextLayer={false} renderAnnotationLayer={false} />
          ))}
        </Document>
      </div>
    </div>
  )
}
