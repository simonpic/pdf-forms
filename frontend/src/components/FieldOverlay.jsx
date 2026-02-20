/**
 * Superpose des inputs HTML positionnés en absolu sur le canvas PDF.
 * Chaque input correspond à un champ assigné au signataire actuel.
 *
 * Conversion coordonnées PDF → CSS :
 *   cssLeft   = field.x * scale
 *   cssTop    = (pageHeightPt - field.y - field.height) * scale
 *   cssWidth  = field.width * scale
 *   cssHeight = field.height * scale
 *
 * @param {Array} fields - champs assignés au signataire
 * @param {number} scale - viewport.scale PDF.js
 * @param {number} pageHeightPt - hauteur de la page en points PDF
 * @param {Object} values - { fieldName: valeur courante }
 * @param {Function} onChange - (fieldName, value) => void
 */
export default function FieldOverlay({ fields, scale, pageHeightPt, values, onChange }) {
  if (!scale || !pageHeightPt) return null

  return (
    <>
      {fields.map((field) => {
        const cssLeft = field.x * scale
        const cssTop = (pageHeightPt - field.y - field.height) * scale
        const cssWidth = field.width * scale
        const cssHeight = field.height * scale
        const fontSize = Math.max(8, Math.min(14, field.height * scale * 0.6))

        return (
          <input
            key={field.fieldName}
            type="text"
            value={values[field.fieldName] ?? field.currentValue ?? ''}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            placeholder="Votre saisie…"
            style={{
              position: 'absolute',
              left: cssLeft,
              top: cssTop,
              width: cssWidth,
              height: cssHeight,
              fontSize,
              padding: '2px 4px',
              border: '2px solid rgb(59, 130, 246)',
              borderRadius: 3,
              background: 'rgba(219, 234, 254, 0.7)',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'Helvetica, Arial, sans-serif',
            }}
            onFocus={(e) => {
              e.target.style.background = 'rgba(219, 234, 254, 0.95)'
              e.target.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.4)'
            }}
            onBlur={(e) => {
              e.target.style.background = 'rgba(219, 234, 254, 0.7)'
              e.target.style.boxShadow = 'none'
            }}
          />
        )
      })}
    </>
  )
}
