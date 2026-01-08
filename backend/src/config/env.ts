import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(5000),
    // MongoDB removed - now using Supabase
    // MONGO_URL: z.string().default('mongodb://localhost:27017/playfunia'),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_JWT_SECRET: z.string().optional(),
    JWT_SECRET: z.string().optional(),
    // Square Payment Integration (primary payment method)
    SQUARE_ACCESS_TOKEN: z.string().optional(),
    SQUARE_LOCATION_ID: z.string().optional(),
    SQUARE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
    SQUARE_APPLICATION_ID: z.string().optional(),
    // Stripe removed - using Square for all payments
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    MOCK_PAYMENTS: z.coerce.boolean().default(false),
    FRONTEND_URL: z.string().default('http://localhost:3000'),
    CORS_ORIGIN: z.string().optional(),
    DEFAULT_ADMIN_EMAIL: z.string().optional(),
    DEFAULT_ADMIN_PASSWORD: z.string().optional(),
    INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
    INSTAGRAM_USER_ID: z.string().optional(),
    // SMTP Email Configuration (legacy)
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_SECURE: z.coerce.boolean().default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SMTP_FROM_NAME: z.string().default('Playfunia'),
    // Resend Email Configuration
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('noreply@playfunia.com'),
    EMAIL_FROM_NAME: z.string().default('Playfunia'),
  })
  .strip();

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment configuration:', parsedEnv.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

const env = parsedEnv.data;

if (!env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set; authentication routes will be disabled until configured.');
}

export const appConfig = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  supabaseUrl: env.SUPABASE_URL,
  supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseAnonKey: env.SUPABASE_ANON_KEY,
  supabaseJwtSecret: env.SUPABASE_JWT_SECRET,
  jwtSecret: env.JWT_SECRET,
  // Square Payment Integration
  squareAccessToken: env.SQUARE_ACCESS_TOKEN,
  squareLocationId: env.SQUARE_LOCATION_ID,
  squareEnvironment: env.SQUARE_ENVIRONMENT,
  squareApplicationId: env.SQUARE_APPLICATION_ID,
  // Stripe (deprecated - using Square)
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  mockPayments: env.MOCK_PAYMENTS,
  frontendUrl: env.FRONTEND_URL,
  corsOrigin: env.CORS_ORIGIN ?? env.FRONTEND_URL,
  defaultAdminEmail: env.DEFAULT_ADMIN_EMAIL,
  defaultAdminPassword: env.DEFAULT_ADMIN_PASSWORD,
  instagramAccessToken: env.INSTAGRAM_ACCESS_TOKEN,
  instagramUserId: env.INSTAGRAM_USER_ID,
  // SMTP Email Configuration (legacy)
  smtpHost: env.SMTP_HOST,
  smtpPort: env.SMTP_PORT,
  smtpSecure: env.SMTP_SECURE,
  smtpUser: env.SMTP_USER,
  smtpPass: env.SMTP_PASS,
  smtpFrom: env.SMTP_FROM,
  smtpFromName: env.SMTP_FROM_NAME,
  // Resend Email Configuration
  resendApiKey: env.RESEND_API_KEY,
  emailFrom: env.EMAIL_FROM,
  emailFromName: env.EMAIL_FROM_NAME,
};
