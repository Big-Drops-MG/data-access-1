import { PageHeader } from "@/components/app/page-header"

type ModulePlaceholderPageProps = {
  title: string
}

/** Temporary module shell until the feature lands. */
export function ModulePlaceholderPage({ title }: ModulePlaceholderPageProps) {
  return (
    <PageHeader
      title={title}
      description={`${title} will be available in a later task.`}
    />
  )
}
