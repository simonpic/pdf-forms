import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import PDFCanvas from '../components/PDFCanvas'
import FieldDrawingLayer from '../components/FieldDrawingLayer'
import SignerList from '../components/SignerList'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent } from '../components/ui/card'
import { Tooltip } from '../components/ui/tooltip'
import { createWorkflow } from '../api/workflowApi'
import { Upload, FileText, Type, SquareCheck, CircleDot, CheckCircle2, Circle } from 'lucide-react'

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

  const handleFieldReassigned = useCallback((index, updates) => {
    setFields((prev) => prev.map((f, i) => i === index ? { ...f, ...updates } : f))
  }, [])

  const handleFieldMoved = useCallback((index, updates) => {
    setFields((prev) => prev.map((f, i) => i === index ? { ...f, ...updates } : f))
  }, [])

  const handleFieldRemoved = (index) => {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!pdfFile) return alert('Veuillez uploader un PDF.')
    if (!workflowName.trim()) return alert('Veuillez nommer le workflow.')
    if (signers.length === 0) return alert('Ajoutez au moins un signataire.')

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
            {TOOLS.map(({ id, label, Icon, hint }) => (
              <Tooltip key={id} content={hint} side="right">
                <button
                  aria-label={label}
                  onClick={() => setActiveTool(id)}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                    activeTool === id
                      ? 'bg-indigo-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={16} />
                </button>
              </Tooltip>
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
                      onFieldReassigned={handleFieldReassigned}
                      onFieldMoved={handleFieldMoved}
                      onFieldRemoved={handleFieldRemoved}
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

{error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Footer fixe — bouton de soumission */}
          <div className="border-t border-slate-200 p-4 space-y-3">
            {/* Checklist de prérequis */}
            {(() => {
              const prereqs = [
                { label: 'PDF chargé',            done: !!pdfFile },
                { label: 'Nom du workflow',        done: !!workflowName.trim() },
                { label: 'Au moins un signataire', done: signers.length > 0 },
              ]
              const allDone = prereqs.every((p) => p.done)
              if (allDone) return null
              return (
                <ul className="space-y-1">
                  {prereqs.map(({ label, done }) => (
                    <li key={label} className="flex items-center gap-2">
                      {done
                        ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                        : <Circle       size={13} className="text-slate-300 shrink-0" />
                      }
                      <span className={`text-xs ${done ? 'text-slate-400 line-through' : 'text-slate-500'}`}>
                        {label}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            })()}

            <Button
              className="w-full bg-indigo-500 hover:bg-indigo-600"
              disabled={
                submitting || !pdfFile || !workflowName.trim() ||
                signers.length === 0
              }
              onClick={handleSubmit}
            >
              {submitting ? 'Création en cours…' : 'Créer le workflow'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
