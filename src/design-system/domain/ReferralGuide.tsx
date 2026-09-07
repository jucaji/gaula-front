import type { ReferralGuidelineResponse } from '@/api/generated/models'

/**
 * S5.FE.01 (docs/06 §7.2): autoridad, línea, tipificación y evidencia que
 * debe reunir el ciudadano -- la misma información que termina congelada en
 * `intake.referral` y exportada como tarjeta imprimible (`GET
 * /calls/{id}/referral/export.pdf`, S5.ADI.02).
 */
export function ReferralGuide({
  guideline,
  selected,
  onSelect,
}: {
  guideline: ReferralGuidelineResponse
  selected: boolean
  onSelect: () => void
}) {
  return (
    <label className="flex items-start gap-2 rounded-sm border border-border-strong p-2 text-sm has-[:checked]:border-accent">
      <input type="radio" name="referral-authority" checked={selected} onChange={onSelect} className="mt-1" />
      <span>
        <span className="font-medium text-text-primary">
          {guideline.authorityName} {guideline.authorityHotline && `· ${guideline.authorityHotline}`}
        </span>
        <p className="text-text-secondary">{guideline.instructions}</p>
        {(guideline.requiredEvidence?.length ?? 0) > 0 && (
          <p className="text-2xs text-text-muted">Evidencia: {guideline.requiredEvidence?.join(', ')}</p>
        )}
      </span>
    </label>
  )
}
