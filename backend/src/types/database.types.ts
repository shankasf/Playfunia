/**
 * Generated TypeScript types for Supabase database schema
 * Based on playfunia_schema.sql
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      company: {
        Row: {
          company_id: number;
          name: string;
          mission: string | null;
          values_text: string | null;
          created_at: string | null;
        };
        Insert: {
          company_id?: number;
          name: string;
          mission?: string | null;
          values_text?: string | null;
          created_at?: string | null;
        };
        Update: {
          company_id?: number;
          name?: string;
          mission?: string | null;
          values_text?: string | null;
          created_at?: string | null;
        };
      };
      customers: {
        Row: {
          customer_id: number;
          full_name: string;
          email: string | null;
          phone: string | null;
          guardian_name: string | null;
          child_name: string | null;
          child_birthdate: string | null;
          notes: string | null;
          created_at: string | null;
        };
        Insert: {
          customer_id?: number;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          guardian_name?: string | null;
          child_name?: string | null;
          child_birthdate?: string | null;
          notes?: string | null;
          created_at?: string | null;
        };
        Update: {
          customer_id?: number;
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          guardian_name?: string | null;
          child_name?: string | null;
          child_birthdate?: string | null;
          notes?: string | null;
          created_at?: string | null;
        };
      };
      faqs: {
        Row: {
          faq_id: number;
          question: string;
          answer: string;
          is_active: boolean | null;
        };
        Insert: {
          faq_id?: number;
          question: string;
          answer: string;
          is_active?: boolean | null;
        };
        Update: {
          faq_id?: number;
          question?: string;
          answer?: string;
          is_active?: boolean | null;
        };
      };
      locations: {
        Row: {
          location_id: number;
          company_id: number;
          name: string;
          address_line: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          phone: string | null;
          email: string | null;
          is_active: boolean | null;
        };
        Insert: {
          location_id?: number;
          company_id: number;
          name: string;
          address_line?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
          phone?: string | null;
          email?: string | null;
          is_active?: boolean | null;
        };
        Update: {
          location_id?: number;
          company_id?: number;
          name?: string;
          address_line?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
          phone?: string | null;
          email?: string | null;
          is_active?: boolean | null;
        };
      };
      products: {
        Row: {
          product_id: number;
          sku: string | null;
          product_name: string;
          brand: string | null;
          category: string | null;
          age_group: string | null;
          material: string | null;
          color: string | null;
          price_usd: number;
          stock_qty: number | null;
          rating: number | null;
          description: string | null;
          features: string | null;
          country: string | null;
          is_active: boolean | null;
        };
        Insert: {
          product_id?: number;
          sku?: string | null;
          product_name: string;
          brand?: string | null;
          category?: string | null;
          age_group?: string | null;
          material?: string | null;
          color?: string | null;
          price_usd: number;
          stock_qty?: number | null;
          rating?: number | null;
          description?: string | null;
          features?: string | null;
          country?: string | null;
          is_active?: boolean | null;
        };
        Update: {
          product_id?: number;
          sku?: string | null;
          product_name?: string;
          brand?: string | null;
          category?: string | null;
          age_group?: string | null;
          material?: string | null;
          color?: string | null;
          price_usd?: number;
          stock_qty?: number | null;
          rating?: number | null;
          description?: string | null;
          features?: string | null;
          country?: string | null;
          is_active?: boolean | null;
        };
      };
      ticket_types: {
        Row: {
          ticket_type_id: number;
          name: string;
          description: string | null;
          base_price_usd: number;
          requires_waiver: boolean | null;
          requires_grip_socks: boolean | null;
          location_id: number | null;
          is_active: boolean | null;
        };
        Insert: {
          ticket_type_id?: number;
          name: string;
          description?: string | null;
          base_price_usd: number;
          requires_waiver?: boolean | null;
          requires_grip_socks?: boolean | null;
          location_id?: number | null;
          is_active?: boolean | null;
        };
        Update: {
          ticket_type_id?: number;
          name?: string;
          description?: string | null;
          base_price_usd?: number;
          requires_waiver?: boolean | null;
          requires_grip_socks?: boolean | null;
          location_id?: number | null;
          is_active?: boolean | null;
        };
      };
      resources: {
        Row: {
          resource_id: number;
          location_id: number;
          name: string;
          type: string;
          capacity: number | null;
          is_active: boolean | null;
        };
        Insert: {
          resource_id?: number;
          location_id: number;
          name: string;
          type?: string;
          capacity?: number | null;
          is_active?: boolean | null;
        };
        Update: {
          resource_id?: number;
          location_id?: number;
          name?: string;
          type?: string;
          capacity?: number | null;
          is_active?: boolean | null;
        };
      };
      party_packages: {
        Row: {
          package_id: number;
          location_id: number | null;
          name: string;
          price_usd: number;
          base_children: number;
          base_room_hours: number;
          includes_food: boolean | null;
          includes_drinks: boolean | null;
          includes_decor: boolean | null;
          notes: string | null;
          is_active: boolean | null;
        };
        Insert: {
          package_id?: number;
          location_id?: number | null;
          name: string;
          price_usd: number;
          base_children?: number;
          base_room_hours?: number;
          includes_food?: boolean | null;
          includes_drinks?: boolean | null;
          includes_decor?: boolean | null;
          notes?: string | null;
          is_active?: boolean | null;
        };
        Update: {
          package_id?: number;
          location_id?: number | null;
          name?: string;
          price_usd?: number;
          base_children?: number;
          base_room_hours?: number;
          includes_food?: boolean | null;
          includes_drinks?: boolean | null;
          includes_decor?: boolean | null;
          notes?: string | null;
          is_active?: boolean | null;
        };
      };
      waivers: {
        Row: {
          waiver_id: number;
          customer_id: number;
          signed_at: string;
          ip_address: string | null;
          document_url: string | null;
          version: string | null;
          is_valid: boolean | null;
        };
        Insert: {
          waiver_id?: number;
          customer_id: number;
          signed_at?: string;
          ip_address?: string | null;
          document_url?: string | null;
          version?: string | null;
          is_valid?: boolean | null;
        };
        Update: {
          waiver_id?: number;
          customer_id?: number;
          signed_at?: string;
          ip_address?: string | null;
          document_url?: string | null;
          version?: string | null;
          is_valid?: boolean | null;
        };
      };
      admissions: {
        Row: {
          admission_id: number;
          ticket_type_id: number;
          customer_id: number | null;
          location_id: number;
          visit_date: string;
          price_usd: number;
          waiver_id: number | null;
          checked_in_at: string | null;
          status: string;
        };
        Insert: {
          admission_id?: number;
          ticket_type_id: number;
          customer_id?: number | null;
          location_id: number;
          visit_date: string;
          price_usd: number;
          waiver_id?: number | null;
          checked_in_at?: string | null;
          status?: string;
        };
        Update: {
          admission_id?: number;
          ticket_type_id?: number;
          customer_id?: number | null;
          location_id?: number;
          visit_date?: string;
          price_usd?: number;
          waiver_id?: number | null;
          checked_in_at?: string | null;
          status?: string;
        };
      };
      inventory_movements: {
        Row: {
          movement_id: number;
          product_id: number;
          quantity_change: number;
          reason: string | null;
          ref_order_id: number | null;
          created_at: string | null;
        };
        Insert: {
          movement_id?: number;
          product_id: number;
          quantity_change: number;
          reason?: string | null;
          ref_order_id?: number | null;
          created_at?: string | null;
        };
        Update: {
          movement_id?: number;
          product_id?: number;
          quantity_change?: number;
          reason?: string | null;
          ref_order_id?: number | null;
          created_at?: string | null;
        };
      };
      orders: {
        Row: {
          order_id: number;
          customer_id: number | null;
          location_id: number | null;
          order_type: string;
          status: string;
          subtotal_usd: number;
          discount_usd: number;
          tax_usd: number;
          total_usd: number;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          order_id?: number;
          customer_id?: number | null;
          location_id?: number | null;
          order_type?: string;
          status?: string;
          subtotal_usd?: number;
          discount_usd?: number;
          tax_usd?: number;
          total_usd?: number;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          order_id?: number;
          customer_id?: number | null;
          location_id?: number | null;
          order_type?: string;
          status?: string;
          subtotal_usd?: number;
          discount_usd?: number;
          tax_usd?: number;
          total_usd?: number;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      party_bookings: {
        Row: {
          booking_id: number;
          package_id: number;
          resource_id: number;
          customer_id: number;
          scheduled_start: string;
          scheduled_end: string;
          status: string;
          additional_kids: number | null;
          additional_guests: number | null;
          special_requests: string | null;
          created_at: string | null;
          updated_at: string | null;
          // Extended fields from app migration
          reference: string | null;
          event_date: string | null;
          start_time: string | null;
          end_time: string | null;
          location_name: string | null;
          guests: number | null;
          notes: string | null;
          add_ons: { id?: string; label: string; price: number; quantity: number }[] | null;
          subtotal: number | null;
          cleaning_fee: number | null;
          total: number | null;
          deposit_amount: number | null;
          balance_remaining: number | null;
          payment_status: string | null;
          deposit_paid_at: string | null;
          latest_payment_intent_id: string | null;
          child_ids: number[] | null;
        };
        Insert: {
          booking_id?: number;
          package_id: number;
          resource_id: number;
          customer_id: number;
          scheduled_start: string;
          scheduled_end: string;
          status?: string;
          additional_kids?: number | null;
          additional_guests?: number | null;
          special_requests?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          // Extended fields
          reference?: string | null;
          event_date?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          location_name?: string | null;
          guests?: number | null;
          notes?: string | null;
          add_ons?: { id?: string; label: string; price: number; quantity: number }[] | null;
          subtotal?: number | null;
          cleaning_fee?: number | null;
          total?: number | null;
          deposit_amount?: number | null;
          balance_remaining?: number | null;
          payment_status?: string | null;
          deposit_paid_at?: string | null;
          latest_payment_intent_id?: string | null;
          child_ids?: number[] | null;
        };
        Update: {
          booking_id?: number;
          package_id?: number;
          resource_id?: number;
          customer_id?: number;
          scheduled_start?: string;
          scheduled_end?: string;
          status?: string;
          additional_kids?: number | null;
          additional_guests?: number | null;
          special_requests?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          // Extended fields
          reference?: string | null;
          event_date?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          location_name?: string | null;
          guests?: number | null;
          notes?: string | null;
          add_ons?: { id?: string; label: string; price: number; quantity: number }[] | null;
          subtotal?: number | null;
          cleaning_fee?: number | null;
          total?: number | null;
          deposit_amount?: number | null;
          balance_remaining?: number | null;
          payment_status?: string | null;
          deposit_paid_at?: string | null;
          latest_payment_intent_id?: string | null;
          child_ids?: number[] | null;
        };
      };
      order_items: {
        Row: {
          order_item_id: number;
          order_id: number;
          item_type: string;
          product_id: number | null;
          ticket_type_id: number | null;
          booking_id: number | null;
          name_override: string | null;
          quantity: number;
          unit_price_usd: number;
          line_total_usd: number;
        };
        Insert: {
          order_item_id?: number;
          order_id: number;
          item_type: string;
          product_id?: number | null;
          ticket_type_id?: number | null;
          booking_id?: number | null;
          name_override?: string | null;
          quantity: number;
          unit_price_usd: number;
          line_total_usd: number;
        };
        Update: {
          order_item_id?: number;
          order_id?: number;
          item_type?: string;
          product_id?: number | null;
          ticket_type_id?: number | null;
          booking_id?: number | null;
          name_override?: string | null;
          quantity?: number;
          unit_price_usd?: number;
          line_total_usd?: number;
        };
      };
      promotions: {
        Row: {
          promotion_id: number;
          code: string;
          description: string | null;
          percent_off: number | null;
          amount_off_usd: number | null;
          valid_from: string | null;
          valid_to: string | null;
          max_redemptions: number | null;
          redemptions: number | null;
          is_active: boolean | null;
        };
        Insert: {
          promotion_id?: number;
          code: string;
          description?: string | null;
          percent_off?: number | null;
          amount_off_usd?: number | null;
          valid_from?: string | null;
          valid_to?: string | null;
          max_redemptions?: number | null;
          redemptions?: number | null;
          is_active?: boolean | null;
        };
        Update: {
          promotion_id?: number;
          code?: string;
          description?: string | null;
          percent_off?: number | null;
          amount_off_usd?: number | null;
          valid_from?: string | null;
          valid_to?: string | null;
          max_redemptions?: number | null;
          redemptions?: number | null;
          is_active?: boolean | null;
        };
      };
      order_promotions: {
        Row: {
          order_id: number;
          promotion_id: number;
        };
        Insert: {
          order_id: number;
          promotion_id: number;
        };
        Update: {
          order_id?: number;
          promotion_id?: number;
        };
      };
      package_inclusions: {
        Row: {
          inclusion_id: number;
          package_id: number;
          item_name: string;
          quantity: number | null;
        };
        Insert: {
          inclusion_id?: number;
          package_id: number;
          item_name: string;
          quantity?: number | null;
        };
        Update: {
          inclusion_id?: number;
          package_id?: number;
          item_name?: string;
          quantity?: number | null;
        };
      };
      party_addons: {
        Row: {
          party_addon_id: number;
          booking_id: number;
          product_id: number | null;
          name: string | null;
          quantity: number | null;
          unit_price_usd: number;
        };
        Insert: {
          party_addon_id?: number;
          booking_id: number;
          product_id?: number | null;
          name?: string | null;
          quantity?: number | null;
          unit_price_usd?: number;
        };
        Update: {
          party_addon_id?: number;
          booking_id?: number;
          product_id?: number | null;
          name?: string | null;
          quantity?: number | null;
          unit_price_usd?: number;
        };
      };
      party_guests: {
        Row: {
          party_guest_id: number;
          booking_id: number;
          guest_name: string | null;
          is_child: boolean | null;
        };
        Insert: {
          party_guest_id?: number;
          booking_id: number;
          guest_name?: string | null;
          is_child?: boolean | null;
        };
        Update: {
          party_guest_id?: number;
          booking_id?: number;
          guest_name?: string | null;
          is_child?: boolean | null;
        };
      };
      party_reschedules: {
        Row: {
          reschedule_id: number;
          booking_id: number;
          old_start: string;
          old_end: string;
          new_start: string;
          new_end: string;
          reason: string | null;
          created_at: string | null;
        };
        Insert: {
          reschedule_id?: number;
          booking_id: number;
          old_start: string;
          old_end: string;
          new_start: string;
          new_end: string;
          reason?: string | null;
          created_at?: string | null;
        };
        Update: {
          reschedule_id?: number;
          booking_id?: number;
          old_start?: string;
          old_end?: string;
          new_start?: string;
          new_end?: string;
          reason?: string | null;
          created_at?: string | null;
        };
      };
      payments: {
        Row: {
          payment_id: number;
          order_id: number;
          provider: string;
          provider_payment_id: string | null;
          status: string;
          amount_usd: number;
          created_at: string | null;
        };
        Insert: {
          payment_id?: number;
          order_id: number;
          provider: string;
          provider_payment_id?: string | null;
          status?: string;
          amount_usd: number;
          created_at?: string | null;
        };
        Update: {
          payment_id?: number;
          order_id?: number;
          provider?: string;
          provider_payment_id?: string | null;
          status?: string;
          amount_usd?: number;
          created_at?: string | null;
        };
      };
      policies: {
        Row: {
          policy_id: number;
          key: string;
          value: string | null;
          is_active: boolean | null;
        };
        Insert: {
          policy_id?: number;
          key: string;
          value?: string | null;
          is_active?: boolean | null;
        };
        Update: {
          policy_id?: number;
          key?: string;
          value?: string | null;
          is_active?: boolean | null;
        };
      };
      refunds: {
        Row: {
          refund_id: number;
          payment_id: number | null;
          order_id: number;
          status: string;
          reason: string | null;
          amount_usd: number;
          created_at: string | null;
        };
        Insert: {
          refund_id?: number;
          payment_id?: number | null;
          order_id: number;
          status?: string;
          reason?: string | null;
          amount_usd: number;
          created_at?: string | null;
        };
        Update: {
          refund_id?: number;
          payment_id?: number | null;
          order_id?: number;
          status?: string;
          reason?: string | null;
          amount_usd?: number;
          created_at?: string | null;
        };
      };
      staff: {
        Row: {
          staff_id: number;
          location_id: number | null;
          full_name: string;
          role: string | null;
          phone: string | null;
          email: string | null;
          is_active: boolean | null;
        };
        Insert: {
          staff_id?: number;
          location_id?: number | null;
          full_name: string;
          role?: string | null;
          phone?: string | null;
          email?: string | null;
          is_active?: boolean | null;
        };
        Update: {
          staff_id?: number;
          location_id?: number | null;
          full_name?: string;
          role?: string | null;
          phone?: string | null;
          email?: string | null;
          is_active?: boolean | null;
        };
      };
      testimonials: {
        Row: {
          testimonial_id: number;
          name: string;
          quote: string;
          rating: number | null;
          is_featured: boolean | null;
          created_at: string | null;
          relationship: string | null;
          updated_at: string | null;
        };
        Insert: {
          testimonial_id?: number;
          name: string;
          quote: string;
          rating?: number | null;
          is_featured?: boolean | null;
          created_at?: string | null;
          relationship?: string | null;
          updated_at?: string | null;
        };
        Update: {
          testimonial_id?: number;
          name?: string;
          quote?: string;
          rating?: number | null;
          is_featured?: boolean | null;
          created_at?: string | null;
          relationship?: string | null;
          updated_at?: string | null;
        };
      };
      // Additional tables for app users (not in original schema, but needed for auth)
      users: {
        Row: {
          user_id: number;
          email: string;
          password_hash: string;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          roles: string[];
          customer_id: number | null;
          // Address fields
          address_line1: string | null;
          address_line2: string | null;
          address_city: string | null;
          address_state: string | null;
          address_postal_code: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          user_id?: number;
          email: string;
          password_hash: string;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          roles?: string[];
          customer_id?: number | null;
          address_line1?: string | null;
          address_line2?: string | null;
          address_city?: string | null;
          address_state?: string | null;
          address_postal_code?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: number;
          email?: string;
          password_hash?: string;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          roles?: string[];
          customer_id?: number | null;
          address_line1?: string | null;
          address_line2?: string | null;
          address_city?: string | null;
          address_state?: string | null;
          address_postal_code?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      children: {
        Row: {
          child_id: number;
          customer_id: number;
          first_name: string;
          last_name: string | null;
          birth_date: string | null;
          gender: string | null;
          allergies: string | null;
          notes: string | null;
          membership_tier: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          child_id?: number;
          customer_id: number;
          first_name: string;
          last_name?: string | null;
          birth_date?: string | null;
          gender?: string | null;
          allergies?: string | null;
          notes?: string | null;
          membership_tier?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          child_id?: number;
          customer_id?: number;
          first_name?: string;
          last_name?: string | null;
          birth_date?: string | null;
          gender?: string | null;
          allergies?: string | null;
          notes?: string | null;
          membership_tier?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      memberships: {
        Row: {
          membership_id: number;
          customer_id: number;
          plan_id: number | null;
          tier: string;
          status: string;
          start_date: string;
          end_date: string | null;
          auto_renew: boolean | null;
          visits_per_month: number | null;
          visits_used_this_period: number | null;
          visit_period_start: string | null;
          last_visit_at: string | null;
          stripe_subscription_id: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          membership_id?: number;
          customer_id: number;
          plan_id?: number | null;
          tier: string;
          status?: string;
          start_date: string;
          end_date?: string | null;
          auto_renew?: boolean | null;
          visits_per_month?: number | null;
          visits_used_this_period?: number | null;
          visit_period_start?: string | null;
          last_visit_at?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          membership_id?: number;
          customer_id?: number;
          plan_id?: number | null;
          tier?: string;
          status?: string;
          start_date?: string;
          end_date?: string | null;
          auto_renew?: boolean | null;
          visits_per_month?: number | null;
          visits_used_this_period?: number | null;
          visit_period_start?: string | null;
          last_visit_at?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      announcements: {
        Row: {
          announcement_id: number;
          title: string;
          body: string;
          publish_date: string | null;
          expires_at: string | null;
          is_active: boolean;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          announcement_id?: number;
          title: string;
          body: string;
          publish_date?: string | null;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          announcement_id?: number;
          title?: string;
          body?: string;
          publish_date?: string | null;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      waiver_users: {
        Row: {
          waiver_user_id: number;
          email: string | null;
          phone: string | null;
          guardian_name: string;
          guardian_date_of_birth: string | null;
          relationship_to_children: string | null;
          allergies: string | null;
          medical_notes: string | null;
          insurance_provider: string | null;
          insurance_policy_number: string | null;
          marketing_opt_in: boolean;
          last_waiver_signed_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          waiver_user_id?: number;
          email?: string | null;
          phone?: string | null;
          guardian_name: string;
          guardian_date_of_birth?: string | null;
          relationship_to_children?: string | null;
          allergies?: string | null;
          medical_notes?: string | null;
          insurance_provider?: string | null;
          insurance_policy_number?: string | null;
          marketing_opt_in?: boolean;
          last_waiver_signed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          waiver_user_id?: number;
          email?: string | null;
          phone?: string | null;
          guardian_name?: string;
          guardian_date_of_birth?: string | null;
          relationship_to_children?: string | null;
          allergies?: string | null;
          medical_notes?: string | null;
          insurance_provider?: string | null;
          insurance_policy_number?: string | null;
          marketing_opt_in?: boolean;
          last_waiver_signed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      waiver_user_children: {
        Row: {
          waiver_user_child_id: number;
          waiver_user_id: number;
          name: string;
          birth_date: string;
          gender: string | null;
          created_at: string | null;
        };
        Insert: {
          waiver_user_child_id?: number;
          waiver_user_id: number;
          name: string;
          birth_date: string;
          gender?: string | null;
          created_at?: string | null;
        };
        Update: {
          waiver_user_child_id?: number;
          waiver_user_id?: number;
          name?: string;
          birth_date?: string;
          gender?: string | null;
          created_at?: string | null;
        };
      };
      // Events table for special events
      events: {
        Row: {
          event_id: number;
          location_id: number | null;
          title: string;
          description: string | null;
          start_date: string;
          end_date: string;
          capacity: number | null;
          tickets_remaining: number | null;
          price: number | null;
          tags: string[] | null;
          image_url: string | null;
          is_published: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          event_id?: number;
          location_id?: number | null;
          title: string;
          description?: string | null;
          start_date: string;
          end_date: string;
          capacity?: number | null;
          tickets_remaining?: number | null;
          price?: number | null;
          tags?: string[] | null;
          image_url?: string | null;
          is_published?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          event_id?: number;
          location_id?: number | null;
          title?: string;
          description?: string | null;
          start_date?: string;
          end_date?: string;
          capacity?: number | null;
          tickets_remaining?: number | null;
          price?: number | null;
          tags?: string[] | null;
          image_url?: string | null;
          is_published?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      // Membership plans table
      membership_plans: {
        Row: {
          plan_id: number;
          name: string;
          description: string | null;
          monthly_price: number;
          benefits: string[] | null;
          max_children: number | null;
          visits_per_month: number | null;
          discount_percent: number | null;
          guest_passes_per_month: number | null;
          is_active: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          plan_id?: number;
          name: string;
          description?: string | null;
          monthly_price: number;
          benefits?: string[] | null;
          max_children?: number | null;
          visits_per_month?: number | null;
          discount_percent?: number | null;
          guest_passes_per_month?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          plan_id?: number;
          name?: string;
          description?: string | null;
          monthly_price?: number;
          benefits?: string[] | null;
          max_children?: number | null;
          visits_per_month?: number | null;
          discount_percent?: number | null;
          guest_passes_per_month?: number | null;
          is_active?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      // Ticket purchases table for app ticket purchasing
      ticket_purchases: {
        Row: {
          purchase_id: number;
          customer_id: number;
          ticket_type_id: number | null;
          event_id: number | null;
          ticket_type: string;
          quantity: number;
          unit_price: number;
          total: number;
          codes: { code: string; status: string; redeemedAt?: string }[];
          status: string;
          metadata: Record<string, unknown> | null;
          stripe_payment_intent_id: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          purchase_id?: number;
          customer_id: number;
          ticket_type_id?: number | null;
          event_id?: number | null;
          ticket_type?: string;
          quantity?: number;
          unit_price: number;
          total: number;
          codes?: { code: string; status: string; redeemedAt?: string }[];
          status?: string;
          metadata?: Record<string, unknown> | null;
          stripe_payment_intent_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          purchase_id?: number;
          customer_id?: number;
          ticket_type_id?: number | null;
          event_id?: number | null;
          ticket_type?: string;
          quantity?: number;
          unit_price?: number;
          total?: number;
          codes?: { code: string; status: string; redeemedAt?: string }[];
          status?: string;
          metadata?: Record<string, unknown> | null;
          stripe_payment_intent_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      // App payments table for app-specific payment tracking
      app_payments: {
        Row: {
          app_payment_id: number;
          customer_id: number;
          amount: number;
          currency: string;
          status: string;
          stripe_payment_intent_id: string;
          purpose: string;
          metadata: Record<string, unknown> | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          app_payment_id?: number;
          customer_id: number;
          amount: number;
          currency?: string;
          status?: string;
          stripe_payment_intent_id: string;
          purpose: string;
          metadata?: Record<string, unknown> | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          app_payment_id?: number;
          customer_id?: number;
          amount?: number;
          currency?: string;
          status?: string;
          stripe_payment_intent_id?: string;
          purpose?: string;
          metadata?: Record<string, unknown> | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      // Waiver submissions table
      waiver_submissions: {
        Row: {
          submission_id: number;
          customer_id: number | null;
          waiver_user_id: number | null;
          guardian_name: string;
          guardian_email: string | null;
          guardian_phone: string | null;
          guardian_date_of_birth: string | null;
          relationship_to_children: string | null;
          allergies: string | null;
          medical_notes: string | null;
          insurance_provider: string | null;
          insurance_policy_number: string | null;
          children: { name: string; birthDate: string; gender?: string }[];
          child_ids: number[] | null;
          signature: string;
          accepted_policies: string[];
          marketing_opt_in: boolean | null;
          signed_at: string;
          expires_at: string | null;
          archive_until: string | null;
          ip_address: string | null;
          created_at: string | null;
        };
        Insert: {
          submission_id?: number;
          customer_id?: number | null;
          waiver_user_id?: number | null;
          guardian_name: string;
          guardian_email?: string | null;
          guardian_phone?: string | null;
          guardian_date_of_birth?: string | null;
          relationship_to_children?: string | null;
          allergies?: string | null;
          medical_notes?: string | null;
          insurance_provider?: string | null;
          insurance_policy_number?: string | null;
          children?: { name: string; birthDate: string; gender?: string }[];
          child_ids?: number[] | null;
          signature: string;
          accepted_policies: string[];
          marketing_opt_in?: boolean | null;
          signed_at?: string;
          expires_at?: string | null;
          archive_until?: string | null;
          ip_address?: string | null;
          created_at?: string | null;
        };
        Update: {
          submission_id?: number;
          customer_id?: number | null;
          waiver_user_id?: number | null;
          guardian_name?: string;
          guardian_email?: string | null;
          guardian_phone?: string | null;
          guardian_date_of_birth?: string | null;
          relationship_to_children?: string | null;
          allergies?: string | null;
          medical_notes?: string | null;
          insurance_provider?: string | null;
          insurance_policy_number?: string | null;
          children?: { name: string; birthDate: string; gender?: string }[];
          child_ids?: number[] | null;
          signature?: string;
          accepted_policies?: string[];
          marketing_opt_in?: boolean | null;
          signed_at?: string;
          expires_at?: string | null;
          archive_until?: string | null;
          ip_address?: string | null;
          created_at?: string | null;
        };
      };
    };
  };
}

// Helper types for easier usage
export type Company = Database['public']['Tables']['company']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type FAQ = Database['public']['Tables']['faqs']['Row'];
export type Location = Database['public']['Tables']['locations']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type TicketType = Database['public']['Tables']['ticket_types']['Row'];
export type Resource = Database['public']['Tables']['resources']['Row'];
export type PartyPackage = Database['public']['Tables']['party_packages']['Row'];
export type Waiver = Database['public']['Tables']['waivers']['Row'];
export type Admission = Database['public']['Tables']['admissions']['Row'];
export type InventoryMovement = Database['public']['Tables']['inventory_movements']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type PartyBooking = Database['public']['Tables']['party_bookings']['Row'];
export type OrderItem = Database['public']['Tables']['order_items']['Row'];
export type Promotion = Database['public']['Tables']['promotions']['Row'];
export type OrderPromotion = Database['public']['Tables']['order_promotions']['Row'];
export type PackageInclusion = Database['public']['Tables']['package_inclusions']['Row'];
export type PartyAddon = Database['public']['Tables']['party_addons']['Row'];
export type PartyGuest = Database['public']['Tables']['party_guests']['Row'];
export type PartyReschedule = Database['public']['Tables']['party_reschedules']['Row'];
export type Payment = Database['public']['Tables']['payments']['Row'];
export type Policy = Database['public']['Tables']['policies']['Row'];
export type Refund = Database['public']['Tables']['refunds']['Row'];
export type Staff = Database['public']['Tables']['staff']['Row'];
export type Testimonial = Database['public']['Tables']['testimonials']['Row'];
export type User = Database['public']['Tables']['users']['Row'];
export type Child = Database['public']['Tables']['children']['Row'];
export type Membership = Database['public']['Tables']['memberships']['Row'];
export type Announcement = Database['public']['Tables']['announcements']['Row'];
export type WaiverUser = Database['public']['Tables']['waiver_users']['Row'];
export type WaiverUserChild = Database['public']['Tables']['waiver_user_children']['Row'];
// New types from app migration
export type Event = Database['public']['Tables']['events']['Row'];
export type MembershipPlan = Database['public']['Tables']['membership_plans']['Row'];
export type TicketPurchase = Database['public']['Tables']['ticket_purchases']['Row'];
export type AppPayment = Database['public']['Tables']['app_payments']['Row'];
export type WaiverSubmission = Database['public']['Tables']['waiver_submissions']['Row'];

// Party Add-Ons type (from migration 004)
export type PartyAddOn = {
  add_on_id: number;
  code: string;
  label: string;
  description: string | null;
  price: number;
  price_type: 'flat' | 'perChild' | 'duration';
  is_active: boolean | null;
  display_order: number | null;
  created_at: string | null;
  updated_at: string | null;
};

// Pricing Config type (from migration 004)
export type PricingConfig = {
  config_id: number;
  config_key: string;
  config_value: number;
  description: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

// Insert types for convenience
export type UserInsert = Database['public']['Tables']['users']['Insert'];
export type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
export type ChildInsert = Database['public']['Tables']['children']['Insert'];
export type MembershipInsert = Database['public']['Tables']['memberships']['Insert'];
export type EventInsert = Database['public']['Tables']['events']['Insert'];
export type PartyBookingInsert = Database['public']['Tables']['party_bookings']['Insert'];
export type TicketPurchaseInsert = Database['public']['Tables']['ticket_purchases']['Insert'];
export type AppPaymentInsert = Database['public']['Tables']['app_payments']['Insert'];
export type WaiverUserInsert = Database['public']['Tables']['waiver_users']['Insert'];
export type WaiverUserChildInsert = Database['public']['Tables']['waiver_user_children']['Insert'];
export type WaiverSubmissionInsert = Database['public']['Tables']['waiver_submissions']['Insert'];
export type AnnouncementInsert = Database['public']['Tables']['announcements']['Insert'];
export type MembershipPlanInsert = Database['public']['Tables']['membership_plans']['Insert'];

// Update types for convenience
export type UserUpdate = Database['public']['Tables']['users']['Update'];
export type CustomerUpdate = Database['public']['Tables']['customers']['Update'];
export type ChildUpdate = Database['public']['Tables']['children']['Update'];
export type MembershipUpdate = Database['public']['Tables']['memberships']['Update'];
export type EventUpdate = Database['public']['Tables']['events']['Update'];
export type PartyBookingUpdate = Database['public']['Tables']['party_bookings']['Update'];
export type TicketPurchaseUpdate = Database['public']['Tables']['ticket_purchases']['Update'];
export type WaiverUserUpdate = Database['public']['Tables']['waiver_users']['Update'];
export type WaiverSubmissionUpdate = Database['public']['Tables']['waiver_submissions']['Update'];
