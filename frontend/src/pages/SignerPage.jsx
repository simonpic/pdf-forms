import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import PDFCanvas from '../components/PDFCanvas'
import FieldOverlay from '../components/FieldOverlay'
import SignaturePanel from '../components/SignaturePanel'
import { getSignerDocument, fillAndSign } from '../api/workflowApi'
import { AlertTriangle, Loader2, FileSignature } from 'lucide-react'

export default function SignerPage() {
  const { workflowId, signerId } = useParams()

  const [status, setStatus] = useState('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [docData, setDocData] = useState(null)
  const [pdfData, setPdfData] = useState(null)
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

  // Initialise les valeurs par défaut pour checkbox/radio dès que docData est disponible
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

  const handleFieldChange = useCallback((fieldName, value) => {
    setFieldValues((prev) => {
      const next = { ...prev, [fieldName]: value }

      // Exclusion mutuelle : désélectionner les autres radios du même groupe
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
    if (!docData) return
    await fillAndSign(docData.workflowId, docData.signerName, fieldValues)
  }, [docData, fieldValues])

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
        {/* Zone principale — PDF */}
        <div className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-6">
          {pdfData ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-slate-600 bg-white px-4 py-2 rounded-full border border-indigo-100 shadow-sm font-medium">
                {fields.length > 0
                  ? 'Remplissez les champs mis en évidence dans le document, puis signez dans le panneau à droite.'
                  : 'Consultez le document ci-dessous, puis signez dans le panneau à droite.'}
              </p>
              <PDFCanvas
                pdfData={pdfData}
                renderOverlay={(pageIndex, pageInfo) => {
                  const pageFields = fields.filter((f) => f.page === pageIndex)
                  if (pageFields.length === 0) return null
                  return (
                    <FieldOverlay
                      fields={pageFields}
                      scale={pageInfo.scale}
                      pageHeightPt={pageInfo.pageHeightPt}
                      values={fieldValues}
                      onChange={handleFieldChange}
                    />
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

        {/* Panneau droit — signature */}
        <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto p-4">
          <SignaturePanel
            fields={fields}
            values={fieldValues}
            signerName={docData?.signerName ?? signerId}
            workflowName={docData?.workflowName}
            onFillAndSign={handleFillAndSign}
          />
        </div>
      </div>
    </div>
  )
}
