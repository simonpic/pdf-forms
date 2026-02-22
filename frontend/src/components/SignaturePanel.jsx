import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { PenLine, AlertCircle, Type, SquareCheck, CircleDot, ShieldCheck } from 'lucide-react'

// Calcule si un champ individuel est "rempli" selon son type
function isFieldFilled(f, values) {
  const fieldType = f.fieldType ?? 'text'
  if (fieldType === 'checkbox') return true  // tout état (coché/décoché) est valide
  if (fieldType === 'radio') return false    // géré au niveau du groupe ci-dessous
  const val = values[f.fieldName] ?? f.currentValue ?? ''
  return val.trim().length > 0
}

// Construit la liste des "items" à afficher (déduplique les groupes radio)
function buildDisplayItems(fields, values) {
  const seenGroups = new Set()
  const items = []

  for (const f of fields) {
    const fieldType = f.fieldType ?? 'text'

    if (fieldType === 'radio') {
      if (seenGroups.has(f.groupName)) continue
      seenGroups.add(f.groupName)
      const groupFields = fields.filter((g) => g.fieldType === 'radio' && g.groupName === f.groupName)
      const selected = groupFields.some((g) => (values[g.fieldName] ?? 'false') === 'true')
      items.push({ key: f.groupName, label: f.label || f.groupName, fieldType: 'radio', filled: selected })
    } else {
      items.push({ key: f.fieldName, label: f.label || f.fieldName, fieldType, filled: isFieldFilled(f, values) })
    }
  }

  return items
}

const TYPE_ICON = {
  text:     { Icon: Type,        color: 'text-indigo-400' },
  checkbox: { Icon: SquareCheck, color: 'text-emerald-400' },
  radio:    { Icon: CircleDot,   color: 'text-amber-400' },
}

export default function SignaturePanel({ fields, values, signerName, workflowName, onFillAndSign }) {
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)

  const displayItems = buildDisplayItems(fields, values)
  const hasFields    = displayItems.length > 0

  const handleConfirm = async () => {
    setOpen(false)
    setError(null)
    setLoading(true)
    try {
      await onFillAndSign()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-700">
            <PenLine size={15} className="text-indigo-500" />
            Signature de {signerName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* État des champs */}
          {hasFields && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600 font-medium">Vos champs à remplir :</p>
              {displayItems.map((item) => {
                const meta = TYPE_ICON[item.fieldType] ?? TYPE_ICON.text
                const { Icon } = meta
                return (
                  <div key={item.key} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${item.filled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <Icon size={11} className={`shrink-0 ${meta.color}`} />
                    <span className="text-xs font-mono text-slate-500 truncate flex-1">{item.label}</span>
                    {item.filled ? (
                      <Badge className="text-xs bg-emerald-100 text-emerald-700">rempli</Badge>
                    ) : (
                      <Badge className="text-xs bg-slate-100 text-slate-500">vide</Badge>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Bouton principal */}
          <Button
            className="w-full bg-indigo-500 hover:bg-indigo-600"
            disabled={loading}
            onClick={() => setOpen(true)}
          >
            <PenLine size={16} />
            {loading ? 'Signature en cours…' : 'Signer le document'}
          </Button>
        </CardContent>
      </Card>

      {/* Modale de confirmation */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl p-6 space-y-4 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <ShieldCheck size={20} className="text-indigo-500" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-slate-900">
                  Confirmer la signature
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-1">
                  Vous êtes sur le point de signer{workflowName ? ` « ${workflowName} »` : ' ce document'} en tant que{' '}
                  <span className="font-medium text-slate-700">{signerName}</span>.
                  Cette action est irréversible.
                </Dialog.Description>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Dialog.Close asChild>
                <Button variant="outline" className="flex-1">
                  Annuler
                </Button>
              </Dialog.Close>
              <Button
                className="flex-1 bg-indigo-500 hover:bg-indigo-600"
                onClick={handleConfirm}
              >
                <PenLine size={15} />
                Signer
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
