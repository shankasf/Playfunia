import { PartyPackageRepository } from '../repositories';

export async function listPartyPackages() {
  const packages = await PartyPackageRepository.findAll(true);
  return packages.map(pkg => {
    const pkgAny = pkg as any;
    return {
      id: String(pkg.package_id),
      name: pkg.name,
      basePrice: pkg.price_usd,
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

