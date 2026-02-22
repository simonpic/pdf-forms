import { useState, useRef, useCallback, useEffect, Fragment } from 'react'
import { GripVertical, Trash2 } from 'lucide-react'

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

// Taille de la poignée de déplacement (checkbox/radio)
const HANDLE_SIZE = 14

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
  currentPage = 0,
  signers,
  fields,
  onFieldAdded,
  onFieldReassigned,
  onFieldMoved,
  onFieldRemoved,
  activeTool = 'text',
  disabled = false,
}) {
  const [drawing, setDrawing] = useState(false)
  const [startPos, setStartPos] = useState(null)
  const [currentRect, setCurrentRect] = useState(null)
  const [pendingRect, setPendingRect] = useState(null)
  const [showPopup, setShowPopup] = useState(false)
  const [fieldLabel, setFieldLabel] = useState('')
  const [pendingSignerIndex, setPendingSignerIndex] = useState(-1)
  const [radioGroupName, setRadioGroupName] = useState('groupe_1')
  const [hoveredFieldIndex, setHoveredFieldIndex] = useState(-1)
  const [reassigningFieldIndex, setReassigningFieldIndex] = useState(null)
  // dragState : { fieldIndex, startPos, startCanvasRect, isActive }
  const [dragState, setDragState] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const layerRef = useRef(null)

  // Réinitialise l'état de dessin quand l'outil change
  useEffect(() => {
    setDrawing(false)
    setCurrentRect(null)
    setStartPos(null)
    setShowPopup(false)
    setPendingRect(null)
  }, [activeTool])

  const handleCancelPopup = useCallback(() => {
    setShowPopup(false)
    setPendingRect(null)
    setCurrentRect(null)
    setStartPos(null)
    setReassigningFieldIndex(null)
  }, [])

  const getRelativePos = (e) => {
    const rect = layerRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseDown = useCallback((e) => {
    if (showPopup) {
      handleCancelPopup()
      return
    }
    e.preventDefault()
    const pos = getRelativePos(e)

    // 1. Poignée de drag (checkbox/radio) — priorité max
    for (let i = fields.length - 1; i >= 0; i--) {
      if (fields[i].page !== currentPage) continue
      if (fields[i].fieldType !== 'text' && isInHandleZone(fields[i], pos)) {
        setDragState({ fieldIndex: i, startPos: pos, startCanvasRect: { ...fields[i].canvasRect }, isActive: false })
        setHoveredFieldIndex(-1)
        return
      }
    }

    // 2. Corps d'un champ existant
    const hitIndex = getFieldAtPos(fields, pos, currentPage)
    if (hitIndex !== -1) {
      const field = fields[hitIndex]
      if (field.fieldType === 'text') {
        // Champ texte : potentiel drag, disambiguation au move
        setDragState({ fieldIndex: hitIndex, startPos: pos, startCanvasRect: { ...field.canvasRect }, isActive: false })
        setHoveredFieldIndex(-1)
      } else {
        // Checkbox/radio corps → popup d'assignation
        setReassigningFieldIndex(hitIndex)
        setPendingRect(field.canvasRect)
        setFieldLabel(field.label || '')
        setPendingSignerIndex(signers.findIndex(s => s.signerId === field.assignedTo))
        if (field.fieldType === 'radio') setRadioGroupName(field.groupName || 'groupe_1')
        setShowPopup(true)
      }
      return
    }

    // 3. Zone vide → dessin
    setStartPos(pos)
    if (activeTool === 'text') {
      setDrawing(true)
      setCurrentRect(null)
    }
  }, [showPopup, activeTool, fields])

  const handleMouseMove = useCallback((e) => {
    const pos = getRelativePos(e)

    // Drag actif
    if (dragState) {
      const dx = pos.x - dragState.startPos.x
      const dy = pos.y - dragState.startPos.y
      if (!dragState.isActive && Math.sqrt(dx * dx + dy * dy) > 5) {
        setDragState(prev => ({ ...prev, isActive: true }))
      }
      if (dragState.isActive) setDragOffset({ x: dx, y: dy })
      return
    }

    // Hover detection
    if (!drawing && !showPopup) {
      setHoveredFieldIndex(getFieldAtPos(fields, pos, currentPage))
    }

    // Dessin texte
    if (!drawing || !startPos || activeTool !== 'text') return
    setCurrentRect({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
    })
  }, [drawing, startPos, activeTool, fields, showPopup, dragState])

  const handleMouseUp = useCallback(() => {
    // Finalisation d'un drag
    if (dragState) {
      if (dragState.isActive) {
        const { fieldIndex, startCanvasRect } = dragState
        const newCanvasRect = {
          x: startCanvasRect.x + dragOffset.x,
          y: startCanvasRect.y + dragOffset.y,
          width: startCanvasRect.width,
          height: startCanvasRect.height,
        }
        const pdfX = newCanvasRect.x / scale
        const pdfY = pageHeightPt - (newCanvasRect.y + newCanvasRect.height) / scale
        onFieldMoved(fieldIndex, {
          canvasRect: newCanvasRect,
          x: Math.round(pdfX * 100) / 100,
          y: Math.round(pdfY * 100) / 100,
        })
      } else {
        // Pas de mouvement → clic → popup d'assignation (texte uniquement)
        const field = fields[dragState.fieldIndex]
        setReassigningFieldIndex(dragState.fieldIndex)
        setPendingRect(field.canvasRect)
        setFieldLabel(field.label || '')
        setPendingSignerIndex(signers.findIndex(s => s.signerId === field.assignedTo))
        if (field.fieldType === 'radio') setRadioGroupName(field.groupName || 'groupe_1')
        setShowPopup(true)
      }
      setDragState(null)
      setDragOffset({ x: 0, y: 0 })
      return
    }

    // Dessin normal
    if (!startPos) return

    if (activeTool === 'text') {
      setDrawing(false)
      if (currentRect && currentRect.width > 15 && currentRect.height > 10) {
        setPendingRect(currentRect)
        setFieldLabel('')
        setPendingSignerIndex(-1)
        setCurrentRect(null)
        setStartPos(null)
        setShowPopup(true)
      } else {
        setCurrentRect(null)
        setStartPos(null)
      }
    } else {
      const size = activeTool === 'checkbox' ? CHECKBOX_SIZE_PX : RADIO_SIZE_PX
      setPendingRect({
        x: startPos.x - size / 2,
        y: startPos.y - size / 2,
        width: size,
        height: size,
      })
      if (activeTool === 'radio') {
        const existingGroups = getExistingRadioGroups(fields)
        const last = existingGroups[existingGroups.length - 1]
        setRadioGroupName(last ?? 'groupe_1')
      }
      setFieldLabel('')
      setPendingSignerIndex(-1)
      setStartPos(null)
      setShowPopup(true)
    }
  }, [dragState, dragOffset, startPos, activeTool, currentRect, fields, scale, pageHeightPt, onFieldMoved])

  const handleAssign = (signer, index) => {
    const trimmedLabel = fieldLabel.trim()
    if (reassigningFieldIndex !== null) {
      // Mode réassignation : on met à jour le champ existant
      const fieldType = fields[reassigningFieldIndex].fieldType
      onFieldReassigned(reassigningFieldIndex, {
        assignedTo: signer ? signer.signerId : '',
        signerName: signer ? signer.name : null,
        signerIndex: signer ? index : -1,
        label: trimmedLabel,
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
        label: trimmedLabel,
        assignedTo: signer ? signer.signerId : '',
        signerName: signer ? signer.name : null,
        signerIndex: signer ? index : -1,
        page: currentPage,
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
        disabled                 ? 'pointer-events-none'
        : showPopup              ? 'cursor-default'
        : dragState?.isActive    ? 'cursor-grabbing'
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
        if (field.page !== currentPage) return null
        const isDragged = dragState?.isActive && dragState.fieldIndex === i
        const rect = isDragged
          ? {
              x: dragState.startCanvasRect.x + dragOffset.x,
              y: dragState.startCanvasRect.y + dragOffset.y,
              width: dragState.startCanvasRect.width,
              height: dragState.startCanvasRect.height,
            }
          : field.canvasRect

        const unassigned = !field.signerName
        const colorIndex = field.signerIndex >= 0 ? field.signerIndex : i % SIGNER_COLORS.length
        const bg     = unassigned ? 'rgba(100,116,139,0.15)' : SIGNER_COLORS[colorIndex % SIGNER_COLORS.length]
        const border = unassigned ? 'rgb(148,163,184)'       : SIGNER_BORDER_COLORS[colorIndex % SIGNER_BORDER_COLORS.length]
        const color  = unassigned ? 'rgb(100,116,139)'       : SIGNER_BORDER_COLORS[colorIndex % SIGNER_BORDER_COLORS.length]
        const isCheckbox = field.fieldType === 'checkbox'
        const isRadio = field.fieldType === 'radio'
        const isText = !isCheckbox && !isRadio
        const showHandle = !isText && (hoveredFieldIndex === i || dragState?.fieldIndex === i)

        return (
          <Fragment key={field.fieldName}>
            {/* Label au-dessus du champ */}
            {field.label && (
              <div
                className="absolute pointer-events-none select-none"
                style={{
                  left: rect.x,
                  top: rect.y - 15,
                  maxWidth: rect.width + 40,
                  fontSize: 9,
                  fontWeight: 600,
                  color,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1,
                }}
              >
                {field.label}
              </div>
            )}

            <div
              className="absolute flex items-center justify-center pointer-events-none select-none"
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                background: bg,
                border: `2px solid ${border}`,
                borderRadius: isRadio ? '50%' : 3,
                color,
                overflow: 'hidden',
              }}
            >
              {isCheckbox && (
                <span style={{ fontSize: Math.round(rect.width * 0.6), lineHeight: 1 }}>☑</span>
              )}
              {isRadio && (
                <span style={{ fontSize: Math.round(rect.width * 0.55), lineHeight: 1 }}>◉</span>
              )}
              {isText && (
                <span className="text-xs px-1 truncate font-medium">{field.signerName}</span>
              )}
            </div>

            {/* Poignée de déplacement (checkbox / radio) */}
            {showHandle && (
              <div
                className="absolute flex items-center justify-center bg-white border border-slate-300 rounded-sm shadow-sm pointer-events-none select-none"
                style={{
                  left: rect.x + rect.width - HANDLE_SIZE / 2,
                  top: rect.y - HANDLE_SIZE / 2,
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  cursor: 'grab',
                }}
              >
                <GripVertical size={8} className="text-slate-400" />
              </div>
            )}
          </Fragment>
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

      {/* Overlay transparent — ferme la popup au clic en dehors */}
      {showPopup && (
        <div className="fixed inset-0 z-40" onMouseDown={handleCancelPopup} />
      )}

      {/* Popup de configuration */}
      {showPopup && pendingRect && (
        <div
          className="absolute z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-64 overflow-hidden"
          style={{
            left: Math.min(pendingRect.x + pendingRect.width + 8, window.innerWidth - 272),
            top: Math.max(8, pendingRect.y),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between px-4 pt-3 pb-2.5 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-700">Configurer le champ</span>
            {reassigningFieldIndex !== null && (
              <button
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors"
                onClick={() => {
                  onFieldRemoved(reassigningFieldIndex)
                  setShowPopup(false)
                  setPendingRect(null)
                  setReassigningFieldIndex(null)
                  setFieldLabel('')
                  setPendingSignerIndex(-1)
                }}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="px-4 py-3 space-y-4">

            {/* Label */}
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Label</label>
              <input
                type="text"
                value={fieldLabel}
                onChange={(e) => setFieldLabel(e.target.value)}
                placeholder="Ex : Nom complet, Date…"
                className="w-full text-xs border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-slate-50"
                onKeyDown={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>

            {/* Signataire */}
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">Signataire</label>
              <div className="space-y-0.5">
                {signers.map((signer, index) => {
                  const isSelected = pendingSignerIndex === index
                  const color = SIGNER_BORDER_COLORS[index % SIGNER_BORDER_COLORS.length]
                  return (
                    <button
                      key={signer.signerId}
                      onClick={() => setPendingSignerIndex(index)}
                      className={`flex items-center gap-2.5 w-full text-left px-2 py-1.5 rounded-md transition-colors ${
                        isSelected ? 'bg-slate-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div
                        className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                        style={{ borderColor: isSelected ? color : '#cbd5e1' }}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
                      </div>
                      <span
                        className="text-xs truncate font-medium transition-colors"
                        style={{ color: isSelected ? color : '#64748b' }}
                      >
                        {signer.name}
                      </span>
                    </button>
                  )
                })}

                {/* Sans assignation */}
                <button
                  onClick={() => setPendingSignerIndex(-1)}
                  className={`flex items-center gap-2.5 w-full text-left px-2 py-1.5 rounded-md transition-colors ${
                    pendingSignerIndex === -1 ? 'bg-slate-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: pendingSignerIndex === -1 ? '#94a3b8' : '#cbd5e1' }}
                  >
                    {pendingSignerIndex === -1 && <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />}
                  </div>
                  <span className="text-xs text-slate-400">Sans assignation</span>
                </button>
              </div>
            </div>

            {/* Groupe radio */}
            {(reassigningFieldIndex !== null
              ? fields[reassigningFieldIndex]?.fieldType === 'radio'
              : activeTool === 'radio') && (
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">Groupe radio</label>
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
                            : 'border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleNewRadioGroup}
                      className="text-xs px-1.5 py-0.5 rounded border border-dashed border-slate-300 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
                    >
                      + nouveau
                    </button>
                  </div>
                )}
                <input
                  type="text"
                  value={radioGroupName}
                  onChange={(e) => setRadioGroupName(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 bg-slate-50"
                  placeholder="groupe_1"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => handleAssign(
                  pendingSignerIndex >= 0 ? signers[pendingSignerIndex] : null,
                  pendingSignerIndex
                )}
                className="text-xs px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors"
              >
                Confirmer
              </button>
          </div>
        </div>
      )}
    </div>
  )
}

function getHandleRect(canvasRect) {
  return {
    x: canvasRect.x + canvasRect.width - HANDLE_SIZE / 2,
    y: canvasRect.y - HANDLE_SIZE / 2,
  }
}

function isInHandleZone(field, pos) {
  if (field.fieldType === 'text') return false
  const h = getHandleRect(field.canvasRect)
  return (
    pos.x >= h.x && pos.x <= h.x + HANDLE_SIZE &&
    pos.y >= h.y && pos.y <= h.y + HANDLE_SIZE
  )
}

function getFieldAtPos(fields, pos, currentPage = 0) {
  for (let i = fields.length - 1; i >= 0; i--) {
    if (fields[i].page !== currentPage) continue
    const { canvasRect, fieldType } = fields[i]
    // Inclure la zone de poignée dans la détection du hover
    if (fieldType !== 'text' && isInHandleZone(fields[i], pos)) return i
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
