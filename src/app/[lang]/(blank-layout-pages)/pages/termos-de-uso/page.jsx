'use client'

import ClientPdfViewer from '@/components/pdf-viewer/ClientPdfViewer'

export default function TermosDeUso() {
  return (
    <div className='flex flex-col items-center p-6 min-h-dvh'>
      <h1 className='text-2xl font-bold mb-6'>Termos de Uso</h1>
      <div className='w-full max-w-4xl'>
        <ClientPdfViewer file='/docs/termos-de-uso.pdf' title='Termos de Uso' className='h-[80vh]' />
      </div>
    </div>
  )
}
