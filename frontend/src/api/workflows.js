const API_BASE = '/api'

export async function fetchWorkflows() {
  const res = await fetch(`${API_BASE}/workflows`)
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  return res.json()
}

export async function downloadWorkflowPdf(id, filename) {
  const res = await fetch(`${API_BASE}/workflows/${id}/download`)
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `workflow-${id}-signed.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
