import { ApiError, type ApiProblem } from '@/api/problem'

function readCsrfCookie(): string | undefined {
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

export interface UploadHandle<T> {
  promise: Promise<T>
  cancel: () => void
}

/**
 * S3.FE.03: `customFetch` (fetch API) no expone progreso de SUBIDA ni una
 * forma nativa de cancelar a mitad de camino -- XMLHttpRequest sí, vía
 * `upload.onprogress` y `.abort()`. Único lugar del frontend que usa XHR en
 * vez de fetch, deliberadamente, sólo por esto.
 */
export function uploadFileWithProgress<T>(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void,
): UploadHandle<T> {
  const xhr = new XMLHttpRequest()

  const promise = new Promise<T>((resolve, reject) => {
    xhr.open('POST', url)
    xhr.withCredentials = true
    const csrf = readCsrfCookie()
    if (csrf) xhr.setRequestHeader('X-XSRF-TOKEN', csrf)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!xhr.responseText) {
          resolve(undefined as T)
          return
        }
        try {
          resolve(JSON.parse(xhr.responseText) as T)
        } catch {
          resolve(undefined as T)
        }
      } else {
        const fallback: ApiProblem = {
          title: 'Error inesperado',
          detail: 'No se pudo subir el archivo. Si persiste, reporte el identificador de seguimiento.',
          status: xhr.status,
        }
        try {
          reject(new ApiError({ ...fallback, ...(JSON.parse(xhr.responseText) as Partial<ApiProblem>) }))
        } catch {
          reject(new ApiError(fallback))
        }
      }
    }

    xhr.onerror = () => reject(new Error('Error de red al subir el archivo.'))
    xhr.onabort = () => reject(new DOMException('Subida cancelada por el usuario.', 'AbortError'))

    xhr.send(formData)
  })

  return { promise, cancel: () => xhr.abort() }
}
