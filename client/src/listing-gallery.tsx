import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GalleryLightbox } from '@/components/GalleryLightbox';
import { type PhotoSwipeHandle } from '@/components/PhotoSwipe';
import sheet from './index.css?inline';

/**
 * The listing page is HTML, so it cannot mount the app's gallery on its own.
 *
 * The stylesheet has to travel with the dialog. Dropping it on the page would
 * restyle the article. It lives in a shadow root, and the dialog is portaled
 * there so its classes resolve. The root sits above the accessibility button,
 * which is otherwise the topmost thing on the page.
 */
function openListingGallery(images: string[], alt: string): void {
  // Dev serves this module twice, once under the name the page asks for and once
  // under its own file. The second pass would open a second copy of the dialog.
  if (document.getElementById('u365-listing-gallery')) return;
  const host = document.createElement('div');
  host.id = 'u365-listing-gallery';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${sheet}\n.fixed.inset-0{z-index:2147483646!important}`;
  const mount = document.createElement('div');
  shadow.append(style, mount);
  document.body.append(host);

  createRoot(mount).render(<ListingLightbox images={images} alt={alt} container={mount} />);
}

function ListingLightbox({
  images,
  alt,
  container,
}: {
  images: string[];
  alt: string;
  container: HTMLElement;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const swipe = useRef<PhotoSwipeHandle>(null);

  useEffect(() => {
    const shots = [...document.querySelectorAll<HTMLButtonElement>('ul.gallery .shot')];
    const onClick = (event: Event) => {
      const shot = event.currentTarget as HTMLButtonElement;
      const at = shots.indexOf(shot);
      if (at < 0) return;
      setIndex(at);
      setOpen(true);
    };
    shots.forEach((shot) => shot.addEventListener('click', onClick));
    return () => shots.forEach((shot) => shot.removeEventListener('click', onClick));
  }, []);

  useEffect(() => {
    if (!open || images.length < 2) return;
    const onKey = (event: KeyboardEvent) => {
      // RTL: ArrowLeft advances, ArrowRight goes back. The same keys as the app.
      if (event.key === 'ArrowLeft') swipe.current?.go(1);
      if (event.key === 'ArrowRight') swipe.current?.go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, images.length]);

  return (
    <GalleryLightbox
      images={images}
      alt={alt}
      index={index}
      onIndexChange={setIndex}
      open={open}
      onOpenChange={setOpen}
      swipeRef={swipe}
      container={container}
    />
  );
}

const shots = [...document.querySelectorAll<HTMLImageElement>('ul.gallery .shot img')];
if (shots.length > 0) {
  openListingGallery(
    shots.map((img) => img.currentSrc || img.src),
    document.querySelector('h1')?.textContent?.trim() || 'תמונות הנכס',
  );
}
