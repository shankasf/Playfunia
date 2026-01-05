import type { Card, Payments } from '@square/web-payments-sdk-types';

// Square Web Payments SDK configuration
export interface SquareConfig {
  applicationId: string | null;
  locationId: string | null;
  environment: 'sandbox' | 'production';
  available: boolean;
}

let squarePayments: Payments | null = null;
let squareConfig: SquareConfig | null = null;

/**
 * Load Square Web Payments SDK script dynamically
 */
function loadSquareScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Square) {
      resolve();
      return;
    }

    const existingScript = document.getElementById('square-web-payments-sdk');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Square SDK')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'square-web-payments-sdk';
    script.src = 'https://sandbox.web.squarecdn.com/v1/square.js'; // Use sandbox for now
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Square SDK'));
    document.head.appendChild(script);
  });
}

/**
 * Fetch Square configuration from backend
 */
export async function fetchSquareConfig(): Promise<SquareConfig> {
  if (squareConfig) {
    return squareConfig;
  }

  const apiUrl = process.env.REACT_APP_API_URL || 'http://72.62.162.219:5001/api';
  const response = await fetch(`${apiUrl}/square/config`);

  if (!response.ok) {
    throw new Error('Failed to fetch Square configuration');
  }

  squareConfig = await response.json();
  return squareConfig!;
}

/**
 * Initialize Square Payments SDK
 */
export async function initializeSquare(): Promise<Payments | null> {
  if (squarePayments) {
    return squarePayments;
  }

  try {
    const config = await fetchSquareConfig();

    if (!config.available || !config.applicationId || !config.locationId) {
      console.warn('Square payments not available');
      return null;
    }

    await loadSquareScript();

    if (!window.Square) {
      throw new Error('Square SDK not loaded');
    }

    squarePayments = await window.Square.payments(config.applicationId, config.locationId);
    return squarePayments;
  } catch (error) {
    console.error('Failed to initialize Square:', error);
    return null;
  }
}

/**
 * Create a card payment method
 */
export async function createCardPayment(payments: Payments): Promise<Card> {
  const card = await payments.card();
  return card;
}

/**
 * Check if Square is available
 */
export async function isSquareAvailable(): Promise<boolean> {
  try {
    const config = await fetchSquareConfig();
    return config.available;
  } catch {
    return false;
  }
}

// Note: Square types are provided by @square/web-payments-sdk-types
// The Window.Square interface is already declared in the types package
