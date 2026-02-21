import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, PlusCircle, FileSignature } from 'lucide-react'
import { Button } from './components/ui/button'

export default function AppLayout() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-slate-900 flex items-center px-6 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-auto">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
            <FileSignature size={14} className="text-white" />
          </div>
          <span className="font-semibold text-white tracking-tight">PDF Workflow</span>
        </div>

        <nav className="flex items-center gap-2">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <LayoutDashboard size={16} />
            Dashboard
          </NavLink>
          <Button
            size="sm"
            className="gap-1.5 bg-indigo-500 hover:bg-indigo-600"
            onClick={() => navigate('/workflow/new')}
          >
            <PlusCircle size={16} />
            Nouveau workflow
          </Button>
        </nav>
      </header>
      <main className="pt-14">
        <Outlet />
      </main>
    </div>
  )
}
