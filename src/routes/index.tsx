import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary">Gaula Digital</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Consola operacional del GAULA. Seleccione una sección en el menú lateral.
      </p>
    </div>
  )
}
