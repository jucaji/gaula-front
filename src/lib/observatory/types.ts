/**
 * SPEC-0801/0802: los tipos del observatorio se escriben a mano, igual que en
 * el resto de pantallas del proyecto -- Orval sólo regenera cuando alguien
 * corre el generador contra el backend vivo, y estas rutas se construyeron
 * contra el contrato real de `CrimeIncidentController`/`DatasetSnapshotController`.
 */

export type IncidentProfile = 'EXTORTION' | 'KIDNAPPING'
export type KidnappingType = 'SIMPLE' | 'EXTORSIVO'
export type VictimStatus =
  | 'LIBERADO'
  | 'RESCATADO'
  | 'MUERTO_EN_CAUTIVERIO'
  | 'LIBERADO_BAJO_PRESION'
  | 'FUGA'
  | 'SIN_ESTABLECER'
export type ExtortionModality =
  | 'LLAMADA_TELEFONICA'
  | 'REDES_SOCIALES'
  | 'PERSONALMENTE'
  | 'PANFLETOS'
  | 'SIN_ESTABLECER'

export interface DatasetSnapshot {
  id: string
  source: string
  cutoffDate: string
  label?: string | null
  status: 'ACTIVE' | 'SUPERSEDED'
  loadedBy: string
  /** Puede venir nulo: un corte cargado por un usuario ya borrado no deja la banda sin corte. */
  loadedByName?: string | null
  loadedAt: string
  incidentCount: number
}

export interface CrimeIncident {
  id: string
  snapshotId: string
  profile: IncidentProfile
  occurredOn: string
  departmentText: string
  municipalityText: string
  municipalityCode?: string | null
  /** SPEC-0801 CA-3: el sistema NUNCA adivina el municipio; lo marca y lo deja corregir. */
  municipalityUnresolved: boolean
  authorGroup: string
  kidnappingType?: KidnappingType | null
  victimStatus?: VictimStatus | null
  occupation?: string | null
  modality?: ExtortionModality | null
  notes?: string | null
  /** SPEC-0806: columnas declaradas en el perfil que no tienen columna tipada propia. */
  attributes: Record<string, string>
  sourceRowNumber?: number | null
  registeredAt: string
  updatedAt?: string | null
}

export interface RowFailure {
  sheetName: string
  rowNumber: number
  reason: string
}

export interface ImportPreview {
  totalRows: number
  created: number
  updated: number
  skipped: number
  unresolvedMunicipalities: number
  failures: RowFailure[]
}

export interface ImportJobStatus {
  jobId: string
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
  snapshotId?: string | null
  totalRows?: number | null
  createdRows?: number | null
  skippedRows?: number | null
  failures?: RowFailure[] | null
  errorMessage?: string | null
  requestedAt: string
  completedAt?: string | null
}

export interface ImportProfileSummary {
  id: string
  code: string
  version: number
  /** Se muestra en pantalla: el analista tiene que saber que el mapeo es una hipótesis (docs/00 §8.8). */
  provisional: boolean
  displayName: string
  sheets: string[]
  /** SPEC-0806 CA-1: con esto la consola DIBUJA el formulario en vez de llevarlo escrito a mano. */
  forms: SheetForm[]
  validFrom: string
}

export interface SheetForm {
  sheetName: string
  profile: IncidentProfile
  fields: FormField[]
}

export interface FormField {
  code: string
  label: string
  /** `DERIVED`: no se captura ni se guarda; la consola lo calcula del propio hecho. */
  type: 'TEXT' | 'DATE' | 'ENUM' | 'DERIVED'
  required: boolean
  /** `true`: el valor viaja en `attributes`, no en una columna tipada. */
  dynamic: boolean
  options: FormFieldOption[]
}

export interface FormFieldOption {
  value: string
  label: string
}

export interface IncidentPage {
  content: CrimeIncident[]
  totalElements: number
  totalPages: number
  pageNumber: number
  pageSize: number
}

