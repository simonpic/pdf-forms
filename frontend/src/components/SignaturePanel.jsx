import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { PenLine, CheckCircle, AlertCircle } from 'lucide-react'

/**
 * Panneau affiché quand tous les champs du signataire sont remplis.
 * Permet de déclencher la signature du document.
 *
 * @param {Array} fields - champs du signataire
 * @param {Object} values - { fieldName: valeur }
 * @param {string} signerName - nom affiché
 * @param {Function} onFill - () => Promise<void> — appel /fill
 * @param {Function} onSign - () => Promise<void> — appel /sign
 */
export default function SignaturePanel({ fields, values, signerName, onFill, onSign }) {
  const [phase, setPhase] = useState('fill') // 'fill' | 'signing' | 'done'
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const allFilled = fields.every((f) => {
    const val = values[f.fieldName] ?? f.currentValue ?? ''
    return val.trim().length > 0
  })

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
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-5">
          <div className="flex items-center gap-3 text-green-700">
            <CheckCircle size={24} />
            <div>
              <p className="font-semibold">Document signé !</p>
              <p className="text-sm text-green-600">
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
        <CardTitle className="flex items-center gap-2">
          <PenLine size={16} />
          Signature de {signerName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* État des champs */}
        <div className="space-y-2">
          <p className="text-sm text-gray-600 font-medium">Vos champs à remplir :</p>
          {fields.map((f) => {
            const val = values[f.fieldName] ?? f.currentValue ?? ''
            const filled = val.trim().length > 0
            return (
              <div key={f.fieldName} className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${filled ? 'bg-green-500' : 'bg-gray-300'}`}
                />
                <span className="text-xs font-mono text-gray-500 truncate">{f.fieldName}</span>
                {filled ? (
                  <Badge variant="success" className="text-xs">rempli</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">vide</Badge>
                )}
              </div>
            )
          })}
        </div>

        {/* Indication de statut */}
        {phase === 'signing' && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
            <p className="font-medium">Valeurs enregistrées.</p>
            <p className="text-xs mt-1">
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

        {/* Bouton d'action */}
        {phase === 'fill' && (
          <Button
            className="w-full"
            disabled={!allFilled || loading}
            onClick={handleSubmit}
          >
            {loading ? 'Enregistrement…' : 'Valider mes saisies'}
          </Button>
        )}

        {phase === 'signing' && (
          <Button
            className="w-full bg-green-600 hover:bg-green-700"
            disabled={loading}
            onClick={handleSubmit}
          >
            <PenLine size={16} />
            {loading ? 'Signature en cours…' : 'Signer le document'}
          </Button>
        )}

        {!allFilled && phase === 'fill' && (
          <p className="text-xs text-center text-gray-400">
            Remplissez tous vos champs pour continuer.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
