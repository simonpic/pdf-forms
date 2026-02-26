/**
 * Dessine l'aperçu de signature (nom + date) dans un canvas.
 * Utilisé dans le panneau droit ET dans le chip placé sur le document.
 */
export function drawSignaturePreview(canvas, signerName, dateStr) {
  const dpr = window.devicePixelRatio || 1
  const W   = canvas.offsetWidth
  const H   = canvas.offsetHeight
  if (!W || !H) return

  canvas.width  = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  // Fond bleu clair
  ctx.fillStyle = '#edf2fa'
  ctx.fillRect(0, 0, W, H)

  // Barre d'accent gauche
  ctx.fillStyle = '#406aad'
  ctx.fillRect(0, 0, 4, H)

  // Contour
  ctx.strokeStyle = '#406aad'
  ctx.lineWidth = 0.8
  ctx.strokeRect(0.4, 0.4, W - 0.8, H - 0.8)

  // "Signé par"
  ctx.fillStyle = '#808080'
  ctx.font = '9px Helvetica, Arial, sans-serif'
  ctx.fillText('Signé par', 8, 14)

  // Nom
  ctx.fillStyle = '#264080'
  ctx.font = 'bold 13px Helvetica, Arial, sans-serif'
  ctx.fillText(signerName, 8, 32)

  // Date
  ctx.fillStyle = '#808080'
  ctx.font = '9px Helvetica, Arial, sans-serif'
  ctx.fillText(dateStr, 8, H - 8)
}

export function formatSignatureDate() {
  return new Date().toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
