import { PartyPackageRepository } from '../repositories';

export async function listPartyPackages() {
  const packages = await PartyPackageRepository.findAll(true);
  return packages.map(pkg => ({
    id: String(pkg.package_id),
    name: pkg.name,
    basePrice: pkg.price_usd,
    maxGuests: pkg.base_children,
    duration: pkg.base_room_hours,
    includesFood: pkg.includes_food,
    includesDrinks: pkg.includes_drinks,
    description: pkg.description,
    isActive: pkg.is_active,
  }));
}

