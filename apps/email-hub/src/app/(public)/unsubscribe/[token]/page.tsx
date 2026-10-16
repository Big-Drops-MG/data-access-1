type UnsubscribePageProps = {
  params: Promise<{ token: string }>
}

export default async function UnsubscribePage({
  params,
}: UnsubscribePageProps) {
  const { token } = await params

  return (
    <div className="w-full max-w-md space-y-2 text-center">
      <h1 className="text-xl font-medium">Unsubscribe</h1>
      <p className="text-sm text-muted-foreground">
        Public page scaffold. Opening this page changes nothing until the
        confirm action is wired.
      </p>
      <p className="font-mono text-xs text-muted-foreground">token: {token}</p>
    </div>
  )
}
