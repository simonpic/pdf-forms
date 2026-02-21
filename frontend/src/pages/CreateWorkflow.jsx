import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import PDFCanvas from '../components/PDFCanvas'
import FieldDrawingLayer from '../components/FieldDrawingLayer'
import FieldList from '../components/FieldList'
import SignerList from '../components/SignerList'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { createWorkflow } from '../api/workflowApi'
import { Upload, FileText, CheckCircle, Copy, ExternalLink } from 'lucide-react'

export default function CreateWorkflow() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // État du PDF uploadé
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfData, setPdfData] = useState(null) // ArrayBuffer pour PDF.js
  const [dragging, setDragging] = useState(false)

  // Métriques de la page PDF (issues de PDF.js)
  const [pageInfo, setPageInfo] = useState(null)

  // Données du formulaire
  const [workflowName, setWorkflowName] = useState('')
  const [signers, setSigners] = useState([])
  const [fields, setFields] = useState([])

  // État de la soumission
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const fileInputRef = useRef(null)

  // -------------------------------------------------------------------------
  // Upload du PDF
  // -------------------------------------------------------------------------

  const loadPdf = useCallback((file) => {
    if (!file || file.type !== 'application/pdf') {
      alert('Veuillez sélectionner un fichier PDF.')
      return
    }
    setPdfFile(file)
    setFields([])
    setResult(null)

    const reader = new FileReader()
    reader.onload = (e) => setPdfData(e.target.result)
    reader.readAsArrayBuffer(file)
  }, [])

  const handleFileDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    loadPdf(file)
  }, [loadPdf])

  const handleFileInput = (e) => loadPdf(e.target.files[0])

  // -------------------------------------------------------------------------
  // Gestion des champs
  // -------------------------------------------------------------------------

  const handleFieldAdded = useCallback((field) => {
    setFields((prev) => [...prev, field])
  }, [])

  const handleFieldRemoved = (index) => {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  // -------------------------------------------------------------------------
  // Soumission du workflow
  // -------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!pdfFile) return alert('Veuillez uploader un PDF.')
    if (!workflowName.trim()) return alert('Veuillez nommer le workflow.')
    if (signers.length === 0) return alert('Ajoutez au moins un signataire.')
    if (fields.length === 0) return alert('Dessinez au moins un champ.')

    setSubmitting(true)
    setError(null)

    try {
      const data = {
        name: workflowName.trim(),
        signers: signers.map((s) => ({ name: s.name, order: s.order })),
        fields: fields.map((f) => ({
          fieldName: f.fieldName,
          assignedTo: f.assignedTo,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
        })),
      }

      const response = await createWorkflow(pdfFile, data)
      setResult(response)
      await queryClient.invalidateQueries({ queryKey: ['workflows'] })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Rendu — page de succès
  // -------------------------------------------------------------------------

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-xl mx-auto space-y-4">
          <div className="flex items-center gap-3 text-green-700">
            <CheckCircle size={28} />
            <div>
              <h1 className="text-xl font-bold">Workflow créé !</h1>
              <p className="text-sm text-green-600">ID : {result.workflowId}</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>URLs des signataires</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-500">
                Partagez ces liens avec chaque signataire dans l&apos;ordre indiqué :
              </p>
              {result.signers
                .sort((a, b) => a.order - b.order)
                .map((signer) => {
                  const url = `${window.location.origin}/${result.workflowId}/signature/${signer.signerId}`
                  return (
                    <div
                      key={signer.signerId}
                      className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border"
                    >
                      <Badge variant="secondary">#{signer.order}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{signer.name}</p>
                        <p className="text-xs text-blue-600 font-mono truncate">{url}</p>
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(url)}
                        className="text-gray-400 hover:text-gray-600 shrink-0"
                        title="Copier le lien"
                      >
                        <Copy size={14} />
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-400 hover:text-blue-600 shrink-0"
                        title="Ouvrir"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  )
                })}
            </CardContent>
          </Card>

          <Button
            variant="outline"
            onClick={() => {
              setResult(null)
              setPdfFile(null)
              setPdfData(null)
              setSigners([])
              setFields([])
              setWorkflowName('')
            }}
          >
            Créer un nouveau workflow
          </Button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Rendu — formulaire de création
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-bold text-gray-900">
          Création d&apos;un workflow de signature PDF
        </h1>
        <p className="text-sm text-gray-500">
          Uploadez un PDF, dessinez les champs et assignez-les aux signataires.
        </p>
      </header>

      <div className="flex gap-0 h-[calc(100vh-73px)]">
        {/* Panneau gauche — canvas PDF */}
        <div className="flex-1 overflow-auto bg-gray-100 flex items-start justify-center p-6">
          {!pdfData ? (
            /* Zone de drop */
            <div
              className={`w-full max-w-lg h-80 flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer
                ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={40} className="text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-600">Glissez un PDF ici</p>
              <p className="text-xs text-gray-400 mt-1">ou cliquez pour sélectionner</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-white px-3 py-1.5 rounded-full border">
                <FileText size={14} />
                <span className="font-medium">{pdfFile?.name}</span>
                <button
                  onClick={() => { setPdfFile(null); setPdfData(null); setFields([]) }}
                  className="text-gray-400 hover:text-red-500 ml-1"
                >
                  ✕
                </button>
              </div>

              {/* Canvas PDF + couche de dessin */}
              <PDFCanvas
                pdfData={pdfData}
                onPageInfo={setPageInfo}
                overlay={
                  pageInfo ? (
                    <FieldDrawingLayer
                      scale={pageInfo.scale}
                      pageHeightPt={pageInfo.pageHeightPt}
                      signers={signers}
                      fields={fields}
                      onFieldAdded={handleFieldAdded}
                    />
                  ) : null
                }
              />

              {!pageInfo && (
                <p className="text-xs text-gray-400">Chargement du PDF…</p>
              )}
            </div>
          )}
        </div>

        {/* Panneau droit — configuration */}
        <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto p-4 space-y-4">
          {/* Nom du workflow */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              <Label htmlFor="workflow-name">Nom du workflow</Label>
              <Input
                id="workflow-name"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder="Ex: Contrat de vente"
              />
            </CardContent>
          </Card>

          {/* Signataires */}
          <SignerList signers={signers} onChange={setSigners} />

          {/* Champs */}
          <FieldList fields={fields} onRemove={handleFieldRemoved} />

          {/* Erreur */}
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Bouton de soumission */}
          <Button
            className="w-full"
            disabled={
              submitting || !pdfFile || !workflowName.trim() ||
              signers.length === 0 || fields.length === 0
            }
            onClick={handleSubmit}
          >
            {submitting ? 'Création en cours…' : 'Créer le workflow'}
          </Button>

          {/* Aide */}
          {pdfData && signers.length > 0 && (
            <p className="text-xs text-gray-400 text-center">
              Cliquez-glissez sur le PDF pour dessiner des champs, puis assignez-les à un signataire.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
