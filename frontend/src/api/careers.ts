import { apiGet, API_BASE_URL } from './client';

export interface JobListing {
  id: number;
  title: string;
  slug: string;
  department: string;
  employmentType: string;
  location: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  niceToHave: string[];
  perks: string[];
  payRange: string | null;
  minimumAge: number;
  scheduleNotes: string | null;
  publishedAt: string;
  closesAt: string | null;
}

interface JobListingsResponse {
  listings: JobListing[];
}

export async function getJobListings(): Promise<JobListing[]> {
  const response = await apiGet<JobListingsResponse>('/careers/listings');
  return response.listings;
}

interface SubmitApplicationResponse {
  applicationId: number;
  message: string;
}

export async function submitApplication(formData: FormData): Promise<SubmitApplicationResponse> {
  const response = await fetch(`${API_BASE_URL}/careers/apply`, {
    method: 'POST',
    body: formData,
    // No Content-Type header - browser sets it with boundary for multipart
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || 'Application submission failed';
    try {
      const json = JSON.parse(text);
      if (json.message) message = json.message;
    } catch {
      // Not JSON
    }
    throw new Error(message);
  }

  return response.json();
}
