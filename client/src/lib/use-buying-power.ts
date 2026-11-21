import { useEffect, useState } from 'react';
import { loadBuyingPower, subscribeBuyingPower, type BuyingPower } from '@/lib/buying-power';

/** The household, refreshed when the calculator writes it or the buyer clears it. */
export function useBuyingPower(): BuyingPower | null {
  const [power, setPower] = useState<BuyingPower | null>(() => loadBuyingPower());

  useEffect(() => subscribeBuyingPower(() => setPower(loadBuyingPower())), []);

  return power;
}
