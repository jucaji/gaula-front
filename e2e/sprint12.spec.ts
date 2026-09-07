import { test, expect, type Page } from '@playwright/test'

/**
 * E3.1 adelantado (SPEC-0301, S12.ADI.01): solicitudes a terceros con SLA,
 * nueva pestaña "Solicitudes a terceros" en /casos/$trackingNumber -- no
 * estaba en el backlog como tarea de frontend, agregada a pedido explícito
 * (mismo criterio que S11.FE.01). `ExternalDataRequestController` recibe el
 * `id` (UUID) del caso, no el radicado -- único endpoint del backend que
 * rompe esa convención.
 */
const ANALYST_SESSION = {
  userId: '00000000-0000-0000-0000-000000000202',
  displayName: 'Sargento Cárdenas Marín',
  roles: ['INTELLIGENCE_ANALYST'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000101',
}

const HOTLINE_OPERATOR_SESSION = {
  userId: '00000000-0000-0000-0000-000000000201',
  displayName: 'Soldado Ramírez Gómez',
  roles: ['HOTLINE_OPERATOR'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000101',
}

async function mockSession(page: Page, session: Record<string, unknown>) {
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }))
}

const TRACKING_NUMBER = 'GAULA-BOG-2026-000004'
const CASE_FILE_ID = '13e23830-6099-4079-a1a1-95120a83f3ef'

function caseFileBody() {
  return {
    id: CASE_FILE_ID,
    trackingNumber: TRACKING_NUMBER,
    status: 'RECEIVED',
    priority: 'NORMAL',
    classificationLevel: 'RESTRICTED',
    crimeTypeCode: 'KIDNAPPING',
    municipalityCode: '11001',
    summary: 'Denunciante reporta llamada exigiendo dinero por presunto secuestro.',
    involvesMinor: false,
    version: 1,
  }
}

test('S12.FE.01: enviar una solicitud a un tercero, descargar el oficio y registrar la respuesta con SLA', async ({ page }) => {
  await mockSession(page, ANALYST_SESSION)
  await page.route(`**/api/v1/case-files/${TRACKING_NUMBER}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(caseFileBody()) }),
  )

  const requestId = 'f09a674f-1d72-4d20-999b-183dc28e1ba3'
  let requests: Record<string, unknown>[] = []
  let sendBody: Record<string, unknown> | null = null
  let respondBody: Record<string, unknown> | null = null

  await page.route(`**/api/v1/case-files/${CASE_FILE_ID}/external-data-requests`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(requests) }),
  )
  await page.route('**/api/v1/external-data-requests', (route) => {
    sendBody = route.request().postDataJSON() as Record<string, unknown>
    requests = [
      {
        id: requestId,
        caseFileId: CASE_FILE_ID,
        thirdPartyName: sendBody['thirdPartyName'],
        dataRequested: sendBody['dataRequested'],
        legalBasis: sendBody['legalBasis'],
        status: 'SENT',
        requestedAt: '2026-09-07T22:00:00Z',
      },
    ]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(requests[0]) })
  })
  await page.route(`**/api/v1/external-data-requests/${requestId}/oficio`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Content-Disposition': 'attachment; filename="oficio.pdf"' }, body: Buffer.from('%PDF-fake') }),
  )
  await page.route(`**/api/v1/external-data-requests/${requestId}/respond`, (route) => {
    respondBody = route.request().postDataJSON() as Record<string, unknown>
    requests = [{ ...requests[0], status: 'RESPONDED', respondedAt: '2026-09-07T22:05:00Z', outcome: respondBody['outcome'], responseNotes: respondBody['responseNotes'] }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(requests[0]) })
  })

  await page.goto(`/casos/${TRACKING_NUMBER}`)
  await page.getByRole('button', { name: 'Solicitudes a terceros' }).click()
  await expect(page.getByText('Sin solicitudes a terceros todavía.')).toBeVisible()

  await page.getByPlaceholder('Tercero (entidad/operador) *').fill('Claro Colombia S.A.')
  await page.getByPlaceholder('Base legal (opcional)').fill('Ley 1621 de 2013')
  await page.getByPlaceholder('Dato solicitado *').fill('Registro de llamadas del número 3001234567')
  await page.getByRole('button', { name: 'Enviar solicitud' }).click()

  await expect(page.getByText('Claro Colombia S.A.')).toBeVisible()
  await expect(page.getByText('○ Enviada')).toBeVisible()
  expect(sendBody).toMatchObject({ caseFileId: CASE_FILE_ID, thirdPartyName: 'Claro Colombia S.A.' })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar oficio' }).click()
  await downloadPromise

  await page.locator('select').selectOption('GRANTED')
  await page.getByPlaceholder('Notas (opcional)').fill('Operador entregó el CDR completo.')
  await page.getByRole('button', { name: 'Registrar respuesta' }).click()

  await expect(page.getByText('● Respondida')).toBeVisible()
  await expect(page.getByText('Concedida')).toBeVisible()
  await expect(page.getByText(/SLA: /)).toBeVisible()
  expect(respondBody).toMatchObject({ outcome: 'GRANTED' })
})

test('S12.FE.01: HOTLINE_OPERATOR no ve la pestaña "Solicitudes a terceros"', async ({ page }) => {
  await mockSession(page, HOTLINE_OPERATOR_SESSION)
  await page.route(`**/api/v1/case-files/${TRACKING_NUMBER}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(caseFileBody()) }),
  )

  await page.goto(`/casos/${TRACKING_NUMBER}`)
  await expect(page.getByText('Denunciante reporta llamada')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Solicitudes a terceros' })).toHaveCount(0)
})
