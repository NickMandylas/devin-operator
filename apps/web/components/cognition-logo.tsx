import Image from "next/image"

import { cn } from "@/lib/utils"

export function CognitionLogo({ className }: { className?: string }) {
  return (
    <Image
      src="https://cognition.com/icon.svg"
      width={20}
      height={20}
      alt="Cognition"
      unoptimized
      className={cn("size-5", className)}
    />
  )
}
