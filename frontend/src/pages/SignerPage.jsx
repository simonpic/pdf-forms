import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import PDFCanvas from '../components/PDFCanvas'
import FieldOverlay from '../components/FieldOverlay'
import SignaturePanel from '../components/SignaturePanel'
import { getSignerDocument, fillFields, signDocument } from '../api/workflowApi'
import { AlertTriangle, Loader2, FileSignature } from 'lucide-react'

export default function SignerPage() {
  const { workflowId, signerId } = useParams()

  const [status, setStatus] = useState('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [docData, setDocData] = useState(null)
  const [pdfData, setPdfData] = useState(null)
  const [pageInfo, setPageInfo] = useState(null)
  const [fieldValues, setFieldValues] = useState({})

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

  const handleFieldChange = useCallback((fieldName, value) => {
    setFieldValues((prev) => ({ ...prev, [fieldName]: value }))
  }, [])

  const handleFill = useCallback(async () => {
    if (!docData) return
    await fillFields(docData.workflowId, docData.signerName, fieldValues)
  }, [docData, fieldValues])

  const handleSign = useCallback(async () => {
    if (!docData) return
    await signDocument(docData.workflowId, docData.signerName)
  }, [docData])

  // Chargement
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

  // Erreur
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

  // Document prêt
  const fields = docData?.fields ?? []

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
            <FileSignature size={16} className="text-indigo-500" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">Document à signer</h1>
            <p className="text-sm text-slate-400">
              Signataire :{' '}
              <span className="font-medium text-slate-700">{docData?.signerName}</span>
              <span className="font-mono text-xs text-slate-400 ml-1.5">{docData?.signerId}</span>
            </p>
          </div>
        </div>
      </header>

      <div className="flex gap-0 h-[calc(100vh-65px)]">
        {/* Zone principale — PDF */}
        <div className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-6">
          {pdfData ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                Remplissez les champs surlignés, puis signez.
              </p>
              <PDFCanvas
                pdfData={pdfData}
                onPageInfo={setPageInfo}
                overlay={
                  pageInfo && fields.length > 0 ? (
                    <FieldOverlay
                      fields={fields}
                      scale={pageInfo.scale}
                      pageHeightPt={pageInfo.pageHeightPt}
                      values={fieldValues}
                      onChange={handleFieldChange}
                    />
                  ) : null
                }
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin text-indigo-400" />
              <span className="text-sm">Chargement du PDF…</span>
            </div>
          )}
        </div>

        {/* Panneau droit — signature */}
        <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto p-4">
          <SignaturePanel
            fields={fields}
            values={fieldValues}
            signerName={docData?.signerName ?? signerId}
            onFill={handleFill}
            onSign={handleSign}
          />
        </div>
      </div>
    </div>
  )
}
