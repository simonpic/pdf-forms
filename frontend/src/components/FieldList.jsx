import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Trash2, Layers, Type, SquareCheck, CircleDot } from 'lucide-react'

const TYPE_META = {
  text:     { Icon: Type,        label: 'Texte',  color: 'text-indigo-500' },
  checkbox: { Icon: SquareCheck, label: 'Case',   color: 'text-emerald-500' },
  radio:    { Icon: CircleDot,   label: 'Radio',  color: 'text-amber-500' },
}

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
            Placez des champs sur le PDF avec l&apos;outil sélectionné.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {fields.map((field, index) => {
              const meta = TYPE_META[field.fieldType ?? 'text'] ?? TYPE_META.text
              const { Icon } = meta

              return (
                <li
                  key={field.fieldName}
                  className="flex items-center justify-between gap-2 p-2 rounded-md bg-slate-50 border border-slate-100"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Icon size={12} className={`shrink-0 ${meta.color}`} />
                      {field.signerName ? (
                        <Badge className="bg-indigo-100 text-indigo-700 text-xs shrink-0">
                          {field.signerName}
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-400 text-xs shrink-0">
                          Non assigné
                        </Badge>
                      )}
                      {field.groupName && (
                        <Badge className="bg-amber-100 text-amber-700 text-xs shrink-0 font-mono">
                          {field.groupName}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onRemove(index)}
                    className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                    title="Supprimer le champ"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
