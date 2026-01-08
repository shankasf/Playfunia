/**
 * Script to add admin users to the database
 * Run with: npx tsx scripts/add-admin-users.ts
 */

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addAdminUsers() {
  const adminUsers = [
    {
      email: 'emelgumustop@hotmail.com',
      firstName: 'Emel',
      lastName: 'Gumustop',
      fullName: 'Emel Gumustop',
    },
    {
      email: 'playfunia@playfunia.com',
      firstName: 'Playfunia',
      lastName: 'Admin',
      fullName: 'Playfunia Admin',
    },
    {
      email: 'sagarshankaranusa@gmail.com',
      firstName: 'Sagar',
      lastName: 'Shankaran',
      fullName: 'Sagar Shankaran',
    },
  ];

  for (const admin of adminUsers) {
    console.log(`\nProcessing: ${admin.email}`);

    // Check if customer exists
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('customer_id')
      .eq('email', admin.email)
      .single();

    let customerId = existingCustomer?.customer_id;

    if (!customerId) {
      // Create customer
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          full_name: admin.fullName,
          email: admin.email,
        })
        .select('customer_id')
        .single();

      if (customerError) {
        console.error(`Error creating customer for ${admin.email}:`, customerError);
        continue;
      }
      customerId = newCustomer.customer_id;
      console.log(`  Created customer with ID: ${customerId}`);
    } else {
      console.log(`  Customer already exists with ID: ${customerId}`);
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('user_id, roles')
      .eq('email', admin.email)
      .single();

    if (existingUser) {
      // Update to admin role if not already
      if (!existingUser.roles?.includes('admin')) {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            roles: ['user', 'admin'],
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', existingUser.user_id);

        if (updateError) {
          console.error(`Error updating user ${admin.email}:`, updateError);
        } else {
          console.log(`  Updated user ${admin.email} to admin role`);
        }
      } else {
        console.log(`  User ${admin.email} already has admin role`);
      }
    } else {
      // Create user with admin role
      const { error: userError } = await supabase.from('users').insert({
        email: admin.email,
        first_name: admin.firstName,
        last_name: admin.lastName,
        customer_id: customerId,
        roles: ['user', 'admin'],
      });

      if (userError) {
        console.error(`Error creating user ${admin.email}:`, userError);
      } else {
        console.log(`  Created admin user: ${admin.email}`);
      }
    }
  }

  // Verify
  console.log('\n--- Verification ---');
  const { data: admins } = await supabase
    .from('users')
    .select('user_id, email, first_name, last_name, roles')
    .contains('roles', ['admin']);

  console.log('Admin users in database:');
  admins?.forEach((u) => {
    console.log(`  - ${u.email} (${u.first_name} ${u.last_name}) - roles: ${u.roles?.join(', ')}`);
  });

  console.log('\nDone! These users can now use "Forgot Password" to set their passwords.');
}

addAdminUsers().catch(console.error);
