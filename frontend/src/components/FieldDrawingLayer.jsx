import { useState, useRef, useCallback, useEffect } from 'react'

const SIGNER_COLORS = [
  'rgba(59, 130, 246, 0.35)',
  'rgba(16, 185, 129, 0.35)',
  'rgba(245, 158, 11, 0.35)',
  'rgba(239, 68, 68, 0.35)',
  'rgba(139, 92, 246, 0.35)',
]

const SIGNER_BORDER_COLORS = [
  'rgb(59, 130, 246)',
  'rgb(16, 185, 129)',
  'rgb(245, 158, 11)',
  'rgb(239, 68, 68)',
  'rgb(139, 92, 246)',
]

// Tailles fixes pour les champs non-texte (en pixels canvas)
const CHECKBOX_SIZE_PX = 20
const RADIO_SIZE_PX = 18

/**
 * Couche de dessin superposée au canvas PDF.js.
 *
 * @param {number} scale - viewport.scale de PDF.js
 * @param {number} pageHeightPt - hauteur de la page en points PDF
 * @param {Array} signers - [{ name, order, signerId }]
 * @param {Array} fields - champs déjà placés
 * @param {Function} onFieldAdded - callback(field)
 * @param {'text'|'checkbox'|'radio'} activeTool - outil actif
 */
