import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Trash2, Layers } from 'lucide-react'

export default function FieldList({ fields, onRemove }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-700">
          <Layers size={15} className="text-indigo-500" />
          Champs ({fields.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <p className="text-sm text-slate-400">
            Dessinez des champs sur le PDF en cliquant-glissant.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {fields.map((field, index) => (
              <li
                key={field.fieldName}
                className="flex items-center justify-between gap-2 p-2 rounded-md bg-slate-50 border border-slate-100"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge className="bg-indigo-100 text-indigo-700 text-xs shrink-0">
                      {field.signerName}
                    </Badge>
                    <span className="text-xs text-slate-500 font-mono truncate">
                      {field.fieldName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    x:{Math.round(field.x)} y:{Math.round(field.y)}{' '}
                    {Math.round(field.width)}×{Math.round(field.height)} pt
                  </p>
                </div>
                <button
                  onClick={() => onRemove(index)}
                  className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
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
