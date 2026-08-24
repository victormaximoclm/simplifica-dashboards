'use client'

import { useState } from 'react'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Link from '@mui/material/Link'
import { useRouter, useParams } from 'next/navigation'
import CreateFolderDialog from './CreateFolderDialog'
import UploadDocumentDialog from './UploadDocumentDialog'

const DocumentsExplorer = ({
  currentFolder,
  initialFolders,
  initialDocuments = [],
  canManage,
  canUpload,
  workspaceId
}) => {
  const wsId = currentFolder?.workspaceId ?? workspaceId
  const router = useRouter()
  const { lang: locale } = useParams()
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)

  const goTo = folderId => router.push(`/${locale}/documents/${folderId}`)

  const goToBreadcrumb = folderId => {
    if (folderId) {
      goTo(folderId)
    } else {
      router.push(`/${locale}/documents`)
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <Breadcrumbs>
          <Link
            component='button'
            underline='hover'
            color={currentFolder ? 'inherit' : 'text.primary'}
            onClick={() => goToBreadcrumb(null)}
          >
            Documentos
          </Link>

          {/* Se você tiver o caminho completo (ancestrais) disponível, dá pra mapear aqui.
              Deixei só a pasta atual como no original, mas com onClick preparado
              caso queira passar currentFolder.path (array de { id, name }). */}
          {currentFolder?.path?.map(folder => (
            <Link
              key={folder.id}
              component='button'
              underline='hover'
              color='inherit'
              onClick={() => goToBreadcrumb(folder.id)}
            >
              {folder.name}
            </Link>
          ))}

          {currentFolder && <Typography color='text.primary'>{currentFolder.name}</Typography>}
        </Breadcrumbs>

        <div className='flex gap-2'>
          {canManage && (
            <IconButton onClick={() => setFolderDialogOpen(true)}>
              <i className='tabler-folder-plus' />
            </IconButton>
          )}
          {canUpload && (
            <IconButton onClick={() => setUploadDialogOpen(true)}>
              <i className='tabler-upload' />
            </IconButton>
          )}
        </div>
      </div>

      <TableContainer component={Paper} variant='outlined'>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell align='right'>Conteúdo</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {initialFolders.length === 0 && initialDocuments.length === 0 && (
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography variant='body2' color='text.secondary' className='py-6 text-center'>
                    Esta pasta está vazia.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {initialFolders.map(folder => (
              <TableRow key={folder.id} hover className='cursor-pointer' onClick={() => goTo(folder.id)}>
                <TableCell>
                  <div className='flex items-center gap-3'>
                    <i className='tabler-folder text-xl text-warning' />
                    <Typography>{folder.name}</Typography>
                  </div>
                </TableCell>
                <TableCell align='right'>
                  <Typography variant='caption' color='text.secondary'>
                    {folder._count?.children ?? 0} pastas · {folder._count?.documents ?? 0} arquivos
                  </Typography>
                </TableCell>
              </TableRow>
            ))}

            {initialDocuments.map(doc => (
              <TableRow
                key={doc.id}
                hover
                className='cursor-pointer'
                onClick={() => window.open(doc.fileUrl, '_blank')}
              >
                <TableCell>
                  <div className='flex items-center gap-3'>
                    <i className='tabler-file text-xl' />
                    <Typography noWrap>{doc.name}</Typography>
                  </div>
                </TableCell>
                <TableCell align='right' />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {canManage && (
        <CreateFolderDialog
          open={folderDialogOpen}
          onClose={() => setFolderDialogOpen(false)}
          workspaceId={wsId}
          parentId={currentFolder?.id ?? null}
        />
      )}
      {canUpload && (
        <UploadDocumentDialog
          open={uploadDialogOpen}
          onClose={() => setUploadDialogOpen(false)}
          folderId={currentFolder?.id}
          workspaceId={currentFolder?.workspaceId}
        />
      )}
    </div>
  )
}

export default DocumentsExplorer
