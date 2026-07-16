export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string | null
          expires_at: string
          full_name: string
          id: string
          invited_by: string | null
          organization_id: string
          phone: string | null
          responsibility_types: string[]
          role: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          full_name?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          phone?: string | null
          responsibility_types?: string[]
          role?: string
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          full_name?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          phone?: string | null
          responsibility_types?: string[]
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      access_responsibility_definitions: {
        Row: {
          category: string
          created_at: string
          description: string
          inherits_to_descendants: boolean
          is_active: boolean
          is_governance: boolean
          label: string
          permission_keys: string[]
          responsibility_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          inherits_to_descendants?: boolean
          is_active?: boolean
          is_governance?: boolean
          label: string
          permission_keys?: string[]
          responsibility_type: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          inherits_to_descendants?: boolean
          is_active?: boolean
          is_governance?: boolean
          label?: string
          permission_keys?: string[]
          responsibility_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      // ??? Staging-generated tables ?????????????????????????????????????????
      documents: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          document_type: string
          file_url: string | null
          id: string
          organization_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_url?: string | null
          id?: string
          organization_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_url?: string | null
          id?: string
          organization_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_letters: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          destination_church: string
          destination_city: string
          destination_state: string | null
          id: string
          member_email: string | null
          member_id: string | null
          member_name: string
          observations: string | null
          organization_id: string
          origin_church_name: string
          public_token: string
          reason: string
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          destination_church: string
          destination_city: string
          destination_state?: string | null
          id?: string
          member_email?: string | null
          member_id?: string | null
          member_name: string
          observations?: string | null
          organization_id: string
          origin_church_name?: string
          public_token?: string
          reason: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          destination_church?: string
          destination_city?: string
          destination_state?: string | null
          id?: string
          member_email?: string | null
          member_id?: string | null
          member_name?: string
          observations?: string | null
          organization_id?: string
          origin_church_name?: string
          public_token?: string
          reason?: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_letters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_account_categories: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          organization_id: string
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          organization_id: string
          type: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          organization_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_account_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_accounts: {
        Row: {
          created_at: string
          current_balance: number
          id: string
          is_active: boolean
          name: string
          opening_balance: number
          organization_id: string
          pix_key: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number
          organization_id: string
          pix_key?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number
          organization_id?: string
          pix_key?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_cost_centers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_cost_centers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_monthly_closings: {
        Row: {
          closed_at: string
          closed_by: string | null
          id: string
          month: string
          notes: string | null
          organization_id: string
        }
        Insert: {
          closed_at?: string
          closed_by?: string | null
          id?: string
          month: string
          notes?: string | null
          organization_id: string
        }
        Update: {
          closed_at?: string
          closed_by?: string | null
          id?: string
          month?: string
          notes?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_monthly_closings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_transaction_audit_logs: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          organization_id: string
          transaction_id: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          organization_id: string
          transaction_id?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_transaction_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transaction_audit_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_responsibles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          organization_id: string
          responsibility_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id: string
          responsibility_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id?: string
          responsibility_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_responsibles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          address_complement: string | null
          address_number: string | null
          city: string | null
          country_code: string | null
          created_at: string
          denomination_type: string | null
          email: string | null
          hierarchy_model: string | null
          id: string
          intermediate_level_label: string | null
          intermediate_level_label_plural: string | null
          language_code: string | null
          local_unit_label: string | null
          local_unit_label_plural: string | null
          logo_url: string | null
          municipal_level_label: string | null
          municipal_level_label_plural: string | null
          name: string
          neighborhood: string | null
          organization_type: string
          parent_id: string | null
          phone: string | null
          slug: string | null
          state: string | null
          street: string | null
          top_level_label: string | null
          top_level_label_plural: string | null
          unit_status: string
          updated_at: string
          uses_convention_level: boolean | null
          uses_intermediate_level: boolean | null
          uses_local_units: boolean | null
          uses_municipal_level: boolean | null
          website_url: string | null
          zip_code: string | null
          // ── National operational foundation fields ──────────────────
          has_operational_cashbox: boolean | null
          is_financially_autonomous: boolean | null
          financially_consolidates_to_id: string | null
          cnpj: string | null
          financial_policy_notes: string | null
          short_name: string | null
          acronym: string | null
          pastor_president_name: string | null
        }
        Insert: {
          active?: boolean
          address_complement?: string | null
          address_number?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          denomination_type?: string | null
          email?: string | null
          hierarchy_model?: string | null
          id?: string
          intermediate_level_label?: string | null
          intermediate_level_label_plural?: string | null
          language_code?: string | null
          local_unit_label?: string | null
          local_unit_label_plural?: string | null
          logo_url?: string | null
          municipal_level_label?: string | null
          municipal_level_label_plural?: string | null
          name: string
          neighborhood?: string | null
          organization_type?: string
          parent_id?: string | null
          phone?: string | null
          slug?: string | null
          state?: string | null
          street?: string | null
          top_level_label?: string | null
          top_level_label_plural?: string | null
          unit_status?: string
          updated_at?: string
          uses_convention_level?: boolean | null
          uses_intermediate_level?: boolean | null
          uses_local_units?: boolean | null
          uses_municipal_level?: boolean | null
          website_url?: string | null
          zip_code?: string | null
          has_operational_cashbox?: boolean | null
          is_financially_autonomous?: boolean | null
          financially_consolidates_to_id?: string | null
          cnpj?: string | null
          financial_policy_notes?: string | null
          short_name?: string | null
          acronym?: string | null
          pastor_president_name?: string | null
        }
        Update: {
          active?: boolean
          address_complement?: string | null
          address_number?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          denomination_type?: string | null
          email?: string | null
          hierarchy_model?: string | null
          id?: string
          intermediate_level_label?: string | null
          intermediate_level_label_plural?: string | null
          language_code?: string | null
          local_unit_label?: string | null
          local_unit_label_plural?: string | null
          logo_url?: string | null
          municipal_level_label?: string | null
          municipal_level_label_plural?: string | null
          name?: string
          neighborhood?: string | null
          organization_type?: string
          parent_id?: string | null
          phone?: string | null
          slug?: string | null
          state?: string | null
          street?: string | null
          top_level_label?: string | null
          top_level_label_plural?: string | null
          unit_status?: string
          updated_at?: string
          uses_convention_level?: boolean | null
          uses_intermediate_level?: boolean | null
          uses_local_units?: boolean | null
          uses_municipal_level?: boolean | null
          website_url?: string | null
          zip_code?: string | null
          has_operational_cashbox?: boolean | null
          is_financially_autonomous?: boolean | null
          financially_consolidates_to_id?: string | null
          cnpj?: string | null
          financial_policy_notes?: string | null
          short_name?: string | null
          acronym?: string | null
          pastor_president_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          platform_role: string | null
          role_title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          platform_role?: string | null
          role_title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          platform_role?: string | null
          role_title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          ministry: string | null
          notes: string | null
          organization_id: string
          schedule_date: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          ministry?: string | null
          notes?: string | null
          organization_id: string
          schedule_date?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          ministry?: string | null
          notes?: string | null
          organization_id?: string
          schedule_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_category_id: string | null
          amount: number
          campaign_id: string | null
          category: string
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          date: string
          description: string
          financial_account_id: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_method: string | null
          receipt_url: string | null
          responsible_id: string | null
          source_module: string | null
          status: string
          type: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          account_category_id?: string | null
          amount: number
          campaign_id?: string | null
          category: string
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description: string
          financial_account_id?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_method?: string | null
          receipt_url?: string | null
          responsible_id?: string | null
          source_module?: string | null
          status?: string
          type: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          account_category_id?: string | null
          amount?: number
          campaign_id?: string | null
          category?: string
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          financial_account_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_method?: string | null
          receipt_url?: string | null
          responsible_id?: string | null
          source_module?: string | null
          status?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_category_id_fkey"
            columns: ["account_category_id"]
            isOneToOne: false
            referencedRelation: "finance_account_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "finance_cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      worship_setlists: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          service_date: string | null
          steps: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          service_date?: string | null
          steps?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          service_date?: string | null
          steps?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worship_setlists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      worship_songs: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          lyrics: string
          musical_key: string | null
          notes: string | null
          organization_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lyrics?: string
          musical_key?: string | null
          notes?: string | null
          organization_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lyrics?: string
          musical_key?: string | null
          notes?: string | null
          organization_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worship_songs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      // ??? Tables used by codebase (not yet in staging schema) ???????????????
      assemblies: {
        Row: {
          assembly_date: string
          created_at: string | null
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          is_visible: boolean | null
          organization_id: string
          starts_at: string | null
          title: string
          updated_at: string | null
          youtube_url: string | null
        }
        Insert: {
          assembly_date?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_visible?: boolean | null
          organization_id: string
          starts_at?: string | null
          title: string
          updated_at?: string | null
          youtube_url?: string | null
        }
        Update: {
          assembly_date?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_visible?: boolean | null
          organization_id?: string
          starts_at?: string | null
          title?: string
          updated_at?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assemblies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_attachments: {
        Row: {
          assembly_id: string
          attachment_type: string | null
          created_at: string | null
          file_type: string | null
          file_url: string | null
          id: string
          title: string
          youtube_url: string | null
        }
        Insert: {
          assembly_id: string
          attachment_type?: string | null
          created_at?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          title: string
          youtube_url?: string | null
        }
        Update: {
          assembly_id?: string
          attachment_type?: string | null
          created_at?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          title?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assembly_attachments_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contributions: {
        Row: {
          amount: number
          campaign_id: string
          contributed_at: string
          contributed_by: string | null
          created_at: string
          gateway: string | null
          gateway_fee_amount: number
          id: string
          member_id: string | null
          net_amount: number
          organization_id: string
          payment_method: string | null
          payment_status: string
          platform_fee_amount: number
          transaction_id: string | null
        }
        Insert: {
          amount: number
          campaign_id: string
          contributed_at?: string
          contributed_by?: string | null
          created_at?: string
          gateway?: string | null
          gateway_fee_amount?: number
          id?: string
          member_id?: string | null
          net_amount?: number
          organization_id: string
          payment_method?: string | null
          payment_status?: string
          platform_fee_amount?: number
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          campaign_id?: string
          contributed_at?: string
          contributed_by?: string | null
          created_at?: string
          gateway?: string | null
          gateway_fee_amount?: number
          id?: string
          member_id?: string | null
          net_amount?: number
          organization_id?: string
          payment_method?: string | null
          payment_status?: string
          platform_fee_amount?: number
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contributions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_updates: {
        Row: {
          campaign_id: string
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          media_url: string | null
          organization_id: string
          title: string
          update_type: string
        }
        Insert: {
          campaign_id: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          media_url?: string | null
          organization_id: string
          title: string
          update_type?: string
        }
        Update: {
          campaign_id?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          media_url?: string | null
          organization_id?: string
          title?: string
          update_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_updates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_media: {
        Row: {
          campaign_id: string
          created_at: string
          description: string | null
          id: string
          is_cover: boolean
          media_type: string
          organization_id: string
          public_url: string | null
          sort_order: number
          storage_bucket: string
          storage_path: string
          title: string | null
          uploaded_by: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_cover?: boolean
          media_type?: string
          organization_id: string
          public_url?: string | null
          sort_order?: number
          storage_bucket: string
          storage_path: string
          title?: string | null
          uploaded_by?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_cover?: boolean
          media_type?: string
          organization_id?: string
          public_url?: string | null
          sort_order?: number
          storage_bucket?: string
          storage_path?: string
          title?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_media_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          allow_replies: boolean
          approved_by: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          goal_amount: number
          id: string
          is_featured: boolean
          organization_id: string
          priority: string
          published_at: string | null
          raised_amount: number
          start_date: string | null
          status: string
          title: string
          type: string
          updated_at: string
          visibility: string
        }
        Insert: {
          allow_replies?: boolean
          approved_by?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          goal_amount?: number
          id?: string
          is_featured?: boolean
          organization_id: string
          priority?: string
          published_at?: string | null
          raised_amount?: number
          start_date?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          allow_replies?: boolean
          approved_by?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          goal_amount?: number
          id?: string
          is_featured?: boolean
          organization_id?: string
          priority?: string
          published_at?: string | null
          raised_amount?: number
          start_date?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_message_attachments: {
        Row: {
          created_at: string
          duration_seconds: number | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          id: string
          message_id: string
          organization_id: string
          public_url: string | null
          storage_bucket: string
          storage_path: string
          thread_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          message_id: string
          organization_id: string
          public_url?: string | null
          storage_bucket?: string
          storage_path: string
          thread_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          message_id?: string
          organization_id?: string
          public_url?: string | null
          storage_bucket?: string
          storage_path?: string
          thread_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "internal_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_message_attachments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "internal_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_messages: {
        Row: {
          body: string | null
          created_at: string
          id: string
          message_type: string
          organization_id: string
          read_at: string | null
          reply_to_message_id: string | null
          sender_member_id: string | null
          sender_role: string | null
          sender_user_id: string | null
          thread_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          message_type?: string
          organization_id: string
          read_at?: string | null
          reply_to_message_id?: string | null
          sender_member_id?: string | null
          sender_role?: string | null
          sender_user_id?: string | null
          thread_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          message_type?: string
          organization_id?: string
          read_at?: string | null
          reply_to_message_id?: string | null
          sender_member_id?: string | null
          sender_role?: string | null
          sender_user_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "internal_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_threads: {
        Row: {
          assigned_to: string | null
          campaign_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          member_id: string | null
          organization_id: string
          reply_enabled: boolean
          source: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          campaign_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          member_id?: string | null
          organization_id: string
          reply_enabled?: boolean
          source?: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          campaign_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          member_id?: string | null
          organization_id?: string
          reply_enabled?: boolean
          source?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_threads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          communication_type: string | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_public: boolean | null
          organization_id: string
          published_at: string | null
          target_role: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          communication_type?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_public?: boolean | null
          organization_id: string
          published_at?: string | null
          target_role?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          communication_type?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_public?: boolean | null
          organization_id?: string
          published_at?: string | null
          target_role?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          ends_at: string | null
          event_type: string | null
          id: string
          is_public: boolean | null
          location: string | null
          organization_id: string
          starts_at: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: string | null
          id?: string
          is_public?: boolean | null
          location?: string | null
          organization_id: string
          starts_at: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: string | null
          id?: string
          is_public?: boolean | null
          location?: string | null
          organization_id?: string
          starts_at?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string | null
          group_id: string
          id: string
          joined_at: string | null
          member_id: string
          role: string | null
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          joined_at?: string | null
          member_id: string
          role?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          joined_at?: string | null
          member_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          group_type: string | null
          id: string
          is_active: boolean | null
          leader_member_id: string | null
          location: string | null
          meeting_day: string | null
          meeting_time: string | null
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          group_type?: string | null
          id?: string
          is_active?: boolean | null
          leader_member_id?: string | null
          location?: string | null
          meeting_day?: string | null
          meeting_time?: string | null
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          group_type?: string | null
          id?: string
          is_active?: boolean | null
          leader_member_id?: string | null
          location?: string | null
          meeting_day?: string | null
          meeting_time?: string | null
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_leader_member_id_fkey"
            columns: ["leader_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          history_type: string
          id: string
          member_id: string
          organization_id: string
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          history_type: string
          id?: string
          member_id: string
          organization_id: string
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          history_type?: string
          id?: string
          member_id?: string
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_history_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          address: string | null
          address_complement: string | null
          address_number: string | null
          administrative_role: string | null
          baptized_at: string | null
          birth_date: string | null
          city: string | null
          congregation_id: string | null
          conversion_date: string | null
          country_code: string | null
          cpf: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          father_name: string | null
          full_name: string
          gender: string | null
          id: string
          joined_at: string | null
          marital_status: string | null
          member_role: string | null
          mother_name: string | null
          neighborhood: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          photo_url: string | null
          rg: string | null
          rg_issue_date: string | null
          rg_issuer: string | null
          sector_id: string | null
          spouse_name: string | null
          state: string | null
          status: string
          street: string | null
          updated_at: string | null
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          administrative_role?: string | null
          baptized_at?: string | null
          birth_date?: string | null
          city?: string | null
          congregation_id?: string | null
          conversion_date?: string | null
          country_code?: string | null
          cpf?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          father_name?: string | null
          full_name: string
          gender?: string | null
          id?: string
          joined_at?: string | null
          marital_status?: string | null
          member_role?: string | null
          mother_name?: string | null
          neighborhood?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          photo_url?: string | null
          rg?: string | null
          rg_issue_date?: string | null
          rg_issuer?: string | null
          sector_id?: string | null
          spouse_name?: string | null
          state?: string | null
          status?: string
          street?: string | null
          updated_at?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          administrative_role?: string | null
          baptized_at?: string | null
          birth_date?: string | null
          city?: string | null
          congregation_id?: string | null
          conversion_date?: string | null
          country_code?: string | null
          cpf?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          father_name?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          joined_at?: string | null
          marital_status?: string | null
          member_role?: string | null
          mother_name?: string | null
          neighborhood?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          photo_url?: string | null
          rg?: string | null
          rg_issue_date?: string | null
          rg_issuer?: string | null
          sector_id?: string | null
          spouse_name?: string | null
          state?: string | null
          status?: string
          street?: string | null
          updated_at?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          button_label: string | null
          button_link: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          full_content: string
          id: string
          image_url: string | null
          is_active: boolean
          organization_id: string | null
          short_description: string
          starts_at: string | null
          target_type: string
          title: string
          updated_at: string
        }
        Insert: {
          button_label?: string | null
          button_link?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          full_content: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          organization_id?: string | null
          short_description: string
          starts_at?: string | null
          target_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          button_label?: string | null
          button_link?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          full_content?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          organization_id?: string | null
          short_description?: string
          starts_at?: string | null
          target_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_campaign_media: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          media_type: string
          url: string
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          media_type: string
          url: string
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          media_type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_campaign_media_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "platform_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_campaigns: {
        Row: {
          body: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          subtitle: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          subtitle?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          subtitle?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      prayer_requests: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_private: boolean | null
          organization_id: string
          status: string | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_private?: boolean | null
          organization_id: string
          status?: string | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_private?: boolean | null
          organization_id?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prayer_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          signature_data: string | null
          signed_at: string | null
          signer_id: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          signature_data?: string | null
          signed_at?: string | null
          signer_id: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          signature_data?: string | null
          signed_at?: string | null
          signer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_external_access_invite: {
        Args: {
          _email: string
          _full_name: string
          _phone: string
          _responsibility_types: string[]
          _target_organization_id: string
        }
        Returns: Json
      }
      admin_create_member_access_invite: {
        Args: {
          _member_id: string
          _responsibility_types: string[]
          _target_organization_id: string
        }
        Returns: Json
      }
      admin_list_access_invites: {
        Args: { _target_organization_id: string }
        Returns: Json
      }
      admin_list_hierarchy_responsibles: {
        Args: { _organization_ids: string[] }
        Returns: Json
      }
      admin_list_organization_access: {
        Args: { _target_organization_id: string }
        Returns: Json
      }
      admin_revoke_access_invite: {
        Args: { _invite_id: string }
        Returns: Json
      }
      admin_search_members_for_access: {
        Args: { _query: string; _target_organization_id: string }
        Returns: Json
      }
      admin_set_organization_responsibilities: {
        Args: {
          _responsibility_types: string[]
          _target_organization_id: string
          _target_user_id: string
        }
        Returns: Json
      }
      can_manage_access_for_organization: {
        Args: { _target_organization_id: string; _user_id: string }
        Returns: boolean
      }
      get_my_access_capabilities: {
        Args: Record<PropertyKey, never>
        Returns: {
          organization_id: string
          permission_key: string
          responsibility_type: string
          source_organization_id: string
        }[]
      }
      get_my_managed_group_ids: {
        Args: { _organization_id: string }
        Returns: string[]
      }
      has_org_access_permission: {
        Args: {
          _organization_id: string
          _permission_key: string
          _user_id: string
        }
        Returns: boolean
      }
      has_org_finance_role: {
        Args: { _organization_id: string; _roles: string[]; _user_id: string }
        Returns: boolean
      }
      has_org_role: {
        Args: { _organization_id: string; _roles: string[]; _user_id: string }
        Returns: boolean
      }
      is_finance_month_closed: {
        Args: { _date: string; _organization_id: string }
        Returns: boolean
      }
      is_org_finance_reader: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_finance_writer: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_user: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_platform_finance_admin: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_valid_organization_hierarchy: {
        Args: { _child_type: string; _parent_type: string }
        Returns: boolean
      }
      join_organization_by_slug: { Args: { _slug: string }; Returns: Json }
      set_campaign_featured: {
        Args: { p_campaign_id: string; p_organization_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
