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
 * @param {Array}    fields        - champs assignés au signataire (avec fieldType, groupName)
 * @param {number}   scale         - viewport.scale PDF.js
 * @param {number}   pageHeightPt  - hauteur de la page en points PDF
 * @param {Object}   values        - { fieldName: valeur courante }
 * @param {Function} onChange      - (fieldName, value) => void
 */
export default function FieldOverlay({ fields, scale, pageHeightPt, values, onChange }) {
  if (!scale || !pageHeightPt) return null

  return (
    <>
      {fields.map((field) => {
        const cssLeft   = field.x * scale
        const cssTop    = (pageHeightPt - field.y - field.height) * scale
        const cssWidth  = field.width * scale
        const cssHeight = field.height * scale
        const fieldType = field.fieldType ?? 'text'

        // ── Case à cocher ────────────────────────────────────────────────────
        if (fieldType === 'checkbox') {
          const checked = (values[field.fieldName] ?? 'false') === 'true'
          return (
            <div
              key={field.fieldName}
              style={{
                position: 'absolute',
                left: cssLeft,
                top: cssTop,
                width: cssWidth,
                height: cssHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid rgb(16, 185, 129)',
                borderRadius: 3,
                background: 'rgba(209, 250, 229, 0.7)',
                boxSizing: 'border-box',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(field.fieldName, e.target.checked ? 'true' : 'false')}
                style={{
                  width: '70%',
                  height: '70%',
                  cursor: 'pointer',
                  accentColor: 'rgb(16, 185, 129)',
                }}
              />
            </div>
          )
        }

        // ── Bouton radio ─────────────────────────────────────────────────────
        if (fieldType === 'radio') {
          const checked = (values[field.fieldName] ?? 'false') === 'true'
          return (
            <div
              key={field.fieldName}
              style={{
                position: 'absolute',
                left: cssLeft,
                top: cssTop,
                width: cssWidth,
                height: cssHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `2px solid ${checked ? 'rgb(245, 158, 11)' : 'rgb(203, 213, 225)'}`,
                borderRadius: '50%',
                background: checked ? 'rgba(254, 243, 199, 0.85)' : 'rgba(241, 245, 249, 0.7)',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <input
                type="radio"
                name={field.groupName ?? 'radio-group'}
                checked={checked}
                onChange={() => onChange(field.fieldName, 'true')}
                style={{
                  width: '60%',
                  height: '60%',
                  cursor: 'pointer',
                  accentColor: 'rgb(245, 158, 11)',
                }}
              />
            </div>
          )
        }

        // ── Champ texte (défaut) ──────────────────────────────────────────────
        const fontSize = Math.max(8, Math.min(14, cssHeight * 0.6))
        return (
          <input
            key={field.fieldName}
            type="text"
            value={values[field.fieldName] ?? field.currentValue ?? ''}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            placeholder={field.label || 'Votre saisie…'}
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
