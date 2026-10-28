import { EnquiryForm } from '@/components/EnquiryForm';
import { RevealPhone } from '@/components/RevealPhone';
import { useEffect, useRef } from 'react';
import { AmenityGrid } from '@/components/AmenityGrid';
import { AssetGallery } from '@/components/AssetGallery';
import { DetailGrid, type Detail } from '@/components/DetailGrid';
import { formatAddress, formatDate, formatPrice, formatShekel } from '@/lib/format';
import type { Asset } from '@/types/yad2';

const Spec = ({ label, value }: { label: string; value: string | number | null }) =>
  value === null || value === '' ? null : (
    <div className="rounded-lg bg-slate-50 p-3 text-center">
      <div className="font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );

export function AssetModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);

    // Stop the page behind the dialog from scrolling while it is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const floor =
    asset.floor === null ? null : asset.buildingTopFloor ? `${asset.floor} מתוך ${asset.buildingTopFloor}` : asset.floor;

  // yad2 prints "כניסה גמישה" instead of the date whenever the seller marked it flexible.
  const entrance = asset.isEntranceDateFlexible
    ? 'כניסה גמישה'
    : asset.entranceDate
      ? formatDate(asset.entranceDate)
      : null;

  const squareMeters = (value: number | null) => (value === null ? null : `${value} מ״ר`);

  // Same rows, same order, as yad2's own "פרטים נוספים" block.
  const details: Detail[] = [
    { label: 'סוג העסקה', value: asset.dealType },
    { label: 'מצב הנכס', value: asset.propertyCondition },
    { label: 'מ״ר בנוי', value: squareMeters(asset.squareMeterBuilt) },
    { label: 'קומות בבניין', value: asset.buildingTopFloor },
    { label: 'חניות', value: asset.parkingSpacesCount },
    { label: 'מחיר למ״ר', value: formatShekel(asset.pricePerSquareMeter) },
    { label: 'תאריך כניסה', value: entrance },
    // Beyond yad2's block, but we have them and they matter.
    { label: 'סוג נכס', value: [asset.propertyGroup, asset.propertyType].filter(Boolean).join(' · ') },
    { label: 'מ״ר גינה', value: squareMeters(asset.squareMeterGarden) },
    { label: 'מרפסות', value: asset.balconiesCount },
    { label: 'על עמודים', value: asset.isOnPillars ? 'כן' : null },
    { label: 'מרחק ממקלט', value: asset.shelterDistanceM === null ? null : `${asset.shelterDistanceM} מ׳` },
    { label: 'מספר מודעה', value: asset.adNumber },
    { label: 'עודכן', value: formatDate(asset.updatedAt) },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${asset.propertyType}, ${asset.city}`}
        className="relative my-8 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="סגירה"
          className="absolute left-3 top-3 z-10 rounded-full bg-white/90 px-3 py-1.5 text-lg leading-none shadow hover:bg-white"
        >
          ✕
        </button>

        <AssetGallery images={asset.imageUrls} alt={`${asset.propertyType}, ${asset.city}`} />

        <div className="flex flex-col gap-5 p-6">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl font-bold text-slate-900">{formatPrice(asset.price)}</h2>
              {asset.priceBeforeDrop && (
                <span className="text-slate-400 line-through">{formatPrice(asset.priceBeforeDrop)}</span>
              )}
            </div>
            <p className="mt-1 text-lg text-slate-800">
              {[asset.propertyType, asset.rooms && `${asset.rooms} חדרים`].filter(Boolean).join(', ')}
            </p>
            <p className="text-slate-500">{formatAddress(asset)}</p>
            <p className="text-sm text-slate-400">
              {[asset.area, asset.region].filter(Boolean).join(' · ')}
            </p>
          </div>

          {asset.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {asset.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Spec label="חדרים" value={asset.rooms} />
            <Spec label="קומה" value={floor} />
            <Spec label='מ"ר' value={asset.squareMeter} />
            <Spec label="חניות" value={asset.parkingSpacesCount} />
          </div>

          {asset.description && (
            <section>
              <h3 className="mb-1 font-semibold text-slate-900">תיאור</h3>
              <p className="whitespace-pre-line leading-relaxed text-slate-700">{asset.description}</p>
            </section>
          )}

          <DetailGrid title="פרטים נוספים" details={details} />

          <AmenityGrid amenities={asset.amenities} />

          <div className="rounded-lg border border-slate-200 p-4">
            <DetailGrid
              title="איש קשר"
              details={[
                { label: 'שם', value: asset.contactName || asset.brokerName },
                { label: 'מס׳ רישיון', value: asset.brokerLicenseNumber },
                { label: 'סוכנות', value: asset.agencyName },
              ]}
            />
          </div>

          {/* Our own listings have no yad2 url; those get the enquiry form instead, which
              is the point of the whole CRM. Scraped ones still link out. */}
          {/* The number is not in this payload — the button fetches it, so there is
              nothing to harvest from the listing itself. */}
          {asset.agency?.hasPhone && <RevealPhone listingId={asset.id} />}

          {asset.listingUrl ? (
            <a
              href={asset.listingUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-slate-900 px-6 py-3 text-center font-medium text-white"
            >
              הצגת המודעה ביד2 ↗
            </a>
          ) : (
            <EnquiryForm listingId={asset.id} />
          )}
        </div>
      </div>
    </div>
  );
}
