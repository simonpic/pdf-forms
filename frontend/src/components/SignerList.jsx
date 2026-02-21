import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { slugify } from '@/lib/utils'
import { UserPlus, Trash2, Users } from 'lucide-react'

export default function SignerList({ signers, onChange }) {
  const [newName, setNewName] = useState('')

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    const signerId = slugify(name)
    if (signers.some((s) => s.signerId === signerId)) {
      alert(`Un signataire avec ce nom (ou un nom similaire) existe déjà.`)
      return
    }
    const order = signers.length + 1
    onChange([...signers, { name, signerId, order }])
    setNewName('')
  }

  const handleRemove = (index) => {
    const updated = signers
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, order: i + 1 }))
    onChange(updated)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-700">
          <Users size={15} className="text-indigo-500" />
          Signataires
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {signers.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun signataire ajouté.</p>
        ) : (
          <ol className="space-y-1.5">
            {signers.map((signer, index) => (
              <li
                key={signer.signerId}
                className="flex items-center justify-between gap-2 p-2 rounded-md bg-slate-50 border border-slate-100"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge className="bg-indigo-100 text-indigo-700 shrink-0">
                    #{signer.order}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{signer.name}</p>
                    <p className="text-xs text-slate-400 truncate font-mono">{signer.signerId}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(index)}
                  className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                  title="Supprimer"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          <Label className="text-slate-600">Ajouter un signataire</Label>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nom du signataire"
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            >
              <UserPlus size={14} />
              Ajouter
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
