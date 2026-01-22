export default function MobileBlockedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="max-w-md text-center">
        <h1 className="mb-4 text-2xl font-semibold">
          Desktop Only
        </h1>
        <p className="text-muted-foreground">
          Kontexted is currently optimized for desktop browsers only. Please access this application from a computer.
        </p>
      </div>
    </div>
  )
}
