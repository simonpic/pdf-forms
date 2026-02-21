import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { FileText, FolderOpen, Clock, Loader2, CheckCircle2, Download } from 'lucide-react'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Progress } from '../components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { fetchWorkflows, downloadWorkflowPdf } from '../api/workflows'

const STATUS_BADGE = {
  DRAFT: <Badge variant="secondary">Brouillon</Badge>,
  IN_PROGRESS: <Badge className="bg-amber-100 text-amber-700">En cours</Badge>,
  COMPLETED: <Badge className="bg-green-100 text-green-700">Complété</Badge>,
}

const SIGNER_ICON = {
  PENDING: <Clock size={14} className="text-gray-400 shrink-0" />,
  IN_PROGRESS: <Loader2 size={14} className="text-amber-500 animate-spin shrink-0" />,
  SIGNED: <CheckCircle2 size={14} className="text-green-500 shrink-0" />,
}

function formatDate(iso) {
  return format(new Date(iso), 'd MMM yyyy', { locale: fr })
}

function WorkflowCard({ workflow }) {
  const signedCount = workflow.signers.filter((s) => s.status === 'SIGNED').length
  const totalCount = workflow.signers.length
  const progress = totalCount > 0 ? (signedCount / totalCount) * 100 : 0
  const createdStr = formatDate(workflow.createdAt)
  const updatedStr = formatDate(workflow.updatedAt)
  const showUpdated = createdStr !== updatedStr

  return (
    <Card className="p-3 space-y-2">
      {/* Ligne 1 : nom + badge + bouton télécharger */}
      <div className="flex items-center gap-2">
        <p className="font-medium text-sm text-gray-900 truncate flex-1">{workflow.name}</p>
        {STATUS_BADGE[workflow.status]}
        {workflow.status === 'COMPLETED' && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1 h-6 px-2 text-xs shrink-0"
            onClick={() => downloadWorkflowPdf(workflow.id, `${workflow.name}-signé.pdf`)}
          >
            <Download size={12} />
            Télécharger
          </Button>
        )}
      </div>

      {/* Ligne 2 : fichier + dates */}
      <div className="flex items-center gap-3 text-xs text-gray-400 min-w-0">
        <span className="flex items-center gap-1 truncate">
          <FileText size={11} className="shrink-0" />
          {workflow.pdfOriginalName}
        </span>
        <span className="shrink-0">
          {createdStr}{showUpdated ? ` · maj ${updatedStr}` : ''}
        </span>
      </div>

      {/* Ligne 3 : barre de progression */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">{signedCount}/{totalCount} signatures</span>
        <Progress value={progress} className="flex-1" />
      </div>

      {/* Signataires */}
      <div className="space-y-1">
        {[...workflow.signers]
          .sort((a, b) => a.order - b.order)
          .map((signer) => (
            <div key={signer.order} className="flex items-center gap-1.5 text-xs">
              {SIGNER_ICON[signer.status]}
              <span className="text-gray-400 shrink-0">#{signer.order}</span>
              <span className="text-gray-700 truncate">{signer.name}</span>
              {signer.status === 'IN_PROGRESS' && (
                <a
                  href={`${window.location.origin}/${workflow.id}/signature/${signer.signerId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-500 hover:text-blue-700 hover:underline truncate"
                >
                  {`${window.location.origin}/${workflow.id}/signature/${signer.signerId}`}
                </a>
              )}
            </div>
          ))}
      </div>
    </Card>
  )
}

function EmptyState() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <FolderOpen size={48} className="text-gray-300 mb-4" />
      <p className="text-gray-500 mb-4">Aucun workflow pour le moment</p>
      <Button onClick={() => navigate('/workflow/new')}>
        Créer votre premier workflow
      </Button>
    </div>
  )
}

const TAB_ALL = 'all'

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState(TAB_ALL)

  const { data: workflows = [], isLoading, isError } = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
    staleTime: 5_000,
  })

  const sorted = [...workflows].sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  )

  const counts = {
    IN_PROGRESS: sorted.filter((w) => w.status === 'IN_PROGRESS').length,
    COMPLETED: sorted.filter((w) => w.status === 'COMPLETED').length,
    DRAFT: sorted.filter((w) => w.status === 'DRAFT').length,
  }

  const filtered =
    activeTab === TAB_ALL ? sorted : sorted.filter((w) => w.status === activeTab)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-gray-400" />
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
      {/* Liste */}
      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value={TAB_ALL}>Tous ({sorted.length})</TabsTrigger>
              <TabsTrigger value="IN_PROGRESS">
                En cours ({counts.IN_PROGRESS})
              </TabsTrigger>
              <TabsTrigger value="COMPLETED">
                Complétés ({counts.COMPLETED})
              </TabsTrigger>
              <TabsTrigger value="DRAFT">Brouillons ({counts.DRAFT})</TabsTrigger>
            </TabsList>
          </Tabs>

          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">
              Aucun workflow dans cette catégorie.
            </p>
          ) : (
            <div className="grid gap-4">
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
