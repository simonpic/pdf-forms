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
import { Upload, FileText, CheckCircle, Copy, ExternalLink, Type, SquareCheck, CircleDot } from 'lucide-react'

const TOOLS = [
  { id: 'text',     label: 'Texte',  Icon: Type,        hint: 'Cliquez-glissez sur le PDF pour dessiner un champ texte.' },
  { id: 'checkbox', label: 'Case',   Icon: SquareCheck, hint: 'Cliquez sur le PDF pour placer une case à cocher.' },
  { id: 'radio',    label: 'Radio',  Icon: CircleDot,   hint: 'Cliquez sur le PDF pour placer un bouton radio.' },
]

export default function CreateWorkflow() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [pdfFile, setPdfFile] = useState(null)
  const [pdfData, setPdfData] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [pageInfo, setPageInfo] = useState(null)
  const [workflowName, setWorkflowName] = useState('')
  const [signers, setSigners] = useState([])
  const [fields, setFields] = useState([])
  const [activeTool, setActiveTool] = useState('text')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const fileInputRef = useRef(null)

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
    loadPdf(e.dataTransfer.files[0])
  }, [loadPdf])

  const handleFileInput = (e) => loadPdf(e.target.files[0])

  const handleFieldAdded = useCallback((field) => {
    setFields((prev) => [...prev, field])
  }, [])

  const handleFieldRemoved = (index) => {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

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
          fieldType: f.fieldType ?? 'text',
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          ...(f.groupName ? { groupName: f.groupName } : {}),
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
  // Rendu — page de succès (affiché brièvement avant la redirection)
  // -------------------------------------------------------------------------

  if (result) {
    return (
      <div className="p-8">
        <div className="max-w-xl mx-auto space-y-4">
          <div className="flex items-center gap-3 text-emerald-700">
            <CheckCircle size={28} />
            <div>
              <h1 className="text-xl font-bold">Workflow créé !</h1>
              <p className="text-sm text-emerald-600">ID : {result.workflowId}</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>URLs des signataires</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-500">
                Partagez ces liens avec chaque signataire dans l&apos;ordre indiqué :
              </p>
              {result.signers
                .sort((a, b) => a.order - b.order)
                .map((signer) => {
                  const url = `${window.location.origin}/${result.workflowId}/signature/${signer.signerId}`
                  return (
                    <div
                      key={signer.signerId}
                      className="flex items-center gap-2 p-3 bg-slate-50 rounded-md border border-slate-100"
                    >
                      <Badge className="bg-indigo-100 text-indigo-700 shrink-0">#{signer.order}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{signer.name}</p>
                        <p className="text-xs text-indigo-600 font-mono truncate">{url}</p>
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(url)}
                        className="text-slate-400 hover:text-slate-600 shrink-0"
                        title="Copier le lien"
                      >
                        <Copy size={14} />
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-indigo-600 shrink-0"
                        title="Ouvrir"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  )
                })}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Rendu — formulaire de création
  // -------------------------------------------------------------------------

  return (
    <div>
      {/* Sous-header de la page */}
      <header className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              Nouveau workflow de signature
            </h1>
            <p className="text-sm text-slate-400">
              Uploadez un PDF, dessinez les champs et assignez-les aux signataires.
            </p>
          </div>

          {/* Nom du fichier chargé */}
          {pdfData && (
            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 shrink-0">
              <FileText size={14} className="text-indigo-500 shrink-0" />
              <span className="font-medium max-w-56 truncate">{pdfFile?.name}</span>
              <button
                onClick={() => { setPdfFile(null); setPdfData(null); setFields([]) }}
                className="text-slate-400 hover:text-red-500 ml-1 shrink-0"
                title="Retirer le PDF"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex h-[calc(100vh-121px)]">
        {/* Sidebar verticale — outils de champ (visible uniquement avec un PDF chargé) */}
        {pdfData && (
          <div className="w-12 bg-white border-r border-slate-200 flex flex-col items-center pt-4 pb-3 gap-1 shrink-0">
            {TOOLS.map(({ id, label, Icon }) => (
              <button
                key={id}
                title={label}
                onClick={() => setActiveTool(id)}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                  activeTool === id
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        )}

        {/* Zone canvas PDF */}
        <div className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-6">
          {!pdfData ? (
            <div
              className={`w-full max-w-lg h-80 flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer
                ${dragging
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-3">
                <Upload size={28} className="text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">Glissez un PDF ici</p>
              <p className="text-xs text-slate-400 mt-1">ou cliquez pour sélectionner</p>
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
                      activeTool={activeTool}
                    />
                  ) : null
                }
              />
              {!pageInfo && (
                <p className="text-xs text-slate-400">Chargement du PDF…</p>
              )}
            </div>
          )}
        </div>

        {/* Panneau droit — configuration */}
        <div className="w-80 bg-white border-l border-slate-200 flex flex-col">
          {/* Zone scrollable — formulaire */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

            <SignerList signers={signers} onChange={setSigners} />

            <FieldList fields={fields} onRemove={handleFieldRemoved} />

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Footer fixe — bouton de soumission */}
          <div className="border-t border-slate-200 p-4 space-y-2">
            <Button
              className="w-full bg-indigo-500 hover:bg-indigo-600"
              disabled={
                submitting || !pdfFile || !workflowName.trim() ||
                signers.length === 0 || fields.length === 0
              }
              onClick={handleSubmit}
            >
              {submitting ? 'Création en cours…' : 'Créer le workflow'}
            </Button>

            {pdfData && signers.length > 0 && (
              <p className="text-xs text-slate-400 text-center">
                {TOOLS.find((t) => t.id === activeTool)?.hint}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
