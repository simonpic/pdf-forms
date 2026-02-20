import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Configurer le worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

const DEFAULT_SCALE = 1.5

/**
 * Composant qui affiche un PDF via PDF.js dans un canvas.
 * Expose les métriques de la page (scale, pageHeightPt) pour le positionnement des champs.
 *
 * @param {ArrayBuffer|null} pdfData - Données binaires du PDF
 * @param {Function} onPageInfo - Callback({ scale, pageHeightPt, canvasWidth, canvasHeight })
 * @param {React.ReactNode} overlay - Couche superposée (FieldDrawingLayer ou FieldOverlay)
 */
export default function PDFCanvas({ pdfData, onPageInfo, overlay }) {
  const canvasRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const renderTaskRef = useRef(null)

  const renderPdf = useCallback(async () => {
    if (!pdfData || !canvasRef.current) return

    try {
      // Annuler le rendu précédent si en cours
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
        renderTaskRef.current = null
      }

      const loadingTask = pdfjsLib.getDocument({ data: pdfData })
      const pdf = await loadingTask.promise

      const page = await pdf.getPage(1) // Page 1 (1-indexed)
      const viewport = page.getViewport({ scale: DEFAULT_SCALE })

      const canvas = canvasRef.current
      const context = canvas.getContext('2d')

      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)

      setDimensions({ width: canvas.width, height: canvas.height })

      // Notifier le parent des métriques de la page
      const pageHeightPt = viewport.height / DEFAULT_SCALE
      if (onPageInfo) {
        onPageInfo({
          scale: DEFAULT_SCALE,
          pageHeightPt,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        })
      }

      const renderContext = {
        canvasContext: context,
        viewport,
      }

      renderTaskRef.current = page.render(renderContext)
      await renderTaskRef.current.promise
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Erreur de rendu PDF.js :', err)
      }
    }
  }, [pdfData, onPageInfo])

  useEffect(() => {
    renderPdf()
  }, [renderPdf])

  return (
    <div
      className="relative shadow-md bg-white"
      style={{ width: dimensions.width || 'auto', height: dimensions.height || 'auto' }}
    >
      <canvas ref={canvasRef} className="block" />
      {/* Couche superposée positionnée en absolu sur le canvas */}
      {dimensions.width > 0 && overlay && (
        <div
          className="absolute inset-0"
          style={{ width: dimensions.width, height: dimensions.height }}
        >
          {overlay}
        </div>
      )}
    </div>
  )
}
