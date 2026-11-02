import { amenityIcon } from '@/components/listing/amenities';
import { formatAddress, formatPrice } from '@/lib/format';
import type { Asset } from '@/types/yad2';

const Spec = ({ label, value }: { label: string; value: string | number | null }) =>
  value === null || value === '' ? null : (
    <div className="text-center">
      <div className="font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );

export function AssetCard({ asset, onOpen }: { asset: Asset; onOpen: (asset: Asset) => void }) {
  const floor =
    asset.floor === null ? null : asset.buildingTopFloor ? `${asset.floor}/${asset.buildingTopFloor}` : asset.floor;

  // The card only has room for what the property actually has.
  const present = asset.amenities.filter((a) => a.present);

  return (
    <button
      type="button"
      onClick={() => onOpen(asset)}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-right transition hover:border-slate-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900"
    >
      <div className="relative h-44 bg-slate-100">
        {/* `alt=""`, as on the search card: this whole card is one button, and the
            words under the photo already say the property type and the city. */}
        {asset.coverImageUrl ? (
          <img src={asset.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">ללא תמונה</div>
        )}

        {asset.tags.length > 0 && (
          <div className="absolute bottom-2 right-2 flex flex-wrap gap-1">
            {asset.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded bg-white/90 px-2 py-0.5 text-xs font-medium text-slate-700">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-bold text-slate-900">{formatPrice(asset.price)}</span>
          {asset.priceBeforeDrop && (
            <span className="text-sm text-slate-500 line-through">{formatPrice(asset.priceBeforeDrop)}</span>
          )}
        </div>

        <div>
          <div className="font-medium text-slate-800">
            {[asset.propertyType, asset.city].filter(Boolean).join(', ')}
          </div>
          <div className="text-sm text-slate-500">
            {formatAddress(asset) || asset.region}
          </div>
        </div>

        <div className="mt-auto flex justify-around border-t border-slate-100 pt-3">
          <Spec label="חדרים" value={asset.rooms} />
          <Spec label="קומה" value={floor} />
          <Spec label='מ"ר' value={asset.squareMeter} />
        </div>

        {present.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {present.slice(0, 4).map((a) => {
              const Icon = amenityIcon(a.label);
              return (
                <span
                  key={a.key}
                  className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                >
                  <Icon className="h-3 w-3 text-slate-500" aria-hidden />
                  {a.label}
                </span>
              );
            })}
          </div>
        )}

        {asset.brokerName && <div className="text-xs text-slate-500">{asset.brokerName}</div>}
      </div>
    </button>
  );
}
