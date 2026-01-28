import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env from project root (one level up from backend/)
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

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
    // OpenAI API for chatbot
    OPENAI_API_KEY: z.string().optional(),
    // Chatbot service URL
    CHATBOT_SERVICE_URL: z.string().default('http://localhost:8000'),
    // SMTP Email Configuration (AWS SES)
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587).optional(),
    SMTP_SECURE: z.preprocess(val => val === 'true' || val === true, z.boolean()).default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SMTP_FROM_NAME: z.string().default('Playfunia'),
    // Twilio SMS Configuration
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),
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
  openaiApiKey: env.OPENAI_API_KEY,
  chatbotServiceUrl: env.CHATBOT_SERVICE_URL,
  // SMTP Email Configuration (AWS SES)
  smtpHost: env.SMTP_HOST,
  smtpPort: env.SMTP_PORT,
  smtpSecure: env.SMTP_SECURE,
  smtpUser: env.SMTP_USER,
  smtpPass: env.SMTP_PASS,
  smtpFrom: env.SMTP_FROM,
  smtpFromName: env.SMTP_FROM_NAME,
  // Twilio SMS Configuration
  twilioAccountSid: env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: env.TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: env.TWILIO_PHONE_NUMBER,
};
