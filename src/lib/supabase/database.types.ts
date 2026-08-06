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
      activity_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_kind: Database["public"]["Enums"]["actor_kind"]
          after: Json | null
          before: Json | null
          changed_keys: string[] | null
          entity: string
          entity_id: string | null
          id: number
          occurred_at: string
          request_id: string | null
          txid: unknown
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_kind: Database["public"]["Enums"]["actor_kind"]
          after?: Json | null
          before?: Json | null
          changed_keys?: string[] | null
          entity: string
          entity_id?: string | null
          id?: never
          occurred_at?: string
          request_id?: string | null
          txid?: unknown
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_kind?: Database["public"]["Enums"]["actor_kind"]
          after?: Json | null
          before?: Json | null
          changed_keys?: string[] | null
          entity?: string
          entity_id?: string | null
          id?: never
          occurred_at?: string
          request_id?: string | null
          txid?: unknown
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_settings: {
        Row: {
          config: Json
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          call_task_id: string | null
          callback_on: string | null
          customer_id: string
          duration_seconds: number | null
          id: string
          notes: string | null
          occurred_at: string
          outcome: Database["public"]["Enums"]["call_outcome"]
          promised_on: string | null
          user_id: string
        }
        Insert: {
          call_task_id?: string | null
          callback_on?: string | null
          customer_id: string
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          occurred_at?: string
          outcome: Database["public"]["Enums"]["call_outcome"]
          promised_on?: string | null
          user_id: string
        }
        Update: {
          call_task_id?: string | null
          callback_on?: string | null
          customer_id?: string
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          occurred_at?: string
          outcome?: Database["public"]["Enums"]["call_outcome"]
          promised_on?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_call_task_id_fkey"
            columns: ["call_task_id"]
            isOneToOne: false
            referencedRelation: "call_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_call_task_id_fkey"
            columns: ["call_task_id"]
            isOneToOne: false
            referencedRelation: "call_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_tasks: {
        Row: {
          assigned_user_id: string | null
          attempts: number
          auto_close_on: string | null
          case_id: string | null
          closed_at: string | null
          context_line: string
          created_at: string
          customer_id: string
          dedupe_key: string | null
          due_on: string
          event_id: string | null
          id: string
          invoice_id: string | null
          priority: Database["public"]["Enums"]["call_priority"]
          reason: Database["public"]["Enums"]["call_reason"]
          status: Database["public"]["Enums"]["call_task_status"]
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          attempts?: number
          auto_close_on?: string | null
          case_id?: string | null
          closed_at?: string | null
          context_line: string
          created_at?: string
          customer_id: string
          dedupe_key?: string | null
          due_on?: string
          event_id?: string | null
          id?: string
          invoice_id?: string | null
          priority?: Database["public"]["Enums"]["call_priority"]
          reason: Database["public"]["Enums"]["call_reason"]
          status?: Database["public"]["Enums"]["call_task_status"]
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          attempts?: number
          auto_close_on?: string | null
          case_id?: string | null
          closed_at?: string | null
          context_line?: string
          created_at?: string
          customer_id?: string
          dedupe_key?: string | null
          due_on?: string
          event_id?: string | null
          id?: string
          invoice_id?: string | null
          priority?: Database["public"]["Enums"]["call_priority"]
          reason?: Database["public"]["Enums"]["call_reason"]
          status?: Database["public"]["Enums"]["call_task_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_tasks_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_board_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "automation_log_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_v"
            referencedColumns: ["id"]
          },
        ]
      }
      case_documents: {
        Row: {
          case_id: string
          checklist_id: string | null
          id: string
          label: string
          outstanding_since: string
          received_at: string | null
          state: Database["public"]["Enums"]["doc_state"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          case_id: string
          checklist_id?: string | null
          id?: string
          label: string
          outstanding_since?: string
          received_at?: string | null
          state?: Database["public"]["Enums"]["doc_state"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          case_id?: string
          checklist_id?: string | null
          id?: string
          label?: string
          outstanding_since?: string
          received_at?: string | null
          state?: Database["public"]["Enums"]["doc_state"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_board_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_documents_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "doc_checklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          expected_completion: string | null
          id: string
          opened_at: string
          pax_adults: number
          pax_children: number
          pipeline_id: string
          service_id: string | null
          stage_entered_at: string
          stage_id: string
          status: string
          supplier_id: string | null
          updated_at: string
          visa_issue_date: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          expected_completion?: string | null
          id?: string
          opened_at?: string
          pax_adults?: number
          pax_children?: number
          pipeline_id: string
          service_id?: string | null
          stage_entered_at?: string
          stage_id: string
          status?: string
          supplier_id?: string | null
          updated_at?: string
          visa_issue_date?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          expected_completion?: string | null
          id?: string
          opened_at?: string
          pax_adults?: number
          pax_children?: number
          pipeline_id?: string
          service_id?: string | null
          stage_entered_at?: string
          stage_id?: string
          status?: string
          supplier_id?: string | null
          updated_at?: string
          visa_issue_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_stage_fk"
            columns: ["stage_id", "pipeline_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id", "pipeline_id"]
          },
          {
            foreignKeyName: "cases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          category: string | null
          created_at: string
          created_by: string | null
          email: string | null
          email_flagged_at: string | null
          fbclid: string | null
          gclid: string | null
          id: string
          landing_page: string | null
          name: string
          nationality: string | null
          phone: string
          phone_alt: string | null
          phone_e164: string | null
          phone_flagged_at: string | null
          portal_issued_at: string | null
          portal_revoked_at: string | null
          portal_token_ciphertext: string | null
          portal_token_hash: string | null
          portal_token_key_version: number | null
          referrer: string | null
          source: string | null
          sponsor_company: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_flagged_at?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          landing_page?: string | null
          name: string
          nationality?: string | null
          phone: string
          phone_alt?: string | null
          phone_e164?: string | null
          phone_flagged_at?: string | null
          portal_issued_at?: string | null
          portal_revoked_at?: string | null
          portal_token_ciphertext?: string | null
          portal_token_hash?: string | null
          portal_token_key_version?: number | null
          referrer?: string | null
          source?: string | null
          sponsor_company?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_flagged_at?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          landing_page?: string | null
          name?: string
          nationality?: string | null
          phone?: string
          phone_alt?: string | null
          phone_e164?: string | null
          phone_flagged_at?: string | null
          portal_issued_at?: string | null
          portal_revoked_at?: string | null
          portal_token_ciphertext?: string | null
          portal_token_hash?: string | null
          portal_token_key_version?: number | null
          referrer?: string | null
          source?: string | null
          sponsor_company?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_checklist: {
        Row: {
          archived_at: string | null
          id: string
          label: string
          required: boolean
          service_id: string
          sort_order: number
          stage_id: string
        }
        Insert: {
          archived_at?: string | null
          id?: string
          label: string
          required?: boolean
          service_id: string
          sort_order?: number
          stage_id: string
        }
        Update: {
          archived_at?: string | null
          id?: string
          label?: string
          required?: boolean
          service_id?: string
          sort_order?: number
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_checklist_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_checklist_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_consent: {
        Row: {
          customer_id: string
          email: string
          evidence: Json
          granted: boolean
          id: string
          occurred_at: string
          source: string
        }
        Insert: {
          customer_id: string
          email: string
          evidence?: Json
          granted: boolean
          id?: string
          occurred_at?: string
          source: string
        }
        Update: {
          customer_id?: string
          email?: string
          evidence?: Json
          granted?: boolean
          id?: string
          occurred_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_consent_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          body: string | null
          bounce_type: string | null
          bounced_at: string | null
          case_id: string | null
          complained_at: string | null
          customer_id: string | null
          error: string | null
          id: string
          occurred_at: string
          open_count: number
          opened_at: string | null
          provider_msg_id: string | null
          queue_id: string | null
          sandboxed: boolean
          status: Database["public"]["Enums"]["email_status"]
          subject: string
          supplier_id: string | null
          template_key: string | null
          to_email: string
        }
        Insert: {
          body?: string | null
          bounce_type?: string | null
          bounced_at?: string | null
          case_id?: string | null
          complained_at?: string | null
          customer_id?: string | null
          error?: string | null
          id?: string
          occurred_at?: string
          open_count?: number
          opened_at?: string | null
          provider_msg_id?: string | null
          queue_id?: string | null
          sandboxed?: boolean
          status: Database["public"]["Enums"]["email_status"]
          subject: string
          supplier_id?: string | null
          template_key?: string | null
          to_email: string
        }
        Update: {
          body?: string | null
          bounce_type?: string | null
          bounced_at?: string | null
          case_id?: string | null
          complained_at?: string | null
          customer_id?: string | null
          error?: string | null
          id?: string
          occurred_at?: string
          open_count?: number
          opened_at?: string | null
          provider_msg_id?: string | null
          queue_id?: string | null
          sandboxed?: boolean
          status?: Database["public"]["Enums"]["email_status"]
          subject?: string
          supplier_id?: string | null
          template_key?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_board_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "email_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          attachments: Json
          attempts: number
          body: string
          case_id: string | null
          created_at: string
          customer_id: string | null
          dedupe_key: string | null
          event_id: string | null
          id: string
          invoice_id: string | null
          last_error: string | null
          next_attempt_at: string
          provider_msg_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          subject: string
          supplier_id: string | null
          template_key: string | null
          to_email: string
        }
        Insert: {
          attachments?: Json
          attempts?: number
          body: string
          case_id?: string | null
          created_at?: string
          customer_id?: string | null
          dedupe_key?: string | null
          event_id?: string | null
          id?: string
          invoice_id?: string | null
          last_error?: string | null
          next_attempt_at?: string
          provider_msg_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject: string
          supplier_id?: string | null
          template_key?: string | null
          to_email: string
        }
        Update: {
          attachments?: Json
          attempts?: number
          body?: string
          case_id?: string | null
          created_at?: string
          customer_id?: string | null
          dedupe_key?: string | null
          event_id?: string | null
          id?: string
          invoice_id?: string | null
          last_error?: string | null
          next_attempt_at?: string
          provider_msg_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject?: string
          supplier_id?: string | null
          template_key?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_board_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "automation_log_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          enabled: boolean
          is_promotional: boolean
          key: string
          name: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          enabled?: boolean
          is_promotional?: boolean
          key: string
          name: string
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          enabled?: boolean
          is_promotional?: boolean
          key?: string
          name?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          attempts: number
          case_id: string | null
          customer_id: string | null
          dedupe_key: string | null
          entity: string
          entity_id: string
          id: string
          occurred_at: string
          payload: Json
          processed_at: string | null
          processed_result: Json | null
          type: Database["public"]["Enums"]["event_type"]
        }
        Insert: {
          attempts?: number
          case_id?: string | null
          customer_id?: string | null
          dedupe_key?: string | null
          entity: string
          entity_id: string
          id?: string
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          processed_result?: Json | null
          type: Database["public"]["Enums"]["event_type"]
        }
        Update: {
          attempts?: number
          case_id?: string | null
          customer_id?: string | null
          dedupe_key?: string | null
          entity?: string
          entity_id?: string
          id?: string
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          processed_result?: Json | null
          type?: Database["public"]["Enums"]["event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_board_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_paise: number
          archived_at: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          spent_on: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount_paise: number
          archived_at?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          spent_on?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          archived_at?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          spent_on?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_requests: {
        Row: {
          id: string
          integration: string
          note: string | null
          notified_at: string | null
          requested_at: string
          requested_by: string
          status: string
        }
        Insert: {
          id?: string
          integration: string
          note?: string | null
          notified_at?: string | null
          requested_at?: string
          requested_by: string
          status?: string
        }
        Update: {
          id?: string
          integration?: string
          note?: string | null
          notified_at?: string | null
          requested_at?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_drafts: {
        Row: {
          amount_note: string | null
          case_id: string | null
          created_at: string
          created_by: string
          custom_service_name: string | null
          customer_id: string
          id: string
          issued_invoice_id: string | null
          lines: Json
          pax_adults: number
          pax_children: number
          service_id: string | null
          updated_at: string
        }
        Insert: {
          amount_note?: string | null
          case_id?: string | null
          created_at?: string
          created_by: string
          custom_service_name?: string | null
          customer_id: string
          id?: string
          issued_invoice_id?: string | null
          lines?: Json
          pax_adults?: number
          pax_children?: number
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_note?: string | null
          case_id?: string | null
          created_at?: string
          created_by?: string
          custom_service_name?: string | null
          customer_id?: string
          id?: string
          issued_invoice_id?: string | null
          lines?: Json
          pax_adults?: number
          pax_children?: number
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_drafts_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_drafts_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_board_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_drafts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_drafts_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount_paise: number
          catalogue_rate_paise: number | null
          gst_bp: number
          gst_paise: number
          id: string
          invoice_id: string
          label: string
          line_no: number
          qty: number
          rate_paise: number
        }
        Insert: {
          amount_paise: number
          catalogue_rate_paise?: number | null
          gst_bp?: number
          gst_paise?: number
          id?: string
          invoice_id: string
          label: string
          line_no: number
          qty: number
          rate_paise: number
        }
        Update: {
          amount_paise?: number
          catalogue_rate_paise?: number | null
          gst_bp?: number
          gst_paise?: number
          id?: string
          invoice_id?: string
          label?: string
          line_no?: number
          qty?: number
          rate_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_v"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_note: string | null
          case_id: string | null
          currency: string
          customer_id: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          due_date: string
          gst_paise: number
          id: string
          idempotency_key: string | null
          issue_date: string
          issued_at: string
          issued_by: string
          lifecycle: Database["public"]["Enums"]["invoice_lifecycle"]
          number: string | null
          parent_invoice_id: string | null
          pax_adults: number
          pax_children: number
          pdf_path: string | null
          seq: number
          series: string
          service_id: string | null
          service_name: string
          subtotal_paise: number
          supersedes_invoice_id: string | null
          total_paise: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_note?: string | null
          case_id?: string | null
          currency?: string
          customer_id: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          due_date: string
          gst_paise?: number
          id?: string
          idempotency_key?: string | null
          issue_date: string
          issued_at?: string
          issued_by: string
          lifecycle?: Database["public"]["Enums"]["invoice_lifecycle"]
          number?: string | null
          parent_invoice_id?: string | null
          pax_adults?: number
          pax_children?: number
          pdf_path?: string | null
          seq: number
          series: string
          service_id?: string | null
          service_name: string
          subtotal_paise: number
          supersedes_invoice_id?: string | null
          total_paise: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_note?: string | null
          case_id?: string | null
          currency?: string
          customer_id?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          due_date?: string
          gst_paise?: number
          id?: string
          idempotency_key?: string | null
          issue_date?: string
          issued_at?: string
          issued_by?: string
          lifecycle?: Database["public"]["Enums"]["invoice_lifecycle"]
          number?: string | null
          parent_invoice_id?: string | null
          pax_adults?: number
          pax_children?: number
          pdf_path?: string | null
          seq?: number
          series?: string
          service_id?: string | null
          service_name?: string
          subtotal_paise?: number
          supersedes_invoice_id?: string | null
          total_paise?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_board_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supersedes_invoice_id_fkey"
            columns: ["supersedes_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supersedes_invoice_id_fkey"
            columns: ["supersedes_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      line_item_rules: {
        Row: {
          active: boolean
          archived_at: string | null
          created_at: string
          id: string
          label: string
          qty_rule: Database["public"]["Enums"]["qty_rule"]
          rate_paise: number
          service_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          id?: string
          label: string
          qty_rule: Database["public"]["Enums"]["qty_rule"]
          rate_paise: number
          service_id: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          id?: string
          label?: string
          qty_rule?: Database["public"]["Enums"]["qty_rule"]
          rate_paise?: number
          service_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_item_rules_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_paise: number
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          number: string | null
          paid_on: string
          recorded_by: string
          reference: string | null
          seq: number | null
          series: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_paise: number
          created_at?: string
          id?: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          number?: string | null
          paid_on: string
          recorded_by: string
          reference?: string | null
          seq?: number | null
          series?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_paise?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          number?: string | null
          paid_on?: string
          recorded_by?: string
          reference?: string | null
          seq?: number | null
          series?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          id: string
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          name: string
          sort_order: number
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      portal_attempts: {
        Row: {
          hits: number
          ip: string
          minute: string
        }
        Insert: {
          hits?: number
          ip: string
          minute: string
        }
        Update: {
          hits?: number
          ip?: string
          minute?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          archived_at: string | null
          archived_by: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          email?: string | null
          id: string
          name: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          amount_note: string | null
          archived_at: string | null
          converted_invoice_id: string | null
          created_at: string
          created_by: string | null
          custom_service_name: string | null
          customer_id: string
          gst_paise: number
          id: string
          lines: Json
          number: string | null
          pax_adults: number
          pax_children: number
          seq: number
          series: string
          service_id: string | null
          status: string
          subtotal_paise: number
          total_paise: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          amount_note?: string | null
          archived_at?: string | null
          converted_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_service_name?: string | null
          customer_id: string
          gst_paise?: number
          id?: string
          lines?: Json
          number?: string | null
          pax_adults?: number
          pax_children?: number
          seq: number
          series: string
          service_id?: string | null
          status?: string
          subtotal_paise?: number
          total_paise?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          amount_note?: string | null
          archived_at?: string | null
          converted_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_service_name?: string | null
          customer_id?: string
          gst_paise?: number
          id?: string
          lines?: Json
          number?: string | null
          pax_adults?: number
          pax_children?: number
          seq?: number
          series?: string
          service_id?: string | null
          status?: string
          subtotal_paise?: number
          total_paise?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_converted_invoice_id_fkey"
            columns: ["converted_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_converted_invoice_id_fkey"
            columns: ["converted_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          archived_at: string | null
          category: Database["public"]["Enums"]["service_category"] | null
          created_at: string
          family: Database["public"]["Enums"]["service_family"]
          id: string
          location: Database["public"]["Enums"]["service_location"] | null
          name: string
          tracks_pipeline: boolean
          type: Database["public"]["Enums"]["service_type"] | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          category?: Database["public"]["Enums"]["service_category"] | null
          created_at?: string
          family: Database["public"]["Enums"]["service_family"]
          id?: string
          location?: Database["public"]["Enums"]["service_location"] | null
          name: string
          tracks_pipeline?: boolean
          type?: Database["public"]["Enums"]["service_type"] | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          category?: Database["public"]["Enums"]["service_category"] | null
          created_at?: string
          family?: Database["public"]["Enums"]["service_family"]
          id?: string
          location?: Database["public"]["Enums"]["service_location"] | null
          name?: string
          tracks_pipeline?: boolean
          type?: Database["public"]["Enums"]["service_type"] | null
          updated_at?: string
        }
        Relationships: []
      }
      stage_applicability: {
        Row: {
          service_id: string
          sort_order: number
          stage_id: string
        }
        Insert: {
          service_id: string
          sort_order: number
          stage_id: string
        }
        Update: {
          service_id?: string
          sort_order?: number
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_applicability_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_applicability_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_email_config: {
        Row: {
          custom_body: string | null
          custom_subject: string | null
          enabled: boolean
          requires_input: boolean
          stage_id: string
          template_key: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          custom_body?: string | null
          custom_subject?: string | null
          enabled?: boolean
          requires_input?: boolean
          stage_id: string
          template_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          custom_body?: string | null
          custom_subject?: string | null
          enabled?: boolean
          requires_input?: boolean
          stage_id?: string
          template_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_email_config_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: true
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_email_config_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "stage_email_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          created_at: string
          id: string
          is_terminal: boolean
          key: string
          name: string
          pipeline_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_terminal?: boolean
          key: string
          name: string
          pipeline_id: string
          sort_order: number
        }
        Update: {
          created_at?: string
          id?: string
          is_terminal?: boolean
          key?: string
          name?: string
          pipeline_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          archived_at: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          supplies: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          supplies?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          supplies?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      suppressions: {
        Row: {
          created_at: string
          detail: string | null
          email: string
          reason: Database["public"]["Enums"]["suppression_reason"]
        }
        Insert: {
          created_at?: string
          detail?: string | null
          email: string
          reason: Database["public"]["Enums"]["suppression_reason"]
        }
        Update: {
          created_at?: string
          detail?: string | null
          email?: string
          reason?: Database["public"]["Enums"]["suppression_reason"]
        }
        Relationships: []
      }
    }
    Views: {
      automation_log_v: {
        Row: {
          attempts: number | null
          case_id: string | null
          customer_id: string | null
          customer_name: string | null
          dedupe_key: string | null
          entity: string | null
          entity_id: string | null
          error_text: string | null
          event_type: string | null
          has_error: boolean | null
          id: string | null
          is_failing: boolean | null
          occurred_at: string | null
          processed_at: string | null
          processed_result: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_board_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      call_list_v: {
        Row: {
          assigned_user_id: string | null
          assignee_name: string | null
          attempts: number | null
          case_id: string | null
          context_line: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          days_late: number | null
          due_on: string | null
          id: string | null
          invoice_id: string | null
          is_due: boolean | null
          phone_flagged: boolean | null
          priority: Database["public"]["Enums"]["call_priority"] | null
          priority_rank: number | null
          reason: Database["public"]["Enums"]["call_reason"] | null
          status: Database["public"]["Enums"]["call_task_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "call_tasks_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_board_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_v"
            referencedColumns: ["id"]
          },
        ]
      }
      cases_board_v: {
        Row: {
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          days_in_stage: number | null
          id: string | null
          is_stuck: boolean | null
          opened_at: string | null
          outstanding_paise: number | null
          pax_adults: number | null
          pax_children: number | null
          pipeline_id: string | null
          pipeline_name: string | null
          service_id: string | null
          service_name: string | null
          stage_entered_at: string | null
          stage_id: string | null
          stage_name: string | null
          stage_path: Json | null
          stage_sort: number | null
          status: string | null
          visa_issue_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_stage_fk"
            columns: ["stage_id", "pipeline_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id", "pipeline_id"]
          },
        ]
      }
      history_v: {
        Row: {
          action: string | null
          actor_kind: string | null
          customer_id: string | null
          detail: string | null
          entity: string | null
          entity_id: string | null
          error_text: string | null
          id: string | null
          is_error: boolean | null
          occurred_at: string | null
          source: string | null
          user_id: string | null
        }
        Relationships: []
      }
      invoices_v: {
        Row: {
          amount_note: string | null
          case_id: string | null
          credited_paise: number | null
          currency: string | null
          customer_id: string | null
          days_overdue: number | null
          display_status: string | null
          doc_type: Database["public"]["Enums"]["doc_type"] | null
          due_date: string | null
          gst_paise: number | null
          id: string | null
          idempotency_key: string | null
          is_overdue: boolean | null
          issue_date: string | null
          issued_at: string | null
          issued_by: string | null
          lifecycle: Database["public"]["Enums"]["invoice_lifecycle"] | null
          number: string | null
          outstanding_paise: number | null
          paid_paise: number | null
          parent_invoice_id: string | null
          pax_adults: number | null
          pax_children: number | null
          payment_status: string | null
          pdf_path: string | null
          seq: number | null
          series: string | null
          service_id: string | null
          service_name: string | null
          subtotal_paise: number | null
          supersedes_invoice_id: string | null
          total_paise: number | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_board_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supersedes_invoice_id_fkey"
            columns: ["supersedes_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supersedes_invoice_id_fkey"
            columns: ["supersedes_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_set_user:
        | {
            Args: { p_active?: boolean; p_user_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_active?: boolean
              p_role?: Database["public"]["Enums"]["user_role"]
              p_user_id: string
            }
            Returns: undefined
          }
      archive_case: { Args: { p_case_id: string }; Returns: undefined }
      archive_customer: { Args: { p_customer_id: string }; Returns: undefined }
      archive_supplier: { Args: { p_supplier_id: string }; Returns: undefined }
      assign_call_task: {
        Args: { p_task_id: string; p_user_id: string }
        Returns: undefined
      }
      attach_invoice_pdf: {
        Args: { p_invoice_id: string; p_path: string }
        Returns: undefined
      }
      call_report: {
        Args: { p_days?: number }
        Returns: {
          avg_seconds: number
          calls: number
          no_answer: number
          open_tasks: number
          overdue_tasks: number
          promised: number
          reach_pct: number
          reached: number
          user_id: string
          user_name: string
          wrong_number: number
        }[]
      }
      can_access_customer: { Args: { p_customer_id: string }; Returns: boolean }
      cancel_invoice_with_refund: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
      convert_quotation_to_invoice: {
        Args: {
          p_expected_total_paise: number
          p_idempotency_key: string
          p_quotation_id: string
        }
        Returns: {
          invoice_id: string
          number: string
        }[]
      }
      create_call_task: {
        Args: {
          p_assign_to?: string
          p_case_id?: string
          p_context: string
          p_customer_id: string
          p_due_on?: string
          p_priority?: Database["public"]["Enums"]["call_priority"]
        }
        Returns: string
      }
      create_lead: {
        Args: {
          p_email?: string
          p_fbclid?: string
          p_gclid?: string
          p_landing_page?: string
          p_message?: string
          p_name: string
          p_phone: string
          p_referrer?: string
          p_service_id?: string
          p_source?: string
          p_utm_campaign?: string
          p_utm_content?: string
          p_utm_medium?: string
          p_utm_source?: string
          p_utm_term?: string
        }
        Returns: {
          case_id: string
          customer_id: string
          is_new_customer: boolean
        }[]
      }
      create_quotation: {
        Args: {
          p_amount_note?: string
          p_custom_service_name?: string
          p_customer_id: string
          p_gst_paise?: number
          p_lines?: Json
          p_pax_adults?: number
          p_pax_children?: number
          p_service_id?: string
          p_subtotal_paise?: number
          p_total_paise?: number
          p_valid_until?: string
        }
        Returns: {
          number: string
          quotation_id: string
        }[]
      }
      current_invoice_series: { Args: never; Returns: string }
      dispatch_call_task: {
        Args: {
          p_case_id?: string
          p_context: string
          p_customer_id: string
          p_dedupe_key: string
          p_invoice_id?: string
          p_priority: Database["public"]["Enums"]["call_priority"]
          p_reason: Database["public"]["Enums"]["call_reason"]
        }
        Returns: boolean
      }
      has_email_consent: { Args: { p_customer_id: string }; Returns: boolean }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      issue_invoice: {
        Args: {
          p_draft_id: string
          p_expected_total_paise: number
          p_idempotency_key?: string
          p_issue_date?: string
        }
        Returns: {
          invoice_id: string
          number: string
          total_paise: number
        }[]
      }
      issue_portal_token: { Args: { p_customer_id: string }; Returns: string }
      log_call: {
        Args: {
          p_callback_on?: string
          p_duration_seconds?: number
          p_notes?: string
          p_outcome: Database["public"]["Enums"]["call_outcome"]
          p_promised_on?: string
          p_task_id: string
        }
        Returns: {
          out_attempts: number
          out_due_on: string
          out_status: Database["public"]["Enums"]["call_task_status"]
        }[]
      }
      normalise_phone_in: { Args: { p: string }; Returns: string }
      peek_next_invoice_number: { Args: { p_series?: string }; Returns: string }
      portal_rate_ok: {
        Args: { p_ip: string; p_limit?: number }
        Returns: boolean
      }
      portal_read: { Args: { p_token: string }; Returns: Json }
      read_customer_passport: {
        Args: { p_customer_id: string; p_purpose: string }
        Returns: {
          ciphertext: string
          key_version: number
        }[]
      }
      record_payment: {
        Args: {
          p_amount_paise: number
          p_idempotency_key?: string
          p_invoice_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_paid_on?: string
          p_reference?: string
        }
        Returns: {
          outstanding_paise: number
          paid_paise: number
          payment_id: string
        }[]
      }
      revoke_portal_token: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      run_automation_rules: {
        Args: never
        Returns: {
          events_emitted: number
          rule: string
          tasks_raised: number
        }[]
      }
      today_kolkata: { Args: never; Returns: string }
      upsert_customer_passport: {
        Args: {
          p_ciphertext: string
          p_customer_id: string
          p_hash: string
          p_key_version?: number
        }
        Returns: undefined
      }
      void_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
      void_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      actor_kind: "user" | "service" | "system" | "portal"
      audit_action: "insert" | "update" | "delete"
      call_outcome:
        | "reached_resolved"
        | "promised_payment"
        | "needs_callback"
        | "no_answer"
        | "busy"
        | "switched_off"
        | "wrong_number"
        | "refused"
      call_priority: "high" | "medium" | "low"
      call_reason:
        | "payment_chase"
        | "doc_collection"
        | "unreachable"
        | "quote_followup"
        | "case_unblock"
        | "renewal"
        | "reengagement"
        | "promise_due"
        | "wrong_number_admin"
        | "input_needed"
      call_task_status: "open" | "done" | "escalated" | "auto_closed"
      doc_state: "outstanding" | "received" | "waived"
      doc_type: "invoice" | "credit_note"
      email_status:
        | "queued"
        | "sending"
        | "sent"
        | "failed"
        | "suppressed"
        | "sandboxed"
      event_type:
        | "lead.created"
        | "case.stage_changed"
        | "case.completed"
        | "case.stuck"
        | "docs.missing"
        | "quote.unanswered"
        | "invoice.issued"
        | "invoice.unpaid"
        | "invoice.overdue"
        | "payment.received"
        | "renewal.due"
        | "reengagement.due"
        | "email.failed"
        | "case.input_needed"
      invoice_lifecycle: "issued" | "void"
      payment_method: "cash" | "transfer" | "cheque"
      qty_rule: "once" | "once_per_file" | "per_person"
      service_category: "haj" | "umrah" | "standard" | "premium"
      service_family:
        | "ticketing"
        | "holiday"
        | "haj_umrah"
        | "visa"
        | "passport"
        | "hotel"
        | "attestation"
        | "other"
      service_location: "domestic" | "international"
      service_type: "new" | "renew"
      suppression_reason: "hard_bounce" | "complaint" | "manual" | "unsubscribe"
      user_role: "admin" | "employee"
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
    Enums: {
      actor_kind: ["user", "service", "system", "portal"],
      audit_action: ["insert", "update", "delete"],
      call_outcome: [
        "reached_resolved",
        "promised_payment",
        "needs_callback",
        "no_answer",
        "busy",
        "switched_off",
        "wrong_number",
        "refused",
      ],
      call_priority: ["high", "medium", "low"],
      call_reason: [
        "payment_chase",
        "doc_collection",
        "unreachable",
        "quote_followup",
        "case_unblock",
        "renewal",
        "reengagement",
        "promise_due",
        "wrong_number_admin",
        "input_needed",
      ],
      call_task_status: ["open", "done", "escalated", "auto_closed"],
      doc_state: ["outstanding", "received", "waived"],
      doc_type: ["invoice", "credit_note"],
      email_status: [
        "queued",
        "sending",
        "sent",
        "failed",
        "suppressed",
        "sandboxed",
      ],
      event_type: [
        "lead.created",
        "case.stage_changed",
        "case.completed",
        "case.stuck",
        "docs.missing",
        "quote.unanswered",
        "invoice.issued",
        "invoice.unpaid",
        "invoice.overdue",
        "payment.received",
        "renewal.due",
        "reengagement.due",
        "email.failed",
        "case.input_needed",
      ],
      invoice_lifecycle: ["issued", "void"],
      payment_method: ["cash", "transfer", "cheque"],
      qty_rule: ["once", "once_per_file", "per_person"],
      service_category: ["haj", "umrah", "standard", "premium"],
      service_family: [
        "ticketing",
        "holiday",
        "haj_umrah",
        "visa",
        "passport",
        "hotel",
        "attestation",
        "other",
      ],
      service_location: ["domestic", "international"],
      service_type: ["new", "renew"],
      suppression_reason: ["hard_bounce", "complaint", "manual", "unsubscribe"],
      user_role: ["admin", "employee"],
    },
  },
} as const
