import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import PDFCanvas from '../components/PDFCanvas'
import FieldOverlay from '../components/FieldOverlay'
import SignaturePanel from '../components/SignaturePanel'
import { getSignerDocument, fillAndSign, downloadFinalPdf } from '../api/workflowApi'
import { AlertTriangle, Loader2, FileSignature, CheckCircle, Download } from 'lucide-react'
import { drawSignaturePreview, formatSignatureDate } from '../lib/signaturePreview'

function PlacedSignatureChip({ signerName, style, onDragStart, onRemove }) {
  const canvasRef = useRef(null)
  const dateStr   = formatSignatureDate()

  useEffect(() => {
    if (canvasRef.current) {
      drawSignaturePreview(canvasRef.current, signerName, dateStr)
    }
  }, [signerName, dateStr])

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="absolute z-20 cursor-grab select-none"
      style={style}
    >
      <canvas ref={canvasRef} className="w-full h-full rounded" />
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center bg-white/80 text-blue-400 hover:text-white hover:bg-blue-500 text-xs transition-colors leading-none"
        aria-label="Supprimer la signature"
      >
        ✕
      </button>
    </div>
  )
}

const SIG_W_PDF = 180
const SIG_H_PDF = 50

export default function SignerPage() {
  const { workflowId, signerId } = useParams()

  const [status, setStatus] = useState('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [docData, setDocData] = useState(null)
  const [pdfData, setPdfData] = useState(null)
  const [fieldValues, setFieldValues] = useState({})
  const [signed, setSigned] = useState(false)
  const [placement, setPlacement] = useState(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setErrorMessage('')
      try {
        const data = await getSignerDocument(workflowId, signerId)
        if (cancelled) return
        setDocData(data)
        const binary = atob(data.pdfBase64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        setPdfData(bytes.buffer)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setErrorMessage(err.message || 'Erreur inattendue.')
        setStatus('error')
      }
    }

    load()
    return () => { cancelled = true }
  }, [workflowId, signerId])

  useEffect(() => {
    if (!docData?.fields) return
    setFieldValues((prev) => {
      const defaults = {}
      docData.fields.forEach((f) => {
        if ((f.fieldType === 'checkbox' || f.fieldType === 'radio') && !(f.fieldName in prev)) {
          defaults[f.fieldName] = f.currentValue || 'false'
        }
      })
      return { ...defaults, ...prev }
    })
  }, [docData])

  useEffect(() => {
    const onDragEnd = () => setIsDragging(false)
    window.addEventListener('dragend', onDragEnd)
    return () => window.removeEventListener('dragend', onDragEnd)
  }, [])

  const handleSignatureDrop = useCallback((pageIndex, cssX, cssY, pageInfo) => {
    const { scale, pageHeightPt, canvasWidth, canvasHeight } = pageInfo
    const wCss = SIG_W_PDF * scale
    const hCss = SIG_H_PDF * scale
    const left = Math.max(0, Math.min(cssX - wCss / 2, canvasWidth - wCss))
    const top  = Math.max(0, Math.min(cssY - hCss / 2, canvasHeight - hCss))
    setPlacement({
      page: pageIndex,
      x: left / scale,
      y: pageHeightPt - (top + hCss) / scale,
      width: SIG_W_PDF,
      height: SIG_H_PDF,
    })
  }, [])

  const handleDragStart = useCallback(() => setIsDragging(true), [])

  const handleFieldChange = useCallback((fieldName, value) => {
    setFieldValues((prev) => {
      const next = { ...prev, [fieldName]: value }
      const field = docData?.fields?.find((f) => f.fieldName === fieldName)
      if (field?.fieldType === 'radio' && value === 'true') {
        docData.fields
          .filter((f) => f.fieldType === 'radio' && f.groupName === field.groupName && f.fieldName !== fieldName)
          .forEach((f) => { next[f.fieldName] = 'false' })
      }
      return next
    })
  }, [docData])

  const handleFillAndSign = useCallback(async () => {
    if (!docData || !placement) return
    await fillAndSign(docData.workflowId, docData.signerName, fieldValues, placement)
    setSigned(true)
  }, [docData, fieldValues, placement])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
          <p className="text-sm text-slate-500">Chargement du document…</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    const isForbidden =
      errorMessage.includes('votre tour') ||
      errorMessage.includes('déjà signé') ||
      errorMessage.includes('inconnu') ||
      errorMessage.includes('attente')

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center space-y-4">
          <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center ${
            isForbidden ? 'bg-amber-50' : 'bg-red-50'
          }`}>
            <AlertTriangle size={28} className={isForbidden ? 'text-amber-500' : 'text-red-500'} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              {isForbidden ? 'Accès non autorisé' : 'Une erreur est survenue'}
            </h1>
            <p className="text-sm text-slate-500 mt-2">{errorMessage}</p>
          </div>
          {isForbidden && (
            <p className="text-xs text-slate-400">
              Signataire : <span className="font-mono text-slate-600">{signerId}</span>
            </p>
          )}
        </div>
      </div>
    )
  }

  const fields = docData?.fields ?? []

  if (signed) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <FileSignature size={16} className="text-indigo-500" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                {docData?.workflowName ?? 'Document à signer'}
              </h1>
              <p className="text-sm text-slate-400">
                Signataire :{' '}
                <span className="font-medium text-slate-700">{docData?.signerName}</span>
              </p>
            </div>
          </div>
        </header>
        <div className="flex justify-center pt-20 px-6">
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Document signé !</h2>
              <p className="text-sm text-slate-500 mt-2">
                Votre signature a été enregistrée avec succès.
              </p>
            </div>
            {docData?.lastSigner && (
              <button
                onClick={() => downloadFinalPdf(docData.workflowId)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
              >
                <Download size={15} />
                Télécharger le document final
              </button>
            )}
            <p className="text-xs text-slate-400">Vous pouvez fermer cette page.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
            <FileSignature size={16} className="text-indigo-500" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              {docData?.workflowName ?? 'Document à signer'}
            </h1>
            <p className="text-sm text-slate-400">
              Signataire :{' '}
              <span className="font-medium text-slate-700">{docData?.signerName}</span>
            </p>
          </div>
        </div>
      </header>

      <div className="flex gap-0 h-[calc(100vh-65px)]">
        <div className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-2">
          {pdfData ? (
            <div className="flex flex-col items-center gap-3">
              <PDFCanvas
                pdfData={pdfData}
                renderOverlay={(pageIndex, pageInfo) => {
                  const { scale, pageHeightPt, canvasWidth, canvasHeight } = pageInfo
                  const pageFields = fields.filter((f) => f.page === pageIndex)
                  const isPlacedOnPage = placement?.page === pageIndex
                  if (pageFields.length === 0 && !isDragging && !isPlacedOnPage) return null

                  const wCss = SIG_W_PDF * scale
                  const hCss = SIG_H_PDF * scale
                  return (
                    <>
                      {pageFields.length > 0 && (
                        <FieldOverlay
                          fields={pageFields}
                          scale={scale}
                          pageHeightPt={pageHeightPt}
                          values={fieldValues}
                          onChange={handleFieldChange}
                        />
                      )}
                      {isDragging && (
                        <div
                          className="absolute inset-0 z-30"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            const rect = e.currentTarget.getBoundingClientRect()
                            handleSignatureDrop(pageIndex, e.clientX - rect.left, e.clientY - rect.top, pageInfo)
                          }}
                        />
                      )}
                      {isPlacedOnPage && (
                        <PlacedSignatureChip
                          signerName={docData?.signerName ?? signerId}
                          style={{
                            left: placement.x * scale,
                            top: (pageHeightPt - placement.y - placement.height) * scale,
                            width: wCss,
                            height: hCss,
                            opacity: isDragging ? 0.35 : 1,
                            pointerEvents: isDragging ? 'none' : 'auto',
                          }}
                          onDragStart={() => setIsDragging(true)}
                          onRemove={() => setPlacement(null)}
                        />
                      )}
                    </>
                  )
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin text-indigo-400" />
              <span className="text-sm">Chargement du PDF…</span>
            </div>
          )}
        </div>

        <div className="w-80 bg-white border-l border-slate-200 flex flex-col">
          <SignaturePanel
            fields={fields}
            values={fieldValues}
            signerName={docData?.signerName ?? signerId}
            workflowName={docData?.workflowName}
            signers={docData?.signers}
            onFillAndSign={handleFillAndSign}
            placement={placement}
            onDragStart={handleDragStart}
            onDragEnd={() => setIsDragging(false)}
          />
        </div>
      </div>
    </div>
  )
}
