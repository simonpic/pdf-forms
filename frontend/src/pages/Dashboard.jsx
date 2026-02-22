import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { FileText, FolderOpen, Clock, Loader2, PenLine, CheckCircle2, Download, ExternalLink, PlusCircle } from 'lucide-react'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { fetchWorkflows, downloadWorkflowPdf } from '../api/workflows'

const STATUS_BADGE = {
  DRAFT: <Badge className="bg-slate-100 text-slate-600">Brouillon</Badge>,
  IN_PROGRESS: <Badge className="bg-amber-100 text-amber-700">En cours</Badge>,
  COMPLETED: <Badge className="bg-emerald-100 text-emerald-700">Complété</Badge>,
}

const STATUS_BORDER = {
  DRAFT: 'border-l-slate-300',
  IN_PROGRESS: 'border-l-amber-400',
  COMPLETED: 'border-l-emerald-400',
}

const SIGNER_ICON = {
  PENDING:     <Clock       size={13} className="text-slate-300 shrink-0" />,
  IN_PROGRESS: <PenLine     size={13} className="text-amber-500 shrink-0" />,
  SIGNED:      <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />,
}

function formatDate(iso) {
  return format(new Date(iso), 'd MMM yyyy', { locale: fr })
}

function formatRelative(iso) {
  return formatDistanceToNow(new Date(iso), { locale: fr, addSuffix: true })
}

function WorkflowCard({ workflow }) {
  const createdStr  = formatDate(workflow.createdAt)
  const showUpdated = workflow.createdAt !== workflow.updatedAt

  return (
    <Card className={`p-3 space-y-2 border-l-4 ${STATUS_BORDER[workflow.status]}`}>
      {/* Ligne 1 : nom + badge + bouton télécharger */}
      <div className="flex items-center gap-2">
        <p className="font-medium text-sm text-slate-900 truncate flex-1">{workflow.name}</p>
        {STATUS_BADGE[workflow.status]}
        {workflow.status === 'COMPLETED' && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1 h-6 px-2 text-xs shrink-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={() => downloadWorkflowPdf(workflow.id, `${workflow.name}.pdf`)}
          >
            <Download size={12} />
            Télécharger
          </Button>
        )}
      </div>

      {/* Ligne 2 : fichier + dates */}
      <div className="flex items-center gap-3 text-xs text-slate-400 min-w-0">
        <span className="flex items-center gap-1 truncate">
          <FileText size={11} className="shrink-0" />
          {workflow.pdfOriginalName}
        </span>
        <span className="shrink-0" title={showUpdated ? `Modifié le ${formatDate(workflow.updatedAt)}` : undefined}>
          {createdStr}
          {showUpdated && (
            <span className="text-slate-300"> · modifié {formatRelative(workflow.updatedAt)}</span>
          )}
        </span>
      </div>

      {/* Signataires */}
      <div className="space-y-1">
        {[...workflow.signers]
          .sort((a, b) => a.order - b.order)
          .map((signer) => (
            <div key={signer.order} className="flex items-center gap-1.5 text-xs">
              {SIGNER_ICON[signer.status]}
              <span className="text-slate-700 truncate flex-1">{signer.name}</span>
              {signer.status === 'IN_PROGRESS' && (
                <a
                  href={`${window.location.origin}/${workflow.id}/signature/${signer.signerId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors shrink-0"
                >
                  <ExternalLink size={11} />
                  Ouvrir
                </a>
              )}
            </div>
          ))}
      </div>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
        <FolderOpen size={32} className="text-indigo-400" />
      </div>
      <p className="text-slate-600 font-medium mb-1">Aucun workflow pour le moment</p>
      <p className="text-slate-400 text-sm">Créez votre premier workflow via le bouton ci-dessus.</p>
    </div>
  )
}

const TAB_ALL = 'all'

export default function Dashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(TAB_ALL)

  const { data: workflows = [], isLoading, isError } = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  })

  const sorted = [...workflows].sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  )

  const counts = {
    IN_PROGRESS: sorted.filter((w) => w.status === 'IN_PROGRESS').length,
    COMPLETED:   sorted.filter((w) => w.status === 'COMPLETED').length,
    DRAFT:       sorted.filter((w) => w.status === 'DRAFT').length,
  }

  const filtered =
    activeTab === TAB_ALL ? sorted : sorted.filter((w) => w.status === activeTab)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-indigo-400" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-20 text-red-500 text-sm">
        Erreur lors du chargement des workflows.
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header de page */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Mes workflows</h1>
        <Button
          className="gap-1.5 bg-indigo-500 hover:bg-indigo-600"
          onClick={() => navigate('/workflow/new')}
        >
          <PlusCircle size={16} />
          Nouveau workflow
        </Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value={TAB_ALL}>Tous ({sorted.length})</TabsTrigger>
              <TabsTrigger value="IN_PROGRESS">En cours ({counts.IN_PROGRESS})</TabsTrigger>
              <TabsTrigger value="COMPLETED">Complétés ({counts.COMPLETED})</TabsTrigger>
              {counts.DRAFT > 0 && (
                <TabsTrigger value="DRAFT">Brouillons ({counts.DRAFT})</TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          {filtered.length === 0 ? (
            <p className="text-center text-slate-400 py-12 text-sm">
              Aucun workflow dans cette catégorie.
            </p>
          ) : (
            <div className="grid gap-3">
              {filtered.map((w) => (
                <WorkflowCard key={w.id} workflow={w} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
