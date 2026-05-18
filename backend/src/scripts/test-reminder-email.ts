/**
 * One-off script: send a test booking reminder email to admin
 * to verify the date formatting fix.
 *
 * Usage: npx ts-node -r tsconfig-paths/register src/scripts/test-reminder-email.ts
 */
import { sendBookingReminder } from '../services/email.service';
import { appConfig } from '../config/env';

const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
const todayStr = `${yyyy}-${mm}-${dd}`;

// Format the same way the reminder service does (the fixed version)
const parts = todayStr.split('-');
const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
const formattedDate = d.toLocaleDateString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const adminEmail = appConfig.adminEmails || 'info@playfunia.com';

console.log(`Sending test reminder email to: ${adminEmail}`);
console.log(`Raw date string: ${todayStr}`);
console.log(`Formatted date:  ${formattedDate}`);

sendBookingReminder({
  email: adminEmail,
  guestName: 'Test Customer',
  reference: 'PF-TEST-DATE-FIX',
  packageName: 'Ultimate Party Package',
  eventDate: formattedDate,
  startTime: '2:00 PM',
  location: 'Playfunia',
  guestCount: 15,
  balanceRemaining: 0,
  daysUntil: 0,
  reminderType: 'day_of',
})
  .then((sent) => {
    console.log(sent ? 'Email sent successfully!' : 'Email sending failed (SMTP not configured?)');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
