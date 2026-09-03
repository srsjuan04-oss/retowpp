// Generado con `supabase gen types typescript` (MCP) contra el proyecto real
// reto-whatsapp (ppaxvtmsfpevsyqdfkik). No editar los tipos de `Database` a mano:
// correr `bun run db:types` (o el equivalente vía MCP) tras cada migración nueva.
// Los alias de abajo (UserRole, ConsentStatus, …) son azúcar sintáctico derivado
// de `Database["public"]["Enums"]`, para no tener que escribir el path completo
// en cada archivo consumidor.

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
      ai_agent_settings: {
        Row: {
          anthropic_api_key_encrypted: string
          company_id: string
          created_at: string
          id: string
          is_enabled: boolean
          model: string
          system_prompt: string | null
          updated_at: string
        }
        Insert: {
          anthropic_api_key_encrypted: string
          company_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          model?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          anthropic_api_key_encrypted?: string
          company_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          model?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminder_events: {
        Row: {
          appointment_reminder_webhook_id: string
          id: string
          message_id: string | null
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          appointment_reminder_webhook_id: string
          id?: string
          message_id?: string | null
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          appointment_reminder_webhook_id?: string
          id?: string
          message_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminder_events_appointment_reminder_webhook_i_fkey"
            columns: ["appointment_reminder_webhook_id"]
            isOneToOne: false
            referencedRelation: "appointment_reminder_webhooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_reminder_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminder_webhooks: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          phone_number_id: string
          template_id: string | null
          updated_at: string
          variable_mapping: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone_number_id: string
          template_id?: string | null
          updated_at?: string
          variable_mapping?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone_number_id?: string
          template_id?: string | null
          updated_at?: string
          variable_mapping?: Json
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminder_webhooks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_reminder_webhooks_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_reminder_webhooks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_batches: {
        Row: {
          batch_index: number
          campaign_id: string
          contact_count: number
          created_at: string
          finished_at: string | null
          id: string
          started_at: string | null
          status: string
        }
        Insert: {
          batch_index: number
          campaign_id: string
          contact_count: number
          created_at?: string
          finished_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          batch_index?: number
          campaign_id?: string
          contact_count?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          id: string
          message_id: string | null
          phone_number_snapshot: string
          skip_reason: string | null
          status: Database["public"]["Enums"]["campaign_recipient_status"]
          updated_at: string
          variables: Json
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          id?: string
          message_id?: string | null
          phone_number_snapshot: string
          skip_reason?: string | null
          status?: Database["public"]["Enums"]["campaign_recipient_status"]
          updated_at?: string
          variables?: Json
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          message_id?: string | null
          phone_number_snapshot?: string
          skip_reason?: string | null
          status?: Database["public"]["Enums"]["campaign_recipient_status"]
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_filter: Json
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          phone_number_id: string
          scheduled_at: string | null
          started_at: string | null
          stats: Json
          status: Database["public"]["Enums"]["campaign_status"]
          template_id: string
          updated_at: string
          variable_mapping: Json
        }
        Insert: {
          audience_filter?: Json
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          phone_number_id: string
          scheduled_at?: string | null
          started_at?: string | null
          stats?: Json
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id: string
          updated_at?: string
          variable_mapping?: Json
        }
        Update: {
          audience_filter?: Json
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          phone_number_id?: string
          scheduled_at?: string | null
          started_at?: string | null
          stats?: Json
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string
          updated_at?: string
          variable_mapping?: Json
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      contact_imports: {
        Row: {
          company_id: string
          created_at: string
          error_count: number
          error_report_path: string | null
          file_path: string
          id: string
          status: string
          success_count: number
          total_rows: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          error_count?: number
          error_report_path?: string | null
          file_path: string
          id?: string
          status?: string
          success_count?: number
          total_rows?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          error_count?: number
          error_report_path?: string | null
          file_path?: string
          id?: string
          status?: string
          success_count?: number
          total_rows?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_imports_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          blocked_at: string | null
          company_id: string
          consent_source: string | null
          consent_status: Database["public"]["Enums"]["consent_status"]
          created_at: string
          custom_fields: Json
          display_name: string | null
          id: string
          opted_out_at: string | null
          updated_at: string
          wa_id: string
        }
        Insert: {
          blocked_at?: string | null
          company_id: string
          consent_source?: string | null
          consent_status?: Database["public"]["Enums"]["consent_status"]
          created_at?: string
          custom_fields?: Json
          display_name?: string | null
          id?: string
          opted_out_at?: string | null
          updated_at?: string
          wa_id: string
        }
        Update: {
          blocked_at?: string | null
          company_id?: string
          consent_source?: string | null
          consent_status?: Database["public"]["Enums"]["consent_status"]
          created_at?: string
          custom_fields?: Json
          display_name?: string | null
          id?: string
          opted_out_at?: string | null
          updated_at?: string
          wa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_team_id: string | null
          assigned_to: string | null
          company_id: string
          contact_id: string
          created_at: string
          id: string
          last_inbound_at: string | null
          last_outbound_at: string | null
          last_read_at: string | null
          phone_number_id: string
          status: Database["public"]["Enums"]["conversation_status"]
          updated_at: string
        }
        Insert: {
          assigned_team_id?: string | null
          assigned_to?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          last_read_at?: string | null
          phone_number_id: string
          status?: Database["public"]["Enums"]["conversation_status"]
          updated_at?: string
        }
        Update: {
          assigned_team_id?: string | null
          assigned_to?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          last_read_at?: string | null
          phone_number_id?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_team_id_fkey"
            columns: ["assigned_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          company_id: string
          created_at: string
          field_type: string
          id: string
          key: string
          label: string
          options: Json | null
        }
        Insert: {
          company_id: string
          created_at?: string
          field_type: string
          id?: string
          key: string
          label: string
          options?: Json | null
        }
        Update: {
          company_id?: string
          created_at?: string
          field_type?: string
          id?: string
          key?: string
          label?: string
          options?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_branches: {
        Row: {
          created_at: string
          from_step_id: string
          id: string
          match_type: Database["public"]["Enums"]["flow_branch_match_type"]
          match_value: string | null
          priority: number
          to_step_id: string | null
        }
        Insert: {
          created_at?: string
          from_step_id: string
          id?: string
          match_type: Database["public"]["Enums"]["flow_branch_match_type"]
          match_value?: string | null
          priority?: number
          to_step_id?: string | null
        }
        Update: {
          created_at?: string
          from_step_id?: string
          id?: string
          match_type?: Database["public"]["Enums"]["flow_branch_match_type"]
          match_value?: string | null
          priority?: number
          to_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_branches_from_step_id_fkey"
            columns: ["from_step_id"]
            isOneToOne: false
            referencedRelation: "flow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_branches_to_step_id_fkey"
            columns: ["to_step_id"]
            isOneToOne: false
            referencedRelation: "flow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_runs: {
        Row: {
          completed_at: string | null
          contact_id: string
          conversation_id: string
          current_step_id: string | null
          flow_id: string
          id: string
          started_at: string
          status: Database["public"]["Enums"]["flow_run_status"]
          trigger_wamid: string
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          conversation_id: string
          current_step_id?: string | null
          flow_id: string
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["flow_run_status"]
          trigger_wamid: string
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          conversation_id?: string
          current_step_id?: string | null
          flow_id?: string
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["flow_run_status"]
          trigger_wamid?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_runs_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "flow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_steps: {
        Row: {
          content_type: Database["public"]["Enums"]["flow_step_content_type"]
          created_at: string
          flow_id: string
          id: string
          media_mime_type: string | null
          media_path: string | null
          step_order: number
          text_body: string | null
        }
        Insert: {
          content_type: Database["public"]["Enums"]["flow_step_content_type"]
          created_at?: string
          flow_id: string
          id?: string
          media_mime_type?: string | null
          media_path?: string | null
          step_order: number
          text_body?: string | null
        }
        Update: {
          content_type?: Database["public"]["Enums"]["flow_step_content_type"]
          created_at?: string
          flow_id?: string
          id?: string
          media_mime_type?: string | null
          media_path?: string | null
          step_order?: number
          text_body?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          template_id: string
          updated_at: string
          waba_account_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          template_id: string
          updated_at?: string
          waba_account_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          template_id?: string
          updated_at?: string
          waba_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_waba_account_id_fkey"
            columns: ["waba_account_id"]
            isOneToOne: false
            referencedRelation: "waba_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hotmart_webhook_events: {
        Row: {
          event: string
          hotmart_webhook_id: string | null
          id: string
          message_id: string | null
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          event: string
          hotmart_webhook_id?: string | null
          id?: string
          message_id?: string | null
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          event?: string
          hotmart_webhook_id?: string | null
          id?: string
          message_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotmart_webhook_events_hotmart_webhook_id_fkey"
            columns: ["hotmart_webhook_id"]
            isOneToOne: false
            referencedRelation: "hotmart_webhooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotmart_webhook_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      hotmart_webhooks: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          event: Database["public"]["Enums"]["hotmart_event"]
          id: string
          is_active: boolean
          name: string
          phone_number_id: string
          template_id: string
          updated_at: string
          variable_mapping: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          event: Database["public"]["Enums"]["hotmart_event"]
          id?: string
          is_active?: boolean
          name: string
          phone_number_id: string
          template_id: string
          updated_at?: string
          variable_mapping?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          event?: Database["public"]["Enums"]["hotmart_event"]
          id?: string
          is_active?: boolean
          name?: string
          phone_number_id?: string
          template_id?: string
          updated_at?: string
          variable_mapping?: Json
        }
        Relationships: [
          {
            foreignKeyName: "hotmart_webhooks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotmart_webhooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotmart_webhooks_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotmart_webhooks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_servers: {
        Row: {
          authorization_token_encrypted: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          url: string
        }
        Insert: {
          authorization_token_encrypted?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          url: string
        }
        Update: {
          authorization_token_encrypted?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_servers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_servers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_status_events: {
        Row: {
          created_at: string
          dedupe_key: string | null
          id: string
          message_id: string
          occurred_at: string
          raw_payload: Json
          status: Database["public"]["Enums"]["message_status"]
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          message_id: string
          occurred_at: string
          raw_payload?: Json
          status: Database["public"]["Enums"]["message_status"]
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          message_id?: string
          occurred_at?: string
          raw_payload?: Json
          status?: Database["public"]["Enums"]["message_status"]
        }
        Relationships: [
          {
            foreignKeyName: "message_status_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          client_dedupe_key: string | null
          content: Json
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          error: Json | null
          id: string
          media_id: string | null
          message_type: Database["public"]["Enums"]["message_type"]
          sender_id: string | null
          sender_type: Database["public"]["Enums"]["message_sender_type"]
          status: Database["public"]["Enums"]["message_status"]
          updated_at: string
          wamid: string | null
        }
        Insert: {
          client_dedupe_key?: string | null
          content?: Json
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          error?: Json | null
          id?: string
          media_id?: string | null
          message_type: Database["public"]["Enums"]["message_type"]
          sender_id?: string | null
          sender_type: Database["public"]["Enums"]["message_sender_type"]
          status?: Database["public"]["Enums"]["message_status"]
          updated_at?: string
          wamid?: string | null
        }
        Update: {
          client_dedupe_key?: string | null
          content?: Json
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          error?: Json | null
          id?: string
          media_id?: string | null
          message_type?: Database["public"]["Enums"]["message_type"]
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["message_sender_type"]
          status?: Database["public"]["Enums"]["message_status"]
          updated_at?: string
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_numbers: {
        Row: {
          company_id: string
          created_at: string
          display_phone_number: string
          id: string
          is_active: boolean
          label: string | null
          messaging_tier: string | null
          phone_number_id: string
          quality_rating: string | null
          waba_account_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_phone_number: string
          id?: string
          is_active?: boolean
          label?: string | null
          messaging_tier?: string | null
          phone_number_id: string
          quality_rating?: string | null
          waba_account_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          display_phone_number?: string
          id?: string
          is_active?: boolean
          label?: string | null
          messaging_tier?: string | null
          phone_number_id?: string
          quality_rating?: string | null
          waba_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_numbers_waba_account_id_fkey"
            columns: ["waba_account_id"]
            isOneToOne: false
            referencedRelation: "waba_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          is_platform_admin: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          is_platform_admin?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_platform_admin?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          is_team_lead: boolean
          profile_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          is_team_lead?: boolean
          profile_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          is_team_lead?: boolean
          profile_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          category: string
          company_id: string
          components: Json
          created_at: string
          id: string
          language: string
          last_synced_at: string
          meta_template_id: string
          name: string
          status: Database["public"]["Enums"]["template_status"]
          waba_account_id: string
        }
        Insert: {
          category: string
          company_id: string
          components?: Json
          created_at?: string
          id?: string
          language: string
          last_synced_at?: string
          meta_template_id: string
          name: string
          status: Database["public"]["Enums"]["template_status"]
          waba_account_id: string
        }
        Update: {
          category?: string
          company_id?: string
          components?: Json
          created_at?: string
          id?: string
          language?: string
          last_synced_at?: string
          meta_template_id?: string
          name?: string
          status?: Database["public"]["Enums"]["template_status"]
          waba_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_waba_account_id_fkey"
            columns: ["waba_account_id"]
            isOneToOne: false
            referencedRelation: "waba_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      waba_accounts: {
        Row: {
          access_token_encrypted: string
          app_secret_ref: string
          business_name: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          waba_id: string
        }
        Insert: {
          access_token_encrypted: string
          app_secret_ref: string
          business_name: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          waba_id: string
        }
        Update: {
          access_token_encrypted?: string
          app_secret_ref?: string
          business_name?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waba_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          company_id: string | null
          dedupe_key: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
          retry_count: number
          signature_valid: boolean
          waba_account_id: string | null
        }
        Insert: {
          company_id?: string | null
          dedupe_key: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          retry_count?: number
          signature_valid: boolean
          waba_account_id?: string | null
        }
        Update: {
          company_id?: string | null
          dedupe_key?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          retry_count?: number
          signature_valid?: boolean
          waba_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_waba_account_id_fkey"
            columns: ["waba_account_id"]
            isOneToOne: false
            referencedRelation: "waba_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_company_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_supervisor: { Args: never; Returns: boolean }
      is_conversation_visible: {
        Args: { p_assigned_team_id: string; p_assigned_to: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      campaign_recipient_status:
        | "pending"
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "skipped"
      campaign_status:
        | "draft"
        | "recipients_locked"
        | "queued"
        | "running"
        | "paused"
        | "completed"
        | "failed"
        | "cancelled"
      consent_status: "subscribed" | "unsubscribed" | "blocked" | "pending"
      conversation_status: "open" | "pending" | "closed"
      flow_branch_match_type: "any" | "equals" | "contains"
      flow_run_status: "active" | "completed"
      flow_step_content_type: "text" | "image" | "audio"
      hotmart_event:
        | "PURCHASE_APPROVED"
        | "PURCHASE_CANCELED"
        | "PURCHASE_OUT_OF_SHOPPING_CART"
      message_direction: "inbound" | "outbound"
      message_sender_type:
        | "contact"
        | "agent"
        | "system"
        | "campaign"
        | "ai_agent"
        | "hotmart"
      message_status: "queued" | "sent" | "delivered" | "read" | "failed"
      message_type:
        | "text"
        | "template"
        | "image"
        | "document"
        | "audio"
        | "video"
        | "sticker"
        | "location"
        | "interactive"
        | "button"
        | "unknown"
      template_status:
        | "approved"
        | "pending"
        | "rejected"
        | "paused"
        | "disabled"
      user_role: "admin" | "supervisor" | "agent"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      campaign_recipient_status: [
        "pending",
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
        "skipped",
      ],
      campaign_status: [
        "draft",
        "recipients_locked",
        "queued",
        "running",
        "paused",
        "completed",
        "failed",
        "cancelled",
      ],
      consent_status: ["subscribed", "unsubscribed", "blocked", "pending"],
      conversation_status: ["open", "pending", "closed"],
      flow_branch_match_type: ["any", "equals", "contains"],
      flow_run_status: ["active", "completed"],
      flow_step_content_type: ["text", "image", "audio"],
      hotmart_event: [
        "PURCHASE_APPROVED",
        "PURCHASE_CANCELED",
        "PURCHASE_OUT_OF_SHOPPING_CART",
      ],
      message_direction: ["inbound", "outbound"],
      message_sender_type: [
        "contact",
        "agent",
        "system",
        "campaign",
        "ai_agent",
        "hotmart",
      ],
      message_status: ["queued", "sent", "delivered", "read", "failed"],
      message_type: [
        "text",
        "template",
        "image",
        "document",
        "audio",
        "video",
        "sticker",
        "location",
        "interactive",
        "button",
        "unknown",
      ],
      template_status: [
        "approved",
        "pending",
        "rejected",
        "paused",
        "disabled",
      ],
      user_role: ["admin", "supervisor", "agent"],
    },
  },
} as const

// --- Alias de conveniencia, derivados de Database["public"]["Enums"] (evitan
// escribir el path completo en cada archivo consumidor). ---
export type UserRole = Database["public"]["Enums"]["user_role"];
export type ConsentStatus = Database["public"]["Enums"]["consent_status"];
export type ConversationStatus = Database["public"]["Enums"]["conversation_status"];
export type MessageDirection = Database["public"]["Enums"]["message_direction"];
export type MessageSenderType = Database["public"]["Enums"]["message_sender_type"];
export type MessageType = Database["public"]["Enums"]["message_type"];
export type MessageStatus = Database["public"]["Enums"]["message_status"];
export type TemplateStatus = Database["public"]["Enums"]["template_status"];
export type CampaignStatus = Database["public"]["Enums"]["campaign_status"];
export type CampaignRecipientStatus = Database["public"]["Enums"]["campaign_recipient_status"];
export type FlowStepContentType = Database["public"]["Enums"]["flow_step_content_type"];
export type FlowBranchMatchType = Database["public"]["Enums"]["flow_branch_match_type"];
export type FlowRunStatus = Database["public"]["Enums"]["flow_run_status"];
export type HotmartEvent = Database["public"]["Enums"]["hotmart_event"];
