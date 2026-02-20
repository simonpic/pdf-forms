import { useState, useRef, useCallback } from 'react'

// Palette de couleurs par signataire (index)
const SIGNER_COLORS = [
  'rgba(59, 130, 246, 0.35)',   // bleu
  'rgba(16, 185, 129, 0.35)',   // vert
  'rgba(245, 158, 11, 0.35)',   // orange
  'rgba(239, 68, 68, 0.35)',    // rouge
  'rgba(139, 92, 246, 0.35)',   // violet
]

const SIGNER_BORDER_COLORS = [
  'rgb(59, 130, 246)',
  'rgb(16, 185, 129)',
  'rgb(245, 158, 11)',
  'rgb(239, 68, 68)',
  'rgb(139, 92, 246)',
]

/**
 * Couche de dessin superposée au canvas PDF.js.
 * Permet à l'instrumentant de tracer des rectangles qui deviennent des champs.
 *
 * @param {number} scale - viewport.scale de PDF.js
 * @param {number} pageHeightPt - hauteur de la page en points PDF
 * @param {Array} signers - [{ name, order, signerId }]
 * @param {Array} fields - champs déjà dessinés
 * @param {Function} onFieldAdded - callback(field)
 */
export default function FieldDrawingLayer({
  scale,
  pageHeightPt,
  signers,
  fields,
  onFieldAdded,
}) {
  const [drawing, setDrawing] = useState(false)
  const [startPos, setStartPos] = useState(null)
  const [currentRect, setCurrentRect] = useState(null)
  const [pendingRect, setPendingRect] = useState(null) // rect en attente d'assignment
  const [showPopup, setShowPopup] = useState(false)
  const layerRef = useRef(null)

  const getRelativePos = (e) => {
    const rect = layerRef.current.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const handleMouseDown = useCallback((e) => {
    if (showPopup) return
    e.preventDefault()
    const pos = getRelativePos(e)
    setStartPos(pos)
    setDrawing(true)
    setCurrentRect(null)
  }, [showPopup])

  const handleMouseMove = useCallback((e) => {
    if (!drawing || !startPos) return
    const pos = getRelativePos(e)
    setCurrentRect({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
    })
  }, [drawing, startPos])

  const handleMouseUp = useCallback(() => {
    if (!drawing) return
    setDrawing(false)

    if (currentRect && currentRect.width > 15 && currentRect.height > 10) {
      setPendingRect(currentRect)
      setShowPopup(true)
    } else {
      setCurrentRect(null)
      setStartPos(null)
    }
  }, [drawing, currentRect])

  const handleAssign = (signer, index) => {
    if (!pendingRect || !scale || !pageHeightPt) return

    // Conversion canvas pixels → coordonnées PDF (origine bas-gauche)
    const pdfX = pendingRect.x / scale
    const pdfY = pageHeightPt - (pendingRect.y + pendingRect.height) / scale
    const pdfWidth = pendingRect.width / scale
    const pdfHeight = pendingRect.height / scale

    const field = {
      fieldName: `field_${signer.signerId}_${Date.now()}`,
      assignedTo: signer.signerId,
      signerName: signer.name,
      signerIndex: index,
      page: 0,
      x: Math.round(pdfX * 100) / 100,
      y: Math.round(pdfY * 100) / 100,
      width: Math.round(pdfWidth * 100) / 100,
      height: Math.round(pdfHeight * 100) / 100,
      // Garder les coords canvas pour l'affichage
      canvasRect: pendingRect,
    }

    onFieldAdded(field)
    setShowPopup(false)
    setPendingRect(null)
    setCurrentRect(null)
    setStartPos(null)
  }

  const handleCancelPopup = () => {
    setShowPopup(false)
    setPendingRect(null)
    setCurrentRect(null)
    setStartPos(null)
  }

  return (
    <div
      ref={layerRef}
      className={`absolute inset-0 ${showPopup ? 'cursor-default' : 'cursor-crosshair'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (drawing) {
          setDrawing(false)
          setCurrentRect(null)
          setStartPos(null)
        }
      }}
    >
      {/* Champs déjà dessinés */}
      {fields.map((field, i) => {
        const colorIndex = field.signerIndex ?? i % SIGNER_COLORS.length
        return (
          <div
            key={field.fieldName}
            className="absolute flex items-center justify-center text-xs font-medium pointer-events-none select-none"
            style={{
              left: field.canvasRect.x,
              top: field.canvasRect.y,
              width: field.canvasRect.width,
              height: field.canvasRect.height,
              background: SIGNER_COLORS[colorIndex % SIGNER_COLORS.length],
              border: `2px solid ${SIGNER_BORDER_COLORS[colorIndex % SIGNER_BORDER_COLORS.length]}`,
              borderRadius: 3,
              color: SIGNER_BORDER_COLORS[colorIndex % SIGNER_BORDER_COLORS.length],
              overflow: 'hidden',
            }}
          >
            {field.signerName}
          </div>
        )
      })}

      {/* Rectangle en cours de tracé */}
      {drawing && currentRect && (
        <div
          className="absolute pointer-events-none border-2 border-dashed border-blue-500"
          style={{
            left: currentRect.x,
            top: currentRect.y,
            width: currentRect.width,
            height: currentRect.height,
            background: 'rgba(59, 130, 246, 0.15)',
          }}
        />
      )}

      {/* Rectangle en attente d'assignment */}
      {pendingRect && (
        <div
          className="absolute pointer-events-none border-2 border-blue-600"
          style={{
            left: pendingRect.x,
            top: pendingRect.y,
            width: pendingRect.width,
            height: pendingRect.height,
            background: 'rgba(59, 130, 246, 0.2)',
          }}
        />
      )}

      {/* Popup de sélection du signataire */}
      {showPopup && pendingRect && (
        <div
          className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-52"
          style={{
            left: Math.min(pendingRect.x + pendingRect.width, window.innerWidth - 220),
            top: pendingRect.y,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-semibold text-gray-700 mb-2">Assigner à :</p>
          {signers.length === 0 ? (
            <p className="text-xs text-gray-500">Ajoutez d&apos;abord des signataires.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {signers.map((signer, index) => (
                <button
                  key={signer.signerId}
                  className="text-left text-xs px-2 py-1.5 rounded hover:bg-blue-50 transition-colors"
                  style={{ color: SIGNER_BORDER_COLORS[index % SIGNER_BORDER_COLORS.length] }}
                  onClick={() => handleAssign(signer, index)}
                >
                  {index + 1}. {signer.name}
                </button>
              ))}
            </div>
          )}
          <button
            className="mt-2 w-full text-xs text-gray-400 hover:text-gray-600"
            onClick={handleCancelPopup}
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  )
}
