import { Check, Clock, PenLine } from 'lucide-react'
import { Card, CardContent } from './ui/card'

const STATUS_CONFIG = {
  SIGNED:  { Icon: Check,    iconClass: 'text-emerald-500', dotClass: 'bg-emerald-500',  labelClass: 'text-slate-400 line-through' },
  CURRENT: { Icon: PenLine,  iconClass: 'text-indigo-500',  dotClass: 'bg-indigo-500',   labelClass: 'text-slate-900 font-medium'  },
  PENDING: { Icon: Clock,    iconClass: 'text-slate-300',   dotClass: 'bg-slate-200',    labelClass: 'text-slate-400'              },
}

export default function SignerSequence({ signers, totalSigners }) {
  if (!signers || signers.length <= 1) return null

  const currentIndex = signers.findIndex((s) => s.status === 'CURRENT')

  return (
    <Card>
      <CardContent className="pt-4 pb-3 space-y-1">
        <p className="text-sm text-slate-600 font-medium mb-3">
          Signataire{' '}
          <span className="text-indigo-600">{currentIndex + 1}</span>
          {' '}sur{' '}
          <span className="text-indigo-600">{signers.length}</span>
        </p>

        {signers.map((signer) => {
          const { Icon, iconClass, dotClass, labelClass } = STATUS_CONFIG[signer.status] ?? STATUS_CONFIG.PENDING
          return (
            <div key={signer.order} className="flex items-center gap-2.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                signer.status === 'CURRENT' ? 'bg-indigo-50' :
                signer.status === 'SIGNED'  ? 'bg-emerald-50' : 'bg-slate-100'
              }`}>
                <Icon size={11} className={iconClass} />
              </div>
              <span className={`text-xs flex-1 truncate ${labelClass}`}>
                {signer.name}
              </span>
              {signer.status === 'SIGNED' && (
                <span className="text-xs text-emerald-600 shrink-0">signé</span>
              )}
              {signer.status === 'CURRENT' && (
                <span className="text-xs text-indigo-500 shrink-0">vous</span>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
