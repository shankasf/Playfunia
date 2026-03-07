import { apiGet } from './client';
import type { EventPhoto } from '../data/types';

export async function fetchEventPhotos(eventId: string | number) {
  const response = await apiGet<{ photos: EventPhoto[] }>(`/events/${eventId}/photos`);
  return response.photos;
}
