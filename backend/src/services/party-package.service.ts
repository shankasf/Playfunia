import { PartyPackageRepository } from '../repositories';
import { getWeekdayPartyDiscountPercent } from './party-discount.service';
import { roundCurrency } from './pricing-config.service';

export async function listPartyPackages() {
  const [packages, weekdayDiscountPercent] = await Promise.all([
    PartyPackageRepository.findAll(true),
    getWeekdayPartyDiscountPercent(),
  ]);
  return packages.map(pkg => {
    const pkgAny = pkg as any;
    return {
      id: String(pkg.package_id),
      name: pkg.name,
      basePrice: pkg.price_usd,
      // Mon-Fri price; the booking flow applies it once a date is picked
      weekdayDiscountPercent,
      weekdayPrice: roundCurrency(pkg.price_usd * (1 - weekdayDiscountPercent / 100)),
      maxGuests: pkg.base_children,
      durationMinutes: (pkg.base_room_hours ?? 2) * 60,
      includesFood: pkg.includes_food,
      includesDrinks: pkg.includes_drinks,
      includesDecor: pkg.includes_decor,
      description: pkg.description,
      isActive: pkg.is_active,
      features: pkgAny.features ?? [],
      additionalTerms: pkgAny.additional_terms ?? [],
      extraAdultPrice: pkgAny.extra_adult_price ?? 10,
    };
  });
}

