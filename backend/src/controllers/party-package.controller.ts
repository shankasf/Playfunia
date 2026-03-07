import type { Request, Response } from 'express';

import { listPartyPackages } from '../services/party-package.service';
import { asyncHandler } from '../utils/async-handler';

export const listPartyPackagesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const packages = await listPartyPackages();

  const formatted = packages.map(pkg => ({
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    durationMinutes: pkg.durationMinutes,
    basePrice: pkg.basePrice,
    maxGuests: pkg.maxGuests,
    includesFood: pkg.includesFood,
    includesDrinks: pkg.includesDrinks,
    includesDecor: pkg.includesDecor,
    features: pkg.features,
    additionalTerms: pkg.additionalTerms,
    extraAdultPrice: pkg.extraAdultPrice,
  }));

  return res.status(200).json({ packages: formatted });
});
