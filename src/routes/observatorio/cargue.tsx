import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { customFetch } from "@/api/client";
import { Button } from "@/design-system/primitives/Button";
import { Input } from "@/design-system/primitives/Input";
import { ObservatoryNav } from "@/design-system/patterns/ObservatoryNav";
import { ACTIVE_SNAPSHOT_KEY } from "@/lib/observatory/useActiveSnapshot";
import { useImportProfiles } from "@/lib/observatory/useImportProfiles";
import type {
  ImportJobStatus,
  ImportPreview,
  RowFailure,
} from "@/lib/observatory/types";

export const Route = createFileRoute("/observatorio/cargue")({
  beforeLoad: ({ context }) => {
    if (!context.can("CREATE", "OBSERVATORY")) {
      throw redirect({ to: "/", search: { denied: "OBSERVATORY" } });
    }
  },
  component: ObservatoryImportPage,
});

interface ImportForm {
  profileCode: string;
  source: string;
  cutoffDate: string;
  label: string;
}

/**
 * S13.FE.01 -- Vía A: cargar la plantilla tal como el analista la llena hoy.
 *
 * <p>El paso de PREVISUALIZAR es el corazón de esta pantalla, no un adorno:
 * hoy el archivo se carga a ciegas y el problema aparece cuando la cifra ya
 * está en la lámina que ve el comando (docs/00 §8.1). Aquí el analista ve
 * cuántas filas entran, cuántas ya estaban y qué fila exacta se rechaza y por
 * qué -- ANTES de escribir una sola fila.
 */
