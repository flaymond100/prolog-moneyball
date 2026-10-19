interface PlaceholderPageProps {
  title: string
  task: string
}

/** A view that is planned but not built yet. */
export function PlaceholderPage({ title, task }: PlaceholderPageProps) {
  return (
    <section aria-labelledby="page-title" className="space-y-2">
      <h1 id="page-title" className="text-2xl font-semibold">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">This view arrives with task {task}.</p>
    </section>
  )
}
