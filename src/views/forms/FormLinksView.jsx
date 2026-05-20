'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import {
  btnPrimary,
  btnSecondary,
  btnIcon,
  formCaptionCls,
  formErrorInlineCls,
  formInputCls,
  formListItemCls,
  formMutedCls,
  formPageCls,
  formSectionCls,
  formSectionTitleCls,
  formSubtitleCls,
  formTitleCls
} from './formStyles'

const FormLinksView = ({ formId, formTitle, lang, canGenerateLink = false }) => {
  const router = useRouter()
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [expiresInHours, setExpiresInHours] = useState(24)
  const [copied, setCopied] = useState(null)
  const [error, setError] = useState(null)

  const loadLinks = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/forms/${formId}/links`)
      if (!res.ok) throw new Error('Erro ao carregar links')
      setLinks(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLinks()
  }, [formId])

  const generateLink = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/forms/${formId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInHours: Number(expiresInHours) })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Erro ao gerar link')
      }
      const link = await res.json()
      setLinks(prev => [link, ...prev])
      if (link.publicUrl) {
        await navigator.clipboard.writeText(link.publicUrl)
        setCopied(link.id)
        setTimeout(() => setCopied(null), 2000)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const copyUrl = async (url, id) => {
    await navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className={`${formPageCls} max-w-2xl mx-auto w-full`}>
      <button
        type='button'
        onClick={() => router.push(`/${lang}/forms`)}
        className={`${btnIcon} mb-4`}
        aria-label='Voltar'
      >
        <i className='tabler-arrow-left text-lg' />
      </button>

      <h1 className={`${formTitleCls} mb-1`}>Links públicos</h1>
      <p className={`${formSubtitleCls} mb-6`}>{formTitle}</p>

      {canGenerateLink && (
        <section className={`${formSectionCls} mb-6`}>
          <h2 className={`${formSectionTitleCls} mb-3`}>Gerar novo link</h2>
          <p className={`${formCaptionCls} mb-3`}>Cada link é de uso único e expira automaticamente.</p>
          <div className='flex flex-wrap gap-3 items-end'>
            <label className={`flex flex-col gap-1 ${formCaptionCls}`}>
              Expira em (horas)
              <input
                type='number'
                min={1}
                max={168}
                value={expiresInHours}
                onChange={e => setExpiresInHours(e.target.value)}
                className={`${formInputCls} w-24`}
              />
            </label>
            <button
              type='button'
              onClick={generateLink}
              disabled={generating}
              className={`${btnPrimary} disabled:opacity-50`}
            >
              {generating ? 'Gerando...' : 'Gerar e copiar'}
            </button>
          </div>
          {error && <p className={`${formErrorInlineCls} mt-2`}>{error}</p>}
        </section>
      )}

      {!canGenerateLink && error && <p className={`${formErrorInlineCls} mb-4`}>{error}</p>}

      <section>
        <h2 className={`${formSectionTitleCls} mb-3`}>Links gerados</h2>
        {loading ? (
          <p className={formMutedCls}>Carregando...</p>
        ) : links.length === 0 ? (
          <p className={formMutedCls}>Nenhum link gerado ainda.</p>
        ) : (
          <ul className='flex flex-col gap-2'>
            {links.map(link => {
              const expired = new Date() > new Date(link.expiresAt)
              const status = link.used ? 'Usado' : expired ? 'Expirado' : 'Ativo'
              return (
                <li key={link.id} className={formListItemCls}>
                  <div className='flex-1 min-w-0'>
                    <p className={`text-xs ${formMutedCls} truncate`}>{link.publicUrl}</p>
                    <p className={`text-xs ${formCaptionCls} mt-0.5`}>
                      Expira: {new Date(link.expiresAt).toLocaleString('pt-BR')} · {status}
                    </p>
                  </div>
                  {!link.used && !expired && (
                    <button
                      onClick={() => copyUrl(link.publicUrl, link.id)}
                      className={`shrink-0 ${btnSecondary}`}
                    >
                      {copied === link.id ? 'Copiado!' : 'Copiar'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

export default FormLinksView
