import { FileVideo, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function VideoDownloadThumbnail(props: {
  src: string;
  alt: string;
  load?(): Promise<Response>;
}) {
  const [preview, setPreview] = useState<{ source: string; url?: string; loading?: boolean; failed?: boolean }>();
  const attempted = useRef(false);
  const generation = useRef(0);
  const objectUrl = useRef<string>();

  useEffect(() => {
    attempted.current = false;
    return () => {
      ++generation.current;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = undefined;
    };
  }, [props.src]);

  async function recover() {
    if (attempted.current || !props.load) {
      setPreview({ source: props.src, failed: true });
      return;
    }
    attempted.current = true;
    const request = generation.current;
    setPreview({ source: props.src, loading: true });
    try {
      const response = await props.load();
      if (!response.ok) throw new Error('Thumbnail unavailable');
      const blob = await response.blob();
      if (!blob.size || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('Invalid thumbnail');
      if (request !== generation.current) return;
      const url = URL.createObjectURL(blob);
      objectUrl.current = url;
      setPreview({ source: props.src, url });
    } catch {
      if (request === generation.current) setPreview({ source: props.src, failed: true });
    }
  }

  const current = preview?.source === props.src ? preview : undefined;
  return current?.loading || current?.failed
    ? <span className="video-download-image-placeholder" role="img" aria-label={props.alt} aria-busy={current.loading || undefined}>
        {current.loading ? <LoaderCircle size={24} className="smart-dubbing-spinner" aria-hidden="true" /> : <FileVideo size={24} aria-hidden="true" />}
      </span>
    : <img src={current?.url ?? props.src} alt={props.alt} onError={() => void recover()} />;
}