function ObservatoryImportPage() {
  const queryClient = useQueryClient();
  const profiles = useImportProfiles();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [form, setForm] = useState<ImportForm>({
    profileCode: "",
    source: "Fiscalía General de la Nación",
    cutoffDate: "",
    label: "",
  });
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [job, setJob] = useState<ImportJobStatus | null>(null);

  // El perfil elegido se DERIVA: mientras el analista no escoja, vale el primero
  // que el backend reporte. Sembrarlo con un efecto provocaría un render en
  // cascada y dejaría el estado y la pantalla desfasados un ciclo.
  const profileCode = form.profileCode || profiles.data?.[0]?.code || "";
  const selectedProfile = profiles.data?.find(
    (profile) => profile.code === profileCode,
  );

  // Un intervalo que sobrevive al desmontaje seguiría pegándole al backend desde
  // una pantalla que ya nadie mira.
  useEffect(() => () => stopPolling(), []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function importParams(): URLSearchParams | null {
    if (!profileCode || !form.source.trim() || !form.cutoffDate) return null;
    const params = new URLSearchParams({
      profileCode,
      source: form.source.trim(),
      cutoffDate: form.cutoffDate,
    });
    if (form.label.trim()) params.set("label", form.label.trim());
    return params;
  }

  function selectedFile(): File | null {
    return fileInputRef.current?.files?.[0] ?? null;
  }

  async function handlePreview() {
    const params = importParams();
    const file = selectedFile();
    if (!params || !file) {
      setError(
        "Faltan datos: escoja el archivo, la plantilla, la fuente y la fecha de corte.",
      );
      return;
    }
    setBusy("preview");
    setError(null);
    setJob(null);
    try {
      const body = new FormData();
      body.append("file", file);
      setPreview(
        await customFetch<ImportPreview>(
          `/api/v1/observatory/imports/preview?${params.toString()}`,
          {
            method: "POST",
            body,
          },
        ),
      );
    } catch (err) {
      setPreview(null);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo previsualizar el archivo.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function pollStatus(jobId: string) {
    try {
      const status = await customFetch<ImportJobStatus>(
        `/api/v1/observatory/imports/${jobId}`,
      );
      setJob(status);
      if (status.status === "DONE" || status.status === "FAILED") {
        stopPolling();
        if (status.status === "DONE") {
          // La banda de vigencia y la tabla de hechos quedan mostrando el corte anterior si no se invalidan.
          await queryClient.invalidateQueries({
            queryKey: ACTIVE_SNAPSHOT_KEY,
          });
          await queryClient.invalidateQueries({
            queryKey: ["observatory", "incidents"],
          });
        }
      }
    } catch {
      stopPolling();
      setError(
        "Se perdió el seguimiento del cargue. Consulte la pestaña Hechos para ver qué quedó registrado.",
      );
    }
  }

  async function handleImport() {
    const params = importParams();
    const file = selectedFile();
    if (!params || !file) return;
    setBusy("import");
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const accepted = await customFetch<{ jobId: string }>(
        `/api/v1/observatory/imports?${params.toString()}`,
        {
          method: "POST",
          body,
        },
      );
      setJob({
        jobId: accepted.jobId,
        status: "PROCESSING",
        requestedAt: new Date().toISOString(),
      });
      pollRef.current = setInterval(
        () => void pollStatus(accepted.jobId),
        1500,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo iniciar el cargue.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ObservatoryNav />

      {/*
        Igual que el boletín: esta pantalla es UN formulario de ancho propio, no
        una página que crezca con el monitor. Sin centrar quedaba pegada a la
        izquierda con dos tercios de pantalla vacíos (reportado por el cliente).
        Se centra el bloque completo —título, formulario e informes— para que
        todo comparta el mismo eje.
      */}
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-lg font-semibold text-text-primary">
          Cargar plantilla del registro nacional
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Vía A: se sube el archivo tal como se llena hoy. Recargar el mismo
          archivo no duplica nada — las filas que ya estaban se cuentan como
          omitidas.
        </p>

        <div className="mt-4 grid gap-3 rounded-sm border border-border-strong bg-surface-raised p-4">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Plantilla
            <select
              aria-label="Plantilla"
              value={profileCode}
              onChange={(event) =>
                setForm({ ...form, profileCode: event.target.value })
              }
              className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
            >
              {profiles.data?.map((profile) => (
                <option key={profile.code} value={profile.code}>
                  {profile.displayName} (v{profile.version})
                </option>
              ))}
            </select>
          </label>

          {selectedProfile && (
            <p className="text-2xs text-text-muted">
              Hojas que se van a leer:{" "}
              {selectedProfile.sheets.join(", ") || "—"}. Cualquier otra hoja
              del libro se ignora.
            </p>
          )}

          {selectedProfile?.provisional && (
            <p className="flex items-start gap-2 text-2xs text-alert">
              <AlertTriangle
                size={14}
                strokeWidth={1.5}
                className="mt-px shrink-0"
                aria-hidden
              />
              <span>
                Mapeo provisional: se construyó a partir de una captura parcial
                de la plantilla. Las columnas que no estén mapeadas no se leen —
                revise la previsualización antes de confirmar.
              </span>
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Fuente
              <Input
                value={form.source}
                onChange={(event) =>
                  setForm({ ...form, source: event.target.value })
                }
                placeholder="Fiscalía General de la Nación"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Fecha de corte
              <Input
                type="date"
                value={form.cutoffDate}
                onChange={(event) =>
                  setForm({ ...form, cutoffDate: event.target.value })
                }
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Etiqueta de la mesa (opcional)
            <Input
              value={form.label}
              onChange={(event) =>
                setForm({ ...form, label: event.target.value })
              }
              placeholder="Mesa de Seguimiento No.52"
            />
          </label>

          {/*
            El input de archivo del navegador se dibuja como texto suelto
            ("Seleccionar archivo · Sin archivos seleccionados") y nadie lo lee
            como algo que se pueda pulsar (reportado por el cliente). Se oculta el
            control nativo y se pone un BOTÓN de verdad delante.

            El input no se quita ni se reemplaza por un `onClick`: sigue en el
            DOM, enfocable y asociado a su etiqueta, así que el teclado y los
            lectores de pantalla lo siguen encontrando. El `peer-focus-visible`
            traslada el anillo de foco al botón, que es lo que se ve.
          */}
          <div className="flex flex-col gap-1 text-xs text-text-secondary">
            <span id="archivo-etiqueta">Archivo (.xlsx)</span>
            <input
              ref={fileInputRef}
              id="archivo"
              type="file"
              accept=".xlsx"
              aria-label="Archivo"
              onChange={(event) => {
                setFileName(event.target.files?.[0]?.name ?? null);
                setPreview(null);
                setJob(null);
              }}
              className="peer sr-only"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="archivo"
                className="inline-flex min-h-[var(--tap-min)] cursor-pointer items-center gap-2 rounded-sm border border-border-strong bg-surface-raised px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring sm:min-h-0"
              >
                <Upload size={16} strokeWidth={1.5} aria-hidden />
                {fileName ? "Cambiar archivo" : "Seleccionar archivo"}
              </label>

              {/* El nombre va JUNTO al botón: saber qué archivo está cargado es
                  parte de la decisión de confirmar el corte. */}
              {fileName ? (
                <span className="flex min-w-0 items-center gap-2 text-2xs text-text-primary">
                  <FileSpreadsheet
                    size={14}
                    strokeWidth={1.5}
                    className="shrink-0 text-text-muted"
                    aria-hidden
                  />
                  <span className="truncate">{fileName}</span>
                </span>
              ) : (
                <span className="text-2xs text-text-muted">
                  Ningún archivo seleccionado
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              loading={busy === "preview"}
              onClick={handlePreview}
            >
              Previsualizar
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={busy === "import"}
              disabled={!preview || job?.status === "PROCESSING"}
              onClick={handleImport}
            >
              Confirmar cargue
            </Button>
          </div>
          {!preview && (
            <p className="text-2xs text-text-muted">
              El cargue se habilita después de previsualizar: nadie escribe un
              corte sin haber visto qué entra.
            </p>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-critical" role="alert">
            {error}
          </p>
        )}

        {preview && <PreviewReport preview={preview} />}

        {job && <JobReport job={job} />}
      </div>
    </div>
  );
}

function Figure({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "alert" | "muted";
}) {
  return (
    <div className="rounded-sm border border-border bg-surface px-3 py-2">
      <p
        className={
          tone === "alert"
            ? "font-mono text-lg font-semibold text-alert"
            : "font-mono text-lg font-semibold text-text-primary"
        }
      >
        {value.toLocaleString("es-CO")}
      </p>
      <p className="text-2xs text-text-secondary">{label}</p>
    </div>
  );
}

function FailureList({ failures }: { failures: RowFailure[] }) {
  return (
    <div className="mt-3">
      <p className="text-2xs font-semibold uppercase text-alert">
        Filas rechazadas
      </p>
      <p className="text-2xs text-text-muted">
        Cada una dice qué campo y por qué. Las demás filas del archivo no se ven
        afectadas.
      </p>
      <ul className="mt-1 space-y-0.5 text-2xs text-text-secondary">
        {failures.map((failure) => (
          <li key={`${failure.sheetName}-${failure.rowNumber}`}>
            <span className="font-mono text-text-primary">
              {failure.sheetName} · fila {failure.rowNumber}
            </span>
            : {failure.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewReport({ preview }: { preview: ImportPreview }) {
  return (
    <section className="mt-4 max-w-3xl rounded-sm border border-border-strong bg-surface-raised p-4">
      <h2 className="text-sm font-semibold text-text-primary">
        Previsualización — no se escribió nada todavía
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Figure value={preview.totalRows} label="Filas leídas" />
        <Figure value={preview.created} label="Nuevas" />
        <Figure value={preview.skipped} label="Ya estaban" />
        <Figure
          value={preview.unresolvedMunicipalities}
          label="Municipio sin resolver"
          tone="alert"
        />
        <Figure
          value={preview.failures.length}
          label="Rechazadas"
          tone="alert"
        />
      </div>
      {preview.unresolvedMunicipalities > 0 && (
        <p className="mt-2 text-2xs text-text-secondary">
          Los hechos con municipio sin resolver SÍ se guardan, con el texto
          original intacto — el sistema nunca adivina un municipio. Se corrigen
          desde Hechos, sin volver al Excel.
        </p>
      )}
      {preview.failures.length > 0 && (
        <FailureList failures={preview.failures} />
      )}
    </section>
  );
}

function JobReport({ job }: { job: ImportJobStatus }) {
  return (
    <section className="mt-4 max-w-3xl rounded-sm border border-border-strong bg-surface-raised p-4">
      <h2 className="text-sm font-semibold text-text-primary">Cargue</h2>

      {(job.status === "PROCESSING" || job.status === "PENDING") && (
        <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
          <span
            className="h-2 w-2 animate-pulse rounded-full bg-accent"
            aria-hidden
          />{" "}
          Procesando el archivo…
        </p>
      )}

      {job.status === "FAILED" && (
        <p
          className="mt-2 flex items-start gap-2 text-sm text-critical"
          role="alert"
        >
          <AlertTriangle
            size={16}
            strokeWidth={1.5}
            className="mt-0.5 shrink-0"
            aria-hidden
          />
          Falló el cargue: {job.errorMessage ?? "sin detalle"}. El corte
          anterior sigue vigente.
        </p>
      )}

      {job.status === "DONE" && (
        <>
          <p className="mt-2 flex items-center gap-2 text-sm text-text-primary">
            <CheckCircle2
              size={16}
              strokeWidth={1.5}
              className="text-stable"
              aria-hidden
            />
            {(job.createdRows ?? 0).toLocaleString("es-CO")} hechos nuevos y{" "}
            {(job.skippedRows ?? 0).toLocaleString("es-CO")} que ya estaban, de{" "}
            {(job.totalRows ?? 0).toLocaleString("es-CO")} filas leídas.
          </p>
          {(job.failures?.length ?? 0) > 0 && (
            <FailureList failures={job.failures ?? []} />
          )}
        </>
      )}
    </section>
  );
}