export default function FieldDrawingLayer({
  scale,
  pageHeightPt,
  signers,
  fields,
  onFieldAdded,
  onFieldReassigned,
  activeTool = 'text',
}) {
  const [drawing, setDrawing] = useState(false)
  const [startPos, setStartPos] = useState(null)
  const [currentRect, setCurrentRect] = useState(null)
  const [pendingRect, setPendingRect] = useState(null)
  const [showPopup, setShowPopup] = useState(false)
  const [radioGroupName, setRadioGroupName] = useState('groupe_1')
  const [hoveredFieldIndex, setHoveredFieldIndex] = useState(-1)
  const [reassigningFieldIndex, setReassigningFieldIndex] = useState(null)
  const layerRef = useRef(null)

  // Réinitialise l'état de dessin quand l'outil change
  useEffect(() => {
    setDrawing(false)
    setCurrentRect(null)
    setStartPos(null)
    setShowPopup(false)
    setPendingRect(null)
  }, [activeTool])

  const getRelativePos = (e) => {
    const rect = layerRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseDown = useCallback((e) => {
    if (showPopup) return
    e.preventDefault()
    const pos = getRelativePos(e)

    // Clic sur un champ existant → mode réassignation
    const hitIndex = getFieldAtPos(fields, pos)
    if (hitIndex !== -1) {
      const field = fields[hitIndex]
      setReassigningFieldIndex(hitIndex)
      setPendingRect(field.canvasRect)
      if (field.fieldType === 'radio') setRadioGroupName(field.groupName || 'groupe_1')
      setShowPopup(true)
      return
    }

    setStartPos(pos)
    if (activeTool === 'text') {
      setDrawing(true)
      setCurrentRect(null)
    }
  }, [showPopup, activeTool, fields])

  const handleMouseMove = useCallback((e) => {
    const pos = getRelativePos(e)

    if (!drawing && !showPopup) {
      setHoveredFieldIndex(getFieldAtPos(fields, pos))
    }

    if (!drawing || !startPos || activeTool !== 'text') return
    setCurrentRect({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
    })
  }, [drawing, startPos, activeTool, fields, showPopup])

  const handleMouseUp = useCallback(() => {
    if (!startPos) return

    if (activeTool === 'text') {
      setDrawing(false)
      if (currentRect && currentRect.width > 15 && currentRect.height > 10) {
        setPendingRect(currentRect)
        setShowPopup(true)
      } else {
        setCurrentRect(null)
        setStartPos(null)
      }
    } else {
      // Case à cocher ou bouton radio : placement au clic
      const size = activeTool === 'checkbox' ? CHECKBOX_SIZE_PX : RADIO_SIZE_PX
      setPendingRect({
        x: startPos.x - size / 2,
        y: startPos.y - size / 2,
        width: size,
        height: size,
      })

      if (activeTool === 'radio') {
        // Pré-remplir avec le dernier groupe utilisé, ou créer le premier
        const existingGroups = getExistingRadioGroups(fields)
        const last = existingGroups[existingGroups.length - 1]
        setRadioGroupName(last ?? 'groupe_1')
      }

      setStartPos(null)
      setShowPopup(true)
    }
  }, [startPos, activeTool, currentRect, fields])

  const handleAssign = (signer, index) => {
    if (reassigningFieldIndex !== null) {
      // Mode réassignation : on met à jour le champ existant
      const fieldType = fields[reassigningFieldIndex].fieldType
      onFieldReassigned(reassigningFieldIndex, {
        assignedTo: signer ? signer.signerId : '',
        signerName: signer ? signer.name : null,
        signerIndex: signer ? index : -1,
        ...(fieldType === 'radio' ? { groupName: radioGroupName.trim() || 'groupe_1' } : {}),
      })
      setReassigningFieldIndex(null)
    } else {
      // Mode placement : on crée un nouveau champ
      if (!pendingRect || !scale || !pageHeightPt) return

      const pdfX = pendingRect.x / scale
      const pdfY = pageHeightPt - (pendingRect.y + pendingRect.height) / scale
      const pdfWidth = pendingRect.width / scale
      const pdfHeight = pendingRect.height / scale

      const field = {
        fieldType: activeTool,
        fieldName: `${activeTool}_${signer ? signer.signerId : 'unassigned'}_${Date.now()}`,
        assignedTo: signer ? signer.signerId : '',
        signerName: signer ? signer.name : null,
        signerIndex: signer ? index : -1,
        page: 0,
        x: Math.round(pdfX * 100) / 100,
        y: Math.round(pdfY * 100) / 100,
        width: Math.round(pdfWidth * 100) / 100,
        height: Math.round(pdfHeight * 100) / 100,
        canvasRect: pendingRect,
        ...(activeTool === 'radio' ? { groupName: radioGroupName.trim() || 'groupe_1' } : {}),
      }
      onFieldAdded(field)
    }

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
    setReassigningFieldIndex(null)
  }

  const handleNewRadioGroup = () => {
    const existingGroups = getExistingRadioGroups(fields)
    const numbers = existingGroups
      .map((g) => g.match(/^groupe_(\d+)$/))
      .filter(Boolean)
      .map((m) => parseInt(m[1]))
    const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
    setRadioGroupName(`groupe_${next}`)
  }

  const existingRadioGroups = getExistingRadioGroups(fields)

  return (
    <div
      ref={layerRef}
      className={`absolute inset-0 ${
        showPopup          ? 'cursor-default'
        : hoveredFieldIndex !== -1 ? 'cursor-pointer'
        : 'cursor-crosshair'
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setHoveredFieldIndex(-1)
        if (drawing) {
          setDrawing(false)
          setCurrentRect(null)
          setStartPos(null)
        }
      }}
    >
      {/* Champs déjà placés */}
      {fields.map((field, i) => {
        const unassigned = !field.signerName
        const colorIndex = field.signerIndex >= 0 ? field.signerIndex : i % SIGNER_COLORS.length
        const bg     = unassigned ? 'rgba(100,116,139,0.15)' : SIGNER_COLORS[colorIndex % SIGNER_COLORS.length]
        const border = unassigned ? 'rgb(148,163,184)'       : SIGNER_BORDER_COLORS[colorIndex % SIGNER_BORDER_COLORS.length]
        const color  = unassigned ? 'rgb(100,116,139)'       : SIGNER_BORDER_COLORS[colorIndex % SIGNER_BORDER_COLORS.length]
        const isCheckbox = field.fieldType === 'checkbox'
        const isRadio = field.fieldType === 'radio'
        const isText = !isCheckbox && !isRadio

        return (
          <div
            key={field.fieldName}
            className="absolute flex items-center justify-center pointer-events-none select-none"
            style={{
              left: field.canvasRect.x,
              top: field.canvasRect.y,
              width: field.canvasRect.width,
              height: field.canvasRect.height,
              background: bg,
              border: `2px solid ${border}`,
              borderRadius: isRadio ? '50%' : 3,
              color,
              overflow: 'hidden',
            }}
          >
            {isCheckbox && (
              <span style={{ fontSize: Math.round(field.canvasRect.width * 0.6), lineHeight: 1 }}>☑</span>
            )}
            {isRadio && (
              <span style={{ fontSize: Math.round(field.canvasRect.width * 0.55), lineHeight: 1 }}>◉</span>
            )}
            {isText && (
              <span className="text-xs px-1 truncate font-medium">{field.signerName}</span>
            )}
          </div>
        )
      })}

      {/* Rectangle en cours de tracé (texte uniquement) */}
      {drawing && currentRect && activeTool === 'text' && (
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

      {/* Champ en attente d'assignation */}
      {pendingRect && (
        <div
          className="absolute pointer-events-none border-2 border-blue-600"
          style={{
            left: pendingRect.x,
            top: pendingRect.y,
            width: pendingRect.width,
            height: pendingRect.height,
            background: 'rgba(59, 130, 246, 0.2)',
            borderRadius: activeTool === 'radio' ? '50%' : 3,
          }}
        />
      )}

      {/* Popup d'assignation */}
      {showPopup && pendingRect && (
        <div
          className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-52"
          style={{
            left: Math.min(pendingRect.x + pendingRect.width + 8, window.innerWidth - 230),
            top: pendingRect.y,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-semibold text-gray-700 mb-2">Assigner à :</p>

          {signers.length > 0 && (
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
              <div className="border-t border-gray-100 mt-1 pt-1" />
            </div>
          )}
          <button
            className="text-left text-xs px-2 py-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            onClick={() => handleAssign(null, -1)}
          >
            Sans assignation
          </button>

          {/* Section groupe radio */}
          {(reassigningFieldIndex !== null
            ? fields[reassigningFieldIndex]?.fieldType === 'radio'
            : activeTool === 'radio') && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-700 mb-1.5">Groupe radio :</p>

              {/* Groupes existants */}
              {existingRadioGroups.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {existingRadioGroups.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setRadioGroupName(g)}
                      className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                        radioGroupName === g
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'border-gray-200 text-gray-500 hover:border-indigo-200 hover:text-indigo-600'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleNewRadioGroup}
                    className="text-xs px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
                    title="Nouveau groupe"
                  >
                    + nouveau
                  </button>
                </div>
              )}

              <input
                type="text"
                value={radioGroupName}
                onChange={(e) => setRadioGroupName(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400"
                placeholder="groupe_1"
              />
            </div>
          )}

          <button
            className="mt-2 w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
            onClick={handleCancelPopup}
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  )
}

function getFieldAtPos(fields, pos) {
  for (let i = fields.length - 1; i >= 0; i--) {
    const { canvasRect } = fields[i]
    if (
      pos.x >= canvasRect.x &&
      pos.x <= canvasRect.x + canvasRect.width &&
      pos.y >= canvasRect.y &&
      pos.y <= canvasRect.y + canvasRect.height
    ) return i
  }
  return -1
}

function getExistingRadioGroups(fields) {
  return [...new Set(
    fields
      .filter((f) => f.fieldType === 'radio')
      .map((f) => f.groupName)
      .filter(Boolean)
  )]
}
