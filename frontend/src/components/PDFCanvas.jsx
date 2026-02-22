import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

const DEFAULT_SCALE = 1.5

/**
 * Renders a single PDF page inside a <canvas>.
 * Calls onPageInfo(pageIndex, info) once rendered.
 * Renders renderOverlay(pageIndex, info) on top when ready.
 */
function PageCanvas({ pdf, pageNumber, onPageInfo, renderOverlay }) {
  const canvasRef = useRef(null)
  const renderTaskRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [pageInfo, setPageInfo] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      if (!pdf || !canvasRef.current) return

      renderTaskRef.current?.cancel()
      renderTaskRef.current = null

      try {
        const page = await pdf.getPage(pageNumber)
        if (cancelled) return

        const viewport = page.getViewport({ scale: DEFAULT_SCALE })
        const canvas = canvasRef.current
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)

        const dims = { width: canvas.width, height: canvas.height }
        const info = {
          scale: DEFAULT_SCALE,
          pageHeightPt: viewport.height / DEFAULT_SCALE,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        }

        setDimensions(dims)
        setPageInfo(info)
        onPageInfo?.(pageNumber - 1, info)

        renderTaskRef.current = page.render({ canvasContext: canvas.getContext('2d'), viewport })
        await renderTaskRef.current.promise
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Erreur rendu PDF.js page', pageNumber, err)
        }
      }
    }

    render()
    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
    }
  }, [pdf, pageNumber, onPageInfo])

  return (
    <div
      className="relative shadow-md bg-white"
      style={{ width: dimensions.width || 'auto', height: dimensions.height || 'auto' }}
    >
      <canvas ref={canvasRef} className="block" />
      {dimensions.width > 0 && pageInfo && renderOverlay && (
        <div
          className="absolute inset-0"
          style={{ width: dimensions.width, height: dimensions.height }}
        >
          {renderOverlay(pageNumber - 1, pageInfo)}
        </div>
      )}
    </div>
  )
}

/**
 * Displays all pages of a PDF document stacked vertically.
 *
 * @param {ArrayBuffer|null} pdfData
 * @param {Function}         onPagesInfo    - called once all pages are loaded: (PageInfo[]) => void
 * @param {Function}         renderOverlay  - (pageIndex, pageInfo) => ReactNode, called per page
 */
export default function PDFCanvas({ pdfData, onPagesInfo, renderOverlay }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const pageInfosRef = useRef([])

  useEffect(() => {
    if (!pdfData) {
      setPdfDoc(null)
      setNumPages(0)
      return
    }

    let destroyed = false
    const loadingTask = pdfjsLib.getDocument({ data: pdfData })

    loadingTask.promise
      .then((pdf) => {
        if (destroyed) { pdf.destroy(); return }
        pageInfosRef.current = new Array(pdf.numPages).fill(null)
        setPdfDoc(pdf)
        setNumPages(pdf.numPages)
      })
      .catch((err) => {
        if (!destroyed) console.error('Erreur chargement PDF:', err)
      })

    return () => {
      destroyed = true
      try { loadingTask.destroy() } catch { /* ignore */ }
    }
  }, [pdfData])

  // Destroy replaced PDF document
  useEffect(() => {
    return () => { pdfDoc?.destroy() }
  }, [pdfDoc])

  const handlePageInfo = useCallback((pageIndex, info) => {
    pageInfosRef.current[pageIndex] = info
    if (onPagesInfo && pageInfosRef.current.every(Boolean)) {
      onPagesInfo(pageInfosRef.current.slice())
    }
  }, [onPagesInfo])

  if (!pdfDoc || numPages === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: numPages }, (_, i) => (
        <PageCanvas
          key={i}
          pdf={pdfDoc}
          pageNumber={i + 1}
          onPageInfo={handlePageInfo}
          renderOverlay={renderOverlay}
        />
      ))}
    </div>
  )
}
