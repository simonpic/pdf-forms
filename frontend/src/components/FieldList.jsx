import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Trash2, Layers } from 'lucide-react'

/**
 * Affiche la liste des champs dessinés avec leur signataire assigné.
 *
 * @param {Array} fields - champs dessinés
 * @param {Function} onRemove - (index) => void
 */
export default function FieldList({ fields, onRemove }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers size={16} />
          Champs ({fields.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <p className="text-sm text-gray-400">
            Dessinez des champs sur le PDF en cliquant-glissant.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {fields.map((field, index) => (
              <li
                key={field.fieldName}
                className="flex items-center justify-between gap-2 p-2 rounded bg-gray-50 border border-gray-100"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="default" className="text-xs shrink-0">
                      {field.signerName}
                    </Badge>
                    <span className="text-xs text-gray-500 font-mono truncate">
                      {field.fieldName}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    x:{Math.round(field.x)} y:{Math.round(field.y)}{' '}
                    {Math.round(field.width)}×{Math.round(field.height)} pt
                  </p>
                </div>
                <button
                  onClick={() => onRemove(index)}
                  className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                  title="Supprimer le champ"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
