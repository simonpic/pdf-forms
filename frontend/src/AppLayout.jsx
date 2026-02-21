import { Outlet } from 'react-router-dom'
import { FileSignature } from 'lucide-react'

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="fixed top-0 left-0 right-0 z-50 h-12 bg-slate-900 flex items-center px-6">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-indigo-500 flex items-center justify-center shrink-0">
            <FileSignature size={13} className="text-white" />
          </div>
          <span className="font-semibold text-white tracking-tight text-sm">PDF Workflow</span>
        </div>
      </header>
      <main className="pt-12">
        <Outlet />
      </main>
    </div>
  )
}
