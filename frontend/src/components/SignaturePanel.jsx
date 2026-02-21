import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { PenLine, CheckCircle, AlertCircle, Type, SquareCheck, CircleDot } from 'lucide-react'

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

export default function SignaturePanel({ fields, values, signerName, onFill, onSign }) {
  const [phase, setPhase] = useState('fill') // 'fill' | 'signing' | 'done'
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const displayItems = buildDisplayItems(fields, values)
  const allFilled = displayItems.every((item) => item.filled)

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
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="pt-5">
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
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-700">
          <PenLine size={15} className="text-indigo-500" />
          Signature de {signerName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* État des champs */}
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
          <Button
            className="w-full bg-indigo-500 hover:bg-indigo-600"
            disabled={!allFilled || loading}
            onClick={handleSubmit}
          >
            {loading ? 'Enregistrement…' : 'Valider mes saisies'}
          </Button>
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

        {!allFilled && phase === 'fill' && (
          <p className="text-xs text-center text-slate-400">
            Remplissez tous vos champs pour continuer.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