export const PROFILE_LABEL: Record<IncidentProfile, string> = {
  EXTORTION: 'Extorsión',
  KIDNAPPING: 'Secuestro',
}

export const KIDNAPPING_TYPE_LABEL: Record<KidnappingType, string> = {
  SIMPLE: 'Simple',
  EXTORSIVO: 'Extorsivo',
}

export const VICTIM_STATUS_LABEL: Record<VictimStatus, string> = {
  LIBERADO: 'Liberado',
  RESCATADO: 'Rescatado',
  MUERTO_EN_CAUTIVERIO: 'Muerto en cautiverio',
  LIBERADO_BAJO_PRESION: 'Liberado bajo presión',
  FUGA: 'Fuga',
  SIN_ESTABLECER: 'Sin establecer',
}

export const MODALITY_LABEL: Record<ExtortionModality, string> = {
  LLAMADA_TELEFONICA: 'Llamada telefónica',
  REDES_SOCIALES: 'Redes sociales',
  PERSONALMENTE: 'Personalmente',
  PANFLETOS: 'Panfletos',
  SIN_ESTABLECER: 'Sin establecer',
}

/** SPEC-0803: lo que devuelve `/observatory/dashboard`. Conteos exactos, nunca porcentajes. */
export interface Breakdown {
  key: string
  count: number
}

export interface MonthlyPoint {
  month: string
  count: number
}

export interface YearlyPoint {
  year: number
  count: number
}

export interface IncidentDashboard {
  /** Nulo = no hay corte vigente. NO es lo mismo que un tablero de ceros (CA-5). */
  snapshotId: string | null
  total: number
  byAuthorGroup: Breakdown[]
  byDepartment: Breakdown[]
  byMunicipality: Breakdown[]
  byModality: Breakdown[]
  byVictimStatus: Breakdown[]
  byKidnappingType: Breakdown[]
  byOccupation: Breakdown[]
  monthly: MonthlyPoint[]
  yearly: YearlyPoint[]
  /** SPEC-0807: sólo los municipios que tienen dónde pintarse. */
  map: MapPoint[]
  /**
   * Hechos que SÍ entraron al mapa. Comparado con `total` dice cuántos quedaron
   * fuera por no tener municipio resuelto o centroide: un mapa que muestra menos
   * de lo que hay sin avisar es un mapa que miente.
   */
  mappedTotal: number
}

export interface MapPoint {
  municipalityCode: string
  municipalityText: string
  count: number
  latitude: number
  longitude: number
}

export interface Bulletin {
  snapshotId: string
  source: string
  cutoffDate: string
  label?: string | null
  loadedByName?: string | null
  loadedAt: string
  generatedAt: string
  extortionTotal: number
  kidnappingTotal: number
  topAuthorGroups: Breakdown[]
  topDepartments: Breakdown[]
  byModality: Breakdown[]
  byVictimStatus: Breakdown[]
  /** Ausente cuando no hay corte anterior comparable: se omite la sección, no se escribe 0% (CA-4). */
  previousComparison?: {
    previousCutoffDate: string
    previousExtortionTotal: number
    previousKidnappingTotal: number
  } | null
}

/** SPEC-0805: lo que el análisis estadístico agrega. `available: false` es una respuesta válida. */
export interface IncidentAnalysis {
  available: boolean
  unavailableReason?: string | null
  snapshotId?: string | null
  trend: { month: string; observed: number; trend?: number | null; seasonal?: number | null }[]
  variations: {
    label: string
    current: number
    previous: number
    changePct?: number | null
    lowerPct?: number | null
    upperPct?: number | null
    significant: boolean
    explanation: string
  }[]
  anomalies: {
    municipalityCode?: string | null
    municipalityText: string
    month: string
    observed: number
    expected: number
    zScore: number
    explanation: string
  }[]
  hotspots: { clusterId: number; municipalities: string[]; totalCount: number }[]
  /** CA-3: proyección, NUNCA dato. Viaja en su propia lista, con banda. */
  forecast: { month: string; projected: number; lower: number; upper: number }[]
  notes: string[]
}
