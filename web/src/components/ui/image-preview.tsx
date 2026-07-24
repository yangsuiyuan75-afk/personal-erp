import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import { useState } from 'react'

export function ImagePreview({
  alt,
  className,
  src,
}: {
  alt: string
  className?: string
  src: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        aria-label={`预览 ${alt}`}
        className={`image-preview-trigger ${className ?? ''}`}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        type="button"
      >
        <img alt={alt} src={src} />
      </button>
      <Lightbox close={() => setOpen(false)} open={open} plugins={[Zoom]} slides={[{ alt, src }]} />
    </>
  )
}
