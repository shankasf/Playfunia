import { apiGet } from './client';

export interface StoreHoursItem {
  day: string;
  dayOfWeek: number;
  hours: string;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

interface StoreHoursResponse {
  hours: StoreHoursItem[];
}

export async function getStoreHours(location: string = 'Albany'): Promise<StoreHoursItem[]> {
  const response = await apiGet<StoreHoursResponse>(`/content/store-hours?location=${encodeURIComponent(location)}`);
  return response.hours;
}
