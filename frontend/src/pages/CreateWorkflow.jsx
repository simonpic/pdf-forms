import { useState, useCallback, useRef, useEffect } from 'react'
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
import { createWorkflow, analyzePdf } from '../api/workflowApi'
import {
  Upload, FileText, Type, SquareCheck, CircleDot,
  CheckCircle2, Circle, Loader2, AlertCircle,
} from 'lucide-react'

const TOOLS = [
  { id: 'text',     label: 'Texte',  Icon: Type,        hint: 'Cliquez-glissez sur le PDF pour dessiner un champ texte.' },
  { id: 'checkbox', label: 'Case',   Icon: SquareCheck, hint: 'Cliquez sur le PDF pour placer une case à cocher.' },
  { id: 'radio',    label: 'Radio',  Icon: CircleDot,   hint: 'Cliquez sur le PDF pour placer un bouton radio.' },
]

// Phase de chargement séquentielle :
//   null       → pas de fichier, ou tout est prêt (outils disponibles)
//   'rendering' → PDF.js en cours de rendu (skeleton affiché)
//   'analyzing' → rendu terminé, analyse AcroForm en cours (PDF visible)
//   'ready'     → tout terminé, message de succès affiché 2,5s puis null

export default function CreateWorkflow() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [pdfFile, setPdfFile]           = useState(null)
  const [pdfData, setPdfData]           = useState(null)
  const [loadingPhase, setLoadingPhase] = useState(null)
  const [fileError, setFileError]       = useState(null)
  const [dragging, setDragging]         = useState(false)
  const [pagesInfo, setPagesInfo]       = useState(null)
  const [importedFieldsPdf, setImportedFieldsPdf] = useState(null)
  const [workflowName, setWorkflowName] = useState('')
  const [signers, setSigners]           = useState([])
  const [fields, setFields]             = useState([])
  const [activeTool, setActiveTool]     = useState('text')
  const [submitting, setSubmitting]     = useState(false)
  const [result, setResult]             = useState(null)
  const [error, setError]               = useState(null)

  const fileInputRef   = useRef(null)
  const pdfFileRef     = useRef(null)  // accès au fichier depuis handlePagesInfo
  const readyTimerRef  = useRef(null)

  const resetPdf = () => {
    clearTimeout(readyTimerRef.current)
    setPdfFile(null)
    setPdfData(null)
    setLoadingPhase(null)
    setFileError(null)
    setFields([])
    setPagesInfo(null)
    setImportedFieldsPdf(null)
    setResult(null)
    pdfFileRef.current = null
  }

  const loadPdf = useCallback((file) => {
    if (!file || file.type !== 'application/pdf') {
      setFileError('Le fichier sélectionné n\'est pas un PDF valide.')
      return
    }

    clearTimeout(readyTimerRef.current)
    setFileError(null)
    setPdfFile(file)
    pdfFileRef.current = file
    setLoadingPhase('rendering')
    setFields([])
    setPagesInfo(null)
    setImportedFieldsPdf(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (e) => setPdfData(e.target.result)
    reader.readAsArrayBuffer(file)
  }, [])

  // Déclenché par PDFCanvas quand toutes les pages sont rendues.
  // Lance l'analyse AcroForm en séquentiel.
  const handlePagesInfo = useCallback(async (info) => {
    setPagesInfo(info)
    setLoadingPhase('analyzing')

    try {
      const { fields: detected } = await analyzePdf(pdfFileRef.current)
      setImportedFieldsPdf(detected)
    } catch {
      setImportedFieldsPdf([])
    }

    setLoadingPhase('ready')
    readyTimerRef.current = setTimeout(() => setLoadingPhase(null), 1250)
  }, [])

  const handleFileDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    loadPdf(e.dataTransfer.files[0])
  }, [loadPdf])

  const handleFileInput = (e) => loadPdf(e.target.files[0])

  const handleFieldAdded      = useCallback((field)          => setFields((prev) => [...prev, field]), [])
  const handleFieldReassigned = useCallback((index, updates) => setFields((prev) => prev.map((f, i) => i === index ? { ...f, ...updates } : f)), [])
  const handleFieldMoved      = useCallback((index, updates) => setFields((prev) => prev.map((f, i) => i === index ? { ...f, ...updates } : f)), [])
  const handleFieldRemoved    = (index) => setFields((prev) => prev.filter((_, i) => i !== index))

  // Conversion coords PDF → canvas quand les deux sources sont disponibles
  useEffect(() => {
    if (!pagesInfo || !importedFieldsPdf || importedFieldsPdf.length === 0) return
    const converted = importedFieldsPdf.map((f) => {
      const info = pagesInfo[f.page] ?? pagesInfo[0]
      const { scale, pageHeightPt } = info
      return {
        fieldType: f.fieldType,
        fieldName: f.fieldName,
        assignedTo: '',
        signerName: null,
        signerIndex: -1,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        ...(f.groupName ? { groupName: f.groupName } : {}),
        canvasRect: {
          x: f.x * scale,
          y: (pageHeightPt - f.y - f.height) * scale,
          width: f.width * scale,
          height: f.height * scale,
        },
      }
    })
    setFields(converted)
  }, [pagesInfo, importedFieldsPdf])

  const handleSubmit = async () => {
    if (!pdfFile || !workflowName.trim() || signers.length === 0) return

    setSubmitting(true)
    setError(null)

    try {
      const data = {
        name: workflowName.trim(),
        signers: signers.map((s) => ({ name: s.name, order: s.order })),
        fields: fields.map((f) => ({
          fieldName: f.fieldName,
          label: f.label || '',
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

  const isLoading      = loadingPhase !== null
  const isReady        = !isLoading && !!pdfFile
  const toolsDisabled  = loadingPhase === 'rendering' || loadingPhase === 'analyzing'

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  return (
    <div>
      {/* Sous-header */}
      <header className="relative z-50 bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              Nouveau workflow de signature
            </h1>
            <p className="text-sm text-slate-400">
              Uploadez un PDF, dessinez les champs et assignez-les aux signataires.
            </p>
          </div>

          {pdfFile && (
            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 shrink-0">
              <FileText size={14} className="text-indigo-500 shrink-0" />
              <span className="font-medium max-w-56 truncate">{pdfFile.name}</span>
              <button
                onClick={resetPdf}
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
        {/* Sidebar outils — visible dès qu'un fichier est chargé, désactivée pendant le chargement */}
        {pdfFile && (
          <div className="relative z-50 w-12 bg-white border-r border-slate-200 flex flex-col items-center pt-4 pb-3 gap-1 shrink-0">
            {TOOLS.map(({ id, label, Icon, hint }) => (
              <Tooltip key={id} content={hint} side="right">
                <button
                  aria-label={label}
                  disabled={toolsDisabled}
                  onClick={() => setActiveTool(id)}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                    toolsDisabled
                      ? 'text-slate-300 cursor-not-allowed'
                      : activeTool === id
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

        {/* Zone canvas */}
        <div className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-6">
          {!pdfFile ? (
            /* — Dropzone — */
            <div
              className={`w-full max-w-lg flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer gap-1
                ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'}
                ${fileError ? 'pb-5 pt-10' : 'h-80'}
              `}
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
              {fileError && (
                <div className="mt-4 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
                  {fileError}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          ) : (
            <>
              {/* — Skeleton phase 'rendering' — */}
              {loadingPhase === 'rendering' && (
                <div
                  className="flex flex-col items-center gap-4"
                  aria-busy="true"
                  aria-label="Chargement du PDF en cours"
                >
                  <p className="text-xs text-slate-500 bg-white px-4 py-2 rounded-full border border-indigo-100 shadow-sm font-medium flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin text-indigo-400" aria-hidden="true" />
                    Chargement de votre fichier PDF…
                  </p>
                  <div className="w-[612px] max-w-full bg-white shadow-md rounded overflow-hidden">
                    <div className="animate-pulse bg-slate-200" style={{ aspectRatio: '1 / 1.414' }} />
                  </div>
                </div>
              )}

              {/* — PDF Canvas — monté dès que pdfData est disponible (PDF.js charge en arrière-plan),
                    masqué pendant le skeleton, visible dès la phase 'analyzing' — */}
              <div className={`flex flex-col items-center gap-3 ${loadingPhase === 'rendering' ? 'hidden' : ''}`}>

                {/* Pill de statut — phases 'analyzing' et 'ready' */}
                {(loadingPhase === 'analyzing' || loadingPhase === 'ready') && (
                  <p
                    className={`text-xs px-4 py-2 rounded-full border shadow-sm font-medium flex items-center gap-2 ${
                      loadingPhase === 'ready'
                        ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                        : 'bg-white border-indigo-100 text-slate-500'
                    }`}
                    role="status"
                  >
                    {loadingPhase === 'ready' ? (
                      <>
                        <CheckCircle2 size={12} className="text-emerald-500 shrink-0" aria-hidden="true" />
                        Votre document est prêt
                      </>
                    ) : (
                      <>
                        <Loader2 size={12} className="animate-spin text-indigo-400 shrink-0" aria-hidden="true" />
                        Récupération des champs…
                      </>
                    )}
                  </p>
                )}

                {pdfData && (
                  <PDFCanvas
                    pdfData={pdfData}
                    onPagesInfo={handlePagesInfo}
                    renderOverlay={(pageIndex, pageInfo) => (
                      <FieldDrawingLayer
                        currentPage={pageIndex}
                        scale={pageInfo.scale}
                        pageHeightPt={pageInfo.pageHeightPt}
                        signers={signers}
                        fields={fields}
                        onFieldAdded={handleFieldAdded}
                        onFieldReassigned={handleFieldReassigned}
                        onFieldMoved={handleFieldMoved}
                        onFieldRemoved={handleFieldRemoved}
                        activeTool={activeTool}
                        disabled={toolsDisabled}
                      />
                    )}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Panneau droit — configuration */}
        <div className="relative z-50 w-80 bg-white border-l border-slate-200 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

          {/* Footer fixe */}
          <div className="border-t border-slate-200 p-4 space-y-3">
            {(() => {
              const prereqs = [
                { label: 'PDF chargé',            done: isReady },
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
              disabled={submitting || !isReady || !workflowName.trim() || signers.length === 0}
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
