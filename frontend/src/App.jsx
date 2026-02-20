import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import CreateWorkflow from './pages/CreateWorkflow'
import SignerPage from './pages/SignerPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/create" element={<CreateWorkflow />} />
        <Route path="/signature/:signerName" element={<SignerPage />} />
        <Route path="/" element={<Navigate to="/create" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
