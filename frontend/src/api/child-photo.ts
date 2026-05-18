import { API_BASE_URL, getAuthToken } from './client';

export async function uploadChildPhoto(childId: number, file: File): Promise<{ photoUrl: string }> {
  const formData = new FormData();
  formData.append('photo', file);

  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/memberships/child-photo/${childId}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = 'Failed to upload photo';
    try {
      const json = JSON.parse(text);
      if (json.message) message = json.message;
    } catch {
      // use default
    }
    throw new Error(message);
  }

  return response.json();
}
