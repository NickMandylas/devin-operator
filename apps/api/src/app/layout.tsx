import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Remediation Control Plane API',
  description: 'oRPC control plane for repository issue remediation',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
