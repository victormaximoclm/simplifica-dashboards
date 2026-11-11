import dynamic from 'next/dynamic'

// pdf.js só roda no navegador (no servidor quebra no Node 20 e não tem utilidade)
const ClientPdfViewer = dynamic(() => import('./PdfViewer'), { ssr: false })

export default ClientPdfViewer
