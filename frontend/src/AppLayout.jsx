import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, PlusCircle } from 'lucide-react'
import { Button } from './components/ui/button'

export default function AppLayout() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4">
        <span className="font-semibold text-gray-900 mr-auto">PDF Workflow</span>
        <nav className="flex items-center gap-2">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            <LayoutDashboard size={16} />
            Dashboard
          </NavLink>
          <Button size="sm" className="gap-1.5" onClick={() => navigate('/workflow/new')}>
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
