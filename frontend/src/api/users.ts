import { apiPost, apiDelete } from './client';

export interface Child {
  id: number;
  firstName: string;
  lastName: string | null;
  birthDate: string | null;
  gender: string | null;
}

export interface AddChildInput {
  firstName: string;
  lastName?: string;
  birthDate?: string;
  gender?: string;
}

export async function addChild(input: AddChildInput): Promise<{ child: Child }> {
  return apiPost('/users/me/children', input);
}

export async function deleteChild(childId: number): Promise<{ success: boolean }> {
  return apiDelete(`/users/me/children/${childId}`);
}
