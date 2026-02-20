import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import PDFCanvas from '../components/PDFCanvas'
import FieldOverlay from '../components/FieldOverlay'
import SignaturePanel from '../components/SignaturePanel'
import { getSignerDocument, fillFields, signDocument } from '../api/workflowApi'
import { AlertTriangle, Loader2, FileText } from 'lucide-react'

/**
 * Page de signature pour un signataire.
 * URL : /signature/:signerName
 *
 * Flux :
 * 1. GET /api/workflows/signer/:signerName
 * 2. Si 403 → affiche message d'erreur
 * 3. Si ok → affiche PDF aplati + inputs pour les champs du signataire
 * 4. Signer POST /fill puis POST /sign
 */
export default function SignerPage() {
  const { signerName } = useParams()

  const [status, setStatus] = useState('loading') // 'loading' | 'error' | 'ready'
  const [errorMessage, setErrorMessage] = useState('')
  const [docData, setDocData] = useState(null)   // { workflowId, signerName, signerId, pdfBase64, fields }
  const [pdfData, setPdfData] = useState(null)   // ArrayBuffer pour PDF.js
  const [pageInfo, setPageInfo] = useState(null)
  const [fieldValues, setFieldValues] = useState({})

  // -------------------------------------------------------------------------
  // Chargement du document
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setErrorMessage('')

      try {
        const data = await getSignerDocument(signerName)
        if (cancelled) return

        setDocData(data)

        // Décoder le PDF base64 en ArrayBuffer pour PDF.js
        const binary = atob(data.pdfBase64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
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
  }, [signerName])

  // -------------------------------------------------------------------------
  // Gestion des champs
  // -------------------------------------------------------------------------

  const handleFieldChange = useCallback((fieldName, value) => {
    setFieldValues((prev) => ({ ...prev, [fieldName]: value }))
  }, [])

  // -------------------------------------------------------------------------
  // Remplissage et signature
  // -------------------------------------------------------------------------

  const handleFill = useCallback(async () => {
    if (!docData) return
    await fillFields(docData.workflowId, signerName, fieldValues)
  }, [docData, signerName, fieldValues])

  const handleSign = useCallback(async () => {
    if (!docData) return
    await signDocument(docData.workflowId, signerName)
  }, [docData, signerName])

  // -------------------------------------------------------------------------
  // Rendu — Chargement
  // -------------------------------------------------------------------------

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm">Chargement du document…</p>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Rendu — Erreur (403 ou autre)
  // -------------------------------------------------------------------------

  if (status === 'error') {
    const isForbidden =
      errorMessage.includes('votre tour') ||
      errorMessage.includes('déjà signé') ||
      errorMessage.includes('inconnu') ||
      errorMessage.includes('attente')

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center space-y-4">
          <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
            isForbidden ? 'bg-amber-100' : 'bg-red-100'
          }`}>
            <AlertTriangle size={32} className={isForbidden ? 'text-amber-600' : 'text-red-600'} />
          </div>

          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {isForbidden ? 'Accès non autorisé' : 'Une erreur est survenue'}
            </h1>
            <p className="text-sm text-gray-600 mt-2">{errorMessage}</p>
          </div>

          {isForbidden && (
            <p className="text-xs text-gray-400">
              Signataire : <span className="font-mono">{signerName}</span>
            </p>
          )}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Rendu — Document prêt à signer
  // -------------------------------------------------------------------------

  const fields = docData?.fields ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText size={20} className="text-blue-600" />
          <div>
            <h1 className="text-base font-bold text-gray-900">
              Document à signer
            </h1>
            <p className="text-sm text-gray-500">
              Signataire : <span className="font-medium text-gray-700">{docData?.signerName}</span>
              {' · '}
              <span className="font-mono text-xs text-gray-400">{docData?.signerId}</span>
            </p>
          </div>
        </div>
      </header>

      <div className="flex gap-0 h-[calc(100vh-73px)]">
        {/* Zone principale — PDF + champs */}
        <div className="flex-1 overflow-auto bg-gray-100 flex items-start justify-center p-6">
          {pdfData ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-gray-500 bg-white px-3 py-1 rounded-full border">
                Remplissez les champs surlignés en bleu, puis signez.
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
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Chargement du PDF…</span>
            </div>
          )}
        </div>

        {/* Panneau droit — signature */}
        <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto p-4">
          <SignaturePanel
            fields={fields}
            values={fieldValues}
            signerName={docData?.signerName ?? signerName}
            onFill={handleFill}
            onSign={handleSign}
          />
        </div>
      </div>
    </div>
  )
}
