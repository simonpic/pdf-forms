const API_BASE = '/api'

/**
 * Crée un workflow à partir du PDF uploadé et des métadonnées.
 * @param {File} file - Le fichier PDF
 * @param {Object} data - { name, signers: [{name, order}], fields: [{...}] }
 */
export async function createWorkflow(file, data) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('data', JSON.stringify(data))

  const res = await fetch(`${API_BASE}/workflows`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Erreur ${res.status}`)
  }

  return res.json()
}

/**
 * Récupère le document pour un signataire.
 * Retourne { workflowId, signerName, signerId, pdfBase64, fields }.
 * Lance une erreur avec status=403 si ce n'est pas son tour.
 */
export async function getSignerDocument(signerName) {
  const res = await fetch(`${API_BASE}/workflows/signer/${encodeURIComponent(signerName)}`)

  if (!res.ok) {
    const text = await res.text()
    const error = new Error(text || `Erreur ${res.status}`)
    error.status = res.status
    // Tenter de parser le message JSON Spring Boot
    try {
      const json = JSON.parse(text)
      error.message = json.message || json.detail || text
    } catch {
      error.message = text
    }
    throw error
  }

  return res.json()
}

/**
 * Remplit les champs pour le signataire.
 * @param {string} workflowId
 * @param {string} signerName - Nom brut (sera slugifié côté backend)
 * @param {Object} fields - { fieldName: value }
 */
export async function fillFields(workflowId, signerName, fields) {
  const res = await fetch(`${API_BASE}/workflows/${workflowId}/fill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signerName, fields }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Erreur ${res.status}`)
  }

  return res.json()
}

/**
 * Signe le document pour le signataire.
 * @param {string} workflowId
 * @param {string} signerName
 */
export async function signDocument(workflowId, signerName) {
  const res = await fetch(`${API_BASE}/workflows/${workflowId}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signerName }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Erreur ${res.status}`)
  }

  return res.json()
}

/**
 * Déclenche le téléchargement du PDF final signé.
 * @param {string} workflowId
 */
export function downloadFinalPdf(workflowId) {
  window.open(`${API_BASE}/workflows/${workflowId}/download`, '_blank')
}
