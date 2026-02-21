import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { PenLine, CheckCircle, AlertCircle, Type, SquareCheck, CircleDot, X } from 'lucide-react'

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
      items.push({ key: f.groupName, label: f.groupName, fieldType: 'radio', filled: selected })
    } else {
      items.push({ key: f.fieldName, label: f.fieldName, fieldType, filled: isFieldFilled(f, values) })
    }
  }

  return items
}

const TYPE_ICON = {
  text:     { Icon: Type,        color: 'text-indigo-400' },
  checkbox: { Icon: SquareCheck, color: 'text-emerald-400' },
  radio:    { Icon: CircleDot,   color: 'text-amber-400' },
}

// Indicateur d'étapes
function StepIndicator({ phase }) {
  const steps = [
    { id: 'fill',    label: 'Remplir' },
    { id: 'signing', label: 'Confirmer' },
    { id: 'done',    label: 'Signé' },
  ]
  const currentIndex = steps.findIndex((s) => s.id === phase)

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                done   ? 'bg-emerald-500 text-white' :
                active ? 'bg-indigo-500 text-white ring-2 ring-indigo-200' :
                         'bg-slate-200 text-slate-400'
              }`}>
                {done ? <CheckCircle size={13} /> : i + 1}
              </div>
              <span className={`text-[10px] whitespace-nowrap ${active ? 'text-indigo-600 font-medium' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-1 mb-4 ${i < currentIndex ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function SignaturePanel({ fields, values, signerName, onFill, onSign }) {
  const [phase, setPhase] = useState('fill') // 'fill' | 'signing' | 'done'
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const displayItems = buildDisplayItems(fields, values)
  const allFilled = displayItems.every((item) => item.filled)
  const hasFields = displayItems.length > 0

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      if (phase === 'fill') {
        await onFill()
        setPhase('signing')
      } else if (phase === 'signing') {
        await onSign()
        setPhase('done')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'done') {
    return (
      <div className="space-y-4">
        <StepIndicator phase="done" />
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center gap-3 text-emerald-700">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle size={20} />
              </div>
              <div>
                <p className="font-semibold">Document signé !</p>
                <p className="text-sm text-emerald-600">
                  Votre signature a été enregistrée avec succès.
                </p>
              </div>
            </div>
            <p className="text-xs text-emerald-700 bg-emerald-100 rounded-md px-3 py-2 leading-relaxed">
              Le prochain signataire sera notifié automatiquement. Vous pouvez fermer cette page.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <StepIndicator phase={phase} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-700">
            <PenLine size={15} className="text-indigo-500" />
            Signature de {signerName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* État des champs */}
          {hasFields ? (
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
          ) : (
            <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm text-slate-500 text-center">
              <X size={16} className="mx-auto mb-1 text-slate-300" />
              Aucun champ à remplir.<br />
              <span className="text-xs">Vous pouvez signer directement.</span>
            </div>
          )}

          {/* Confirmation après /fill */}
          {phase === 'signing' && (
            <div className="rounded-md bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-700">
              <p className="font-medium">Valeurs enregistrées.</p>
              <p className="text-xs mt-1 text-indigo-600">
                Cliquez sur &quot;Signer le document&quot; pour apposer votre signature cryptographique.
              </p>
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Boutons */}
          {phase === 'fill' && (
            <>
              <Button
                className="w-full bg-indigo-500 hover:bg-indigo-600"
                disabled={(hasFields && !allFilled) || loading}
                onClick={handleSubmit}
              >
                {loading ? 'Enregistrement…' : hasFields ? 'Valider mes saisies' : 'Continuer vers la signature'}
              </Button>
              {hasFields && !allFilled && (
                <p className="text-xs text-center text-slate-400">
                  Remplissez tous vos champs pour continuer.
                </p>
              )}
            </>
          )}

          {phase === 'signing' && (
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={loading}
              onClick={handleSubmit}
            >
              <PenLine size={16} />
              {loading ? 'Signature en cours…' : 'Signer le document'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
