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
// Config cache TTL - 5 minutes (Fix #9)
let squareConfigTimestamp: number = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
// Mutex for concurrent init calls
let initPromise: Promise<Payments | null> | null = null;

/**
 * Load Square Web Payments SDK script dynamically (Fix #8 - race condition)
 */
function loadSquareScript(environment: 'sandbox' | 'production'): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if SDK is already loaded first (Fix #8)
    if (window.Square) {
      resolve();
      return;
    }

    const existingScript = document.getElementById('square-web-payments-sdk');
    if (existingScript) {
      // Script tag exists but Square might not be ready yet
      // Poll for window.Square instead of relying on events (Fix #8)
      // This handles the case where the script is already loaded
      let attempts = 0;
      const MAX_ATTEMPTS = 200; // 10 seconds at 50ms intervals
      const checkLoaded = () => {
        if (window.Square) {
          resolve();
        } else if (++attempts > MAX_ATTEMPTS) {
          reject(new Error('Square SDK loading timed out'));
        } else {
          setTimeout(checkLoaded, 50);
        }
      };
      // Also listen for events in case script is still loading
      existingScript.addEventListener('load', checkLoaded);
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Square SDK')));
      // Start polling immediately in case events already fired
      checkLoaded();
      return;
    }

    const script = document.createElement('script');
    script.id = 'square-web-payments-sdk';
    // Use production or sandbox SDK based on environment
    script.src = environment === 'production'
      ? 'https://web.squarecdn.com/v1/square.js'
      : 'https://sandbox.web.squarecdn.com/v1/square.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Square SDK'));
    document.head.appendChild(script);
  });
}

/**
 * Fetch Square configuration from backend (Fix #9 - add cache invalidation)
 */
export async function fetchSquareConfig(): Promise<SquareConfig> {
  const now = Date.now();

  // Return cached config if it's still fresh (Fix #9)
  if (squareConfig && (now - squareConfigTimestamp) < CONFIG_CACHE_TTL_MS) {
    return squareConfig;
  }

  const apiUrl = process.env.REACT_APP_API_URL || '/api';
  const response = await fetch(`${apiUrl}/square/config`);

  if (!response.ok) {
    throw new Error('Failed to fetch Square configuration');
  }

  squareConfig = await response.json();
  squareConfigTimestamp = now;
  return squareConfig!;
}

/**
 * Invalidate the cached Square configuration.
 * Call this if you need to force a fresh config fetch.
 */
export function invalidateSquareConfig(): void {
  squareConfig = null;
  squareConfigTimestamp = 0;
  // Also clear the payments instance since it may use old config
  squarePayments = null;
}

/**
 * Initialize Square Payments SDK
 */
export async function initializeSquare(): Promise<Payments | null> {
  if (squarePayments) {
    return squarePayments;
  }

  // Prevent concurrent initialization (race condition)
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const config = await fetchSquareConfig();

      if (!config.available || !config.applicationId || !config.locationId) {
        console.warn('Square payments not available');
        return null;
      }

      await loadSquareScript(config.environment);

      if (!window.Square) {
        throw new Error('Square SDK not loaded');
      }

      squarePayments = await window.Square.payments(config.applicationId, config.locationId);
      return squarePayments;
    } catch (error) {
      console.error('Failed to initialize Square:', error);
      return null;
    }
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
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
