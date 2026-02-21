import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './AppLayout'
import Dashboard from './pages/Dashboard'
import CreateWorkflow from './pages/CreateWorkflow'
import SignerPage from './pages/SignerPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/workflow/new" element={<CreateWorkflow />} />
        </Route>
        <Route path="/signature/:signerName" element={<SignerPage />} />
      </Routes>
    </BrowserRouter>
  )
}
