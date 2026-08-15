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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      academic_calendar_events: {
        Row: {
          academic_year_id: string
          affects_instruction: boolean
          created_at: string
          ends_at: string | null
          ends_on: string | null
          event_type: string
          id: string
          organization_id: string
          school_id: string
          starts_at: string | null
          starts_on: string | null
          term_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          affects_instruction?: boolean
          created_at?: string
          ends_at?: string | null
          ends_on?: string | null
          event_type: string
          id?: string
          organization_id: string
          school_id: string
          starts_at?: string | null
          starts_on?: string | null
          term_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          affects_instruction?: boolean
          created_at?: string
          ends_at?: string | null
          ends_on?: string | null
          event_type?: string
          id?: string
          organization_id?: string
          school_id?: string
          starts_at?: string | null
          starts_on?: string | null
          term_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_term_fk"
            columns: ["term_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "calendar_year_fk"
            columns: ["academic_year_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      academic_years: {
        Row: {
          code: string
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          name: string
          organization_id: string
          school_id: string
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          organization_id: string
          school_id: string
          starts_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          organization_id?: string
          school_id?: string
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      assessment_learning_objectives: {
        Row: {
          assessment_id: string
          created_at: string
          learning_objective_id: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          learning_objective_id: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          learning_objective_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_learning_objectives_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_learning_objectives_learning_objective_id_fkey"
            columns: ["learning_objective_id"]
            isOneToOne: false
            referencedRelation: "learning_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_types: {
        Row: {
          code: string
          created_at: string
          default_weight: number | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_weight?: number | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_weight?: number | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_types_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      assessments: {
        Row: {
          academic_year_id: string
          assessment_date: string
          assessment_type_id: string
          created_at: string
          created_by_profile_id: string | null
          description: string | null
          id: string
          max_score: number
          min_score: number
          organization_id: string
          school_id: string
          status: string
          teaching_assignment_id: string
          term_id: string
          title: string
          updated_at: string
          weight: number | null
        }
        Insert: {
          academic_year_id: string
          assessment_date: string
          assessment_type_id: string
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          id?: string
          max_score?: number
          min_score?: number
          organization_id: string
          school_id: string
          status?: string
          teaching_assignment_id: string
          term_id: string
          title: string
          updated_at?: string
          weight?: number | null
        }
        Update: {
          academic_year_id?: string
          assessment_date?: string
          assessment_type_id?: string
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          id?: string
          max_score?: number
          min_score?: number
          organization_id?: string
          school_id?: string
          status?: string
          teaching_assignment_id?: string
          term_id?: string
          title?: string
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_teaching_fk"
            columns: ["teaching_assignment_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "teaching_assignments"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "assessments_term_fk"
            columns: ["term_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "assessments_type_fk"
            columns: ["assessment_type_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "assessment_types"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "assessments_year_fk"
            columns: ["academic_year_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          academic_year_id: string
          classroom_id: string
          created_at: string
          ends_at: string | null
          id: string
          locked_at: string | null
          manual_reason: string | null
          organization_id: string
          school_id: string
          session_date: string
          starts_at: string | null
          status: string
          submitted_at: string | null
          submitted_by_profile_id: string | null
          teaching_assignment_id: string | null
          term_id: string
          timetable_entry_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          classroom_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          locked_at?: string | null
          manual_reason?: string | null
          organization_id: string
          school_id: string
          session_date: string
          starts_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by_profile_id?: string | null
          teaching_assignment_id?: string | null
          term_id: string
          timetable_entry_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          classroom_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          locked_at?: string | null
          manual_reason?: string | null
          organization_id?: string
          school_id?: string
          session_date?: string
          starts_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by_profile_id?: string | null
          teaching_assignment_id?: string | null
          term_id?: string
          timetable_entry_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_assignment_fk"
            columns: ["teaching_assignment_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "teaching_assignments"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "attendance_sessions_classroom_fk"
            columns: ["classroom_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "attendance_sessions_submitted_by_profile_id_fkey"
            columns: ["submitted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_term_fk"
            columns: ["term_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "attendance_sessions_timetable_fk"
            columns: ["timetable_entry_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "timetable_entries"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "attendance_sessions_year_fk"
            columns: ["academic_year_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_profile_id: string | null
          actor_type: string
          after_data: Json | null
          before_data: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          occurred_at: string
          organization_id: string | null
          school_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          actor_type?: string
          after_data?: Json | null
          before_data?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          occurred_at?: string
          organization_id?: string | null
          school_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          actor_type?: string
          after_data?: Json | null
          before_data?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          occurred_at?: string
          organization_id?: string | null
          school_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      class_enrollments: {
        Row: {
          classroom_id: string
          created_at: string
          ends_on: string | null
          id: string
          is_primary: boolean
          organization_id: string
          school_id: string
          starts_on: string
          status: string
          student_enrollment_id: string
          updated_at: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          ends_on?: string | null
          id?: string
          is_primary?: boolean
          organization_id: string
          school_id: string
          starts_on: string
          status?: string
          student_enrollment_id: string
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          is_primary?: boolean
          organization_id?: string
          school_id?: string
          starts_on?: string
          status?: string
          student_enrollment_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_classroom_fk"
            columns: ["classroom_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "class_enrollments_enrollment_fk"
            columns: ["student_enrollment_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "student_enrollments"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      classrooms: {
        Row: {
          academic_year_id: string
          capacity: number | null
          code: string
          created_at: string
          grade_level_id: string
          homeroom_staff_school_assignment_id: string | null
          id: string
          name: string
          organization_id: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          capacity?: number | null
          code: string
          created_at?: string
          grade_level_id: string
          homeroom_staff_school_assignment_id?: string | null
          id?: string
          name: string
          organization_id: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          capacity?: number | null
          code?: string
          created_at?: string
          grade_level_id?: string
          homeroom_staff_school_assignment_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classrooms_grade_fk"
            columns: ["grade_level_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "classrooms_homeroom_assignment_fk"
            columns: [
              "homeroom_staff_school_assignment_id",
              "organization_id",
              "school_id",
            ]
            isOneToOne: false
            referencedRelation: "staff_school_assignments"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "classrooms_year_fk"
            columns: ["academic_year_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      curricula: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          organization_id: string
          school_id: string
          status: string
          updated_at: string
          version: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          school_id: string
          status?: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          school_id?: string
          status?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "curricula_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      file_assets: {
        Row: {
          bucket: string
          created_at: string
          id: string
          mime_type: string | null
          object_path: string
          organization_id: string
          original_filename: string
          school_id: string | null
          size_bytes: number | null
          status: string
          storage_provider: string
          updated_at: string
          uploaded_by_profile_id: string | null
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
          mime_type?: string | null
          object_path: string
          organization_id: string
          original_filename: string
          school_id?: string | null
          size_bytes?: number | null
          status?: string
          storage_provider?: string
          updated_at?: string
          uploaded_by_profile_id?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          object_path?: string
          organization_id?: string
          original_filename?: string
          school_id?: string | null
          size_bytes?: number | null
          status?: string
          storage_provider?: string
          updated_at?: string
          uploaded_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_assets_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "file_assets_uploaded_by_profile_id_fkey"
            columns: ["uploaded_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_documents: {
        Row: {
          checksum: string | null
          created_at: string
          document_type: string
          entity_id: string
          entity_type: string
          file_asset_id: string
          generated_at: string
          generated_by_profile_id: string | null
          id: string
          organization_id: string
          school_id: string
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          document_type: string
          entity_id: string
          entity_type: string
          file_asset_id: string
          generated_at?: string
          generated_by_profile_id?: string | null
          id?: string
          organization_id: string
          school_id: string
        }
        Update: {
          checksum?: string | null
          created_at?: string
          document_type?: string
          entity_id?: string
          entity_type?: string
          file_asset_id?: string
          generated_at?: string
          generated_by_profile_id?: string | null
          id?: string
          organization_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_file_asset_id_fkey"
            columns: ["file_asset_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_generated_by_profile_id_fkey"
            columns: ["generated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      grade_levels: {
        Row: {
          code: string
          created_at: string
          education_stage: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          school_id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          education_stage: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          school_id: string
          sequence: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          education_stage?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          school_id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_levels_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      guardians: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          occupation: string | null
          organization_id: string
          phone: string | null
          profile_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          occupation?: string | null
          organization_id: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          occupation?: string | null
          organization_id?: string
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_profile_id: string | null
          invited_role_id: string
          invited_scope_id: string | null
          invited_scope_type: string
          organization_id: string
          revoked_at: string | null
          school_id: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by_profile_id?: string | null
          invited_role_id: string
          invited_scope_id?: string | null
          invited_scope_type: string
          organization_id: string
          revoked_at?: string | null
          school_id?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_profile_id?: string | null
          invited_role_id?: string
          invited_scope_id?: string | null
          invited_scope_type?: string
          organization_id?: string
          revoked_at?: string | null
          school_id?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_role_id_fkey"
            columns: ["invited_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      learning_objectives: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          learning_outcome_id: string
          organization_id: string
          school_id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
          learning_outcome_id: string
          organization_id: string
          school_id: string
          sequence?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          learning_outcome_id?: string
          organization_id?: string
          school_id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_objectives_outcome_fk"
            columns: ["learning_outcome_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "learning_outcomes"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      learning_outcomes: {
        Row: {
          code: string
          created_at: string
          curriculum_id: string
          description: string
          grade_level_id: string | null
          id: string
          organization_id: string
          school_id: string
          sequence: number
          subject_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          curriculum_id: string
          description: string
          grade_level_id?: string | null
          id?: string
          organization_id: string
          school_id: string
          sequence?: number
          subject_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          curriculum_id?: string
          description?: string
          grade_level_id?: string | null
          id?: string
          organization_id?: string
          school_id?: string
          sequence?: number
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_outcomes_curriculum_fk"
            columns: ["curriculum_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "curricula"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "learning_outcomes_grade_fk"
            columns: ["grade_level_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "learning_outcomes_subject_fk"
            columns: ["subject_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      membership_roles: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          membership_id: string
          organization_id: string
          role_id: string
          scope_id: string | null
          scope_type: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          membership_id: string
          organization_id: string
          role_id: string
          scope_id?: string | null
          scope_type: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          membership_id?: string
          organization_id?: string
          role_id?: string
          scope_id?: string | null
          scope_type?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_membership_fk"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "membership_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_school_access: {
        Row: {
          created_at: string
          id: string
          membership_id: string
          organization_id: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_id: string
          organization_id: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string
          organization_id?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "msa_membership_fk"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "msa_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          joined_at: string | null
          organization_id: string
          profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          joined_at?: string | null
          organization_id: string
          profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          joined_at?: string | null
          organization_id?: string
          profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          code: string
          created_at: string
          id: string
          legal_name: string | null
          locale: string
          name: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          legal_name?: string | null
          locale?: string
          name: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          legal_name?: string | null
          locale?: string
          name?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          action: string
          code: string
          created_at: string
          description: string | null
          domain: string
          id: string
        }
        Insert: {
          action: string
          code: string
          created_at?: string
          description?: string | null
          domain: string
          id?: string
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          description?: string | null
          domain?: string
          id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_file_id: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_file_id?: string | null
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_file_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_avatar_file_fk"
            columns: ["avatar_file_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      report_card_narratives: {
        Row: {
          content: string
          created_at: string
          id: string
          organization_id: string
          report_card_id: string
          school_id: string
          section_code: string
          sequence: number
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          organization_id: string
          report_card_id: string
          school_id: string
          section_code: string
          sequence?: number
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          organization_id?: string
          report_card_id?: string
          school_id?: string
          section_code?: string
          sequence?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_card_narratives_report_fk"
            columns: ["report_card_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "report_cards"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      report_card_subject_entries: {
        Row: {
          created_at: string
          final_score: number | null
          id: string
          narrative: string | null
          organization_id: string
          predicate: string | null
          report_card_id: string
          school_id: string
          source_calculation: Json | null
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          final_score?: number | null
          id?: string
          narrative?: string | null
          organization_id: string
          predicate?: string | null
          report_card_id: string
          school_id: string
          source_calculation?: Json | null
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          final_score?: number | null
          id?: string
          narrative?: string | null
          organization_id?: string
          predicate?: string | null
          report_card_id?: string
          school_id?: string
          source_calculation?: Json | null
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_card_subject_report_fk"
            columns: ["report_card_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "report_cards"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "report_card_subject_subject_fk"
            columns: ["subject_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      report_cards: {
        Row: {
          academic_year_id: string
          attendance_summary: Json | null
          created_at: string
          homeroom_comment: string | null
          id: string
          organization_id: string
          published_at: string | null
          published_by_profile_id: string | null
          reviewed_at: string | null
          school_id: string
          status: string
          student_enrollment_id: string
          submitted_at: string | null
          term_id: string
          updated_at: string
          version: number
        }
        Insert: {
          academic_year_id: string
          attendance_summary?: Json | null
          created_at?: string
          homeroom_comment?: string | null
          id?: string
          organization_id: string
          published_at?: string | null
          published_by_profile_id?: string | null
          reviewed_at?: string | null
          school_id: string
          status?: string
          student_enrollment_id: string
          submitted_at?: string | null
          term_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          academic_year_id?: string
          attendance_summary?: Json | null
          created_at?: string
          homeroom_comment?: string | null
          id?: string
          organization_id?: string
          published_at?: string | null
          published_by_profile_id?: string | null
          reviewed_at?: string | null
          school_id?: string
          status?: string
          student_enrollment_id?: string
          submitted_at?: string | null
          term_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_enrollment_fk"
            columns: ["student_enrollment_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "student_enrollments"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "report_cards_published_by_profile_id_fkey"
            columns: ["published_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_term_fk"
            columns: ["term_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "report_cards_year_fk"
            columns: ["academic_year_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_customizable: boolean
          is_system_role: boolean
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_customizable?: boolean
          is_system_role?: boolean
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_customizable?: boolean
          is_system_role?: boolean
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settings: {
        Row: {
          attendance_settings: Json
          created_at: string
          grading_settings: Json
          id: string
          logo_file_id: string | null
          organization_id: string
          report_branding: Json
          school_id: string
          updated_at: string
        }
        Insert: {
          attendance_settings?: Json
          created_at?: string
          grading_settings?: Json
          id?: string
          logo_file_id?: string | null
          organization_id: string
          report_branding?: Json
          school_id: string
          updated_at?: string
        }
        Update: {
          attendance_settings?: Json
          created_at?: string
          grading_settings?: Json
          id?: string
          logo_file_id?: string | null
          organization_id?: string
          report_branding?: Json
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_settings_logo_file_fk"
            columns: ["logo_file_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_settings_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      schools: {
        Row: {
          code: string
          created_at: string
          education_stage: string
          id: string
          name: string
          npsn: string | null
          organization_id: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          education_stage: string
          id?: string
          name: string
          npsn?: string | null
          organization_id: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          education_stage?: string
          id?: string
          name?: string
          npsn?: string | null
          organization_id?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_attendance_records: {
        Row: {
          attendance_date: string
          check_in_at: string | null
          check_out_at: string | null
          created_at: string
          id: string
          note: string | null
          organization_id: string
          school_id: string
          staff_member_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attendance_date: string
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          school_id: string
          staff_member_id: string
          status: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          school_id?: string
          staff_member_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "staff_attendance_staff_fk"
            columns: ["staff_member_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      staff_members: {
        Row: {
          created_at: string
          full_name: string
          id: string
          organization_id: string
          profile_id: string | null
          staff_kind: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          organization_id: string
          profile_id?: string | null
          staff_kind: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          organization_id?: string
          profile_id?: string | null
          staff_kind?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_school_assignments: {
        Row: {
          created_at: string
          employee_number: string | null
          employment_status: string
          id: string
          joined_on: string | null
          left_on: string | null
          organization_id: string
          position_title: string | null
          school_id: string
          staff_member_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_number?: string | null
          employment_status?: string
          id?: string
          joined_on?: string | null
          left_on?: string | null
          organization_id: string
          position_title?: string | null
          school_id: string
          staff_member_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_number?: string | null
          employment_status?: string
          id?: string
          joined_on?: string | null
          left_on?: string | null
          organization_id?: string
          position_title?: string | null
          school_id?: string
          staff_member_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_school_assignments_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "staff_school_assignments_staff_fk"
            columns: ["staff_member_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      student_attendance_records: {
        Row: {
          attendance_session_id: string
          check_in_at: string | null
          correction_reason: string | null
          created_at: string
          id: string
          note: string | null
          organization_id: string
          recorded_by_profile_id: string | null
          school_id: string
          status: string
          student_enrollment_id: string
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          attendance_session_id: string
          check_in_at?: string | null
          correction_reason?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          recorded_by_profile_id?: string | null
          school_id: string
          status: string
          student_enrollment_id: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          attendance_session_id?: string
          check_in_at?: string | null
          correction_reason?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          recorded_by_profile_id?: string | null
          school_id?: string
          status?: string
          student_enrollment_id?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_attendance_enrollment_fk"
            columns: ["student_enrollment_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "student_enrollments"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "student_attendance_records_recorded_by_profile_id_fkey"
            columns: ["recorded_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_attendance_records_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_attendance_session_fk"
            columns: ["attendance_session_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      student_enrollments: {
        Row: {
          academic_year_id: string
          created_at: string
          ended_on: string | null
          enrolled_on: string
          enrollment_number: string | null
          grade_level_id: string
          id: string
          organization_id: string
          previous_enrollment_id: string | null
          school_id: string
          status: string
          student_id: string
          student_number: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          ended_on?: string | null
          enrolled_on: string
          enrollment_number?: string | null
          grade_level_id: string
          id?: string
          organization_id: string
          previous_enrollment_id?: string | null
          school_id: string
          status?: string
          student_id: string
          student_number?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          ended_on?: string | null
          enrolled_on?: string
          enrollment_number?: string | null
          grade_level_id?: string
          id?: string
          organization_id?: string
          previous_enrollment_id?: string | null
          school_id?: string
          status?: string
          student_id?: string
          student_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_grade_fk"
            columns: ["grade_level_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "student_enrollments_previous_fk"
            columns: ["previous_enrollment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "student_enrollments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "student_enrollments_student_fk"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "student_enrollments_year_fk"
            columns: ["academic_year_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          can_manage_permissions: boolean
          can_receive_notification: boolean
          can_view_academic: boolean
          can_view_attendance: boolean
          created_at: string
          guardian_id: string
          id: string
          is_primary: boolean
          organization_id: string
          relationship_type: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          can_manage_permissions?: boolean
          can_receive_notification?: boolean
          can_view_academic?: boolean
          can_view_attendance?: boolean
          created_at?: string
          guardian_id: string
          id?: string
          is_primary?: boolean
          organization_id: string
          relationship_type: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          can_manage_permissions?: boolean
          can_receive_notification?: boolean
          can_view_academic?: boolean
          can_view_attendance?: boolean
          created_at?: string
          guardian_id?: string
          id?: string
          is_primary?: boolean
          organization_id?: string
          relationship_type?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_fk"
            columns: ["guardian_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "student_guardians_student_fk"
            columns: ["student_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      student_scores: {
        Row: {
          assessment_id: string
          created_at: string
          entered_by_profile_id: string | null
          feedback: string | null
          id: string
          organization_id: string
          school_id: string
          score: number | null
          status: string
          student_enrollment_id: string
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          assessment_id: string
          created_at?: string
          entered_by_profile_id?: string | null
          feedback?: string | null
          id?: string
          organization_id: string
          school_id: string
          score?: number | null
          status?: string
          student_enrollment_id: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          assessment_id?: string
          created_at?: string
          entered_by_profile_id?: string | null
          feedback?: string | null
          id?: string
          organization_id?: string
          school_id?: string
          score?: number | null
          status?: string
          student_enrollment_id?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_scores_assessment_fk"
            columns: ["assessment_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "student_scores_enrollment_fk"
            columns: ["student_enrollment_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "student_enrollments"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "student_scores_entered_by_profile_id_fkey"
            columns: ["entered_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_scores_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          birth_date: string | null
          birth_place: string | null
          created_at: string
          full_name: string
          gender: string | null
          id: string
          nisn: string | null
          organization_id: string
          preferred_name: string | null
          profile_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          birth_place?: string | null
          created_at?: string
          full_name: string
          gender?: string | null
          id?: string
          nisn?: string | null
          organization_id: string
          preferred_name?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          birth_place?: string | null
          created_at?: string
          full_name?: string
          gender?: string | null
          id?: string
          nisn?: string | null
          organization_id?: string
          preferred_name?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          category: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          school_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          school_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_fk"
            columns: ["school_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      teaching_assignments: {
        Row: {
          academic_year_id: string
          classroom_id: string
          created_at: string
          ends_on: string | null
          id: string
          organization_id: string
          role: string
          school_id: string
          staff_school_assignment_id: string
          starts_on: string
          status: string
          subject_id: string
          term_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          classroom_id: string
          created_at?: string
          ends_on?: string | null
          id?: string
          organization_id: string
          role?: string
          school_id: string
          staff_school_assignment_id: string
          starts_on: string
          status?: string
          subject_id: string
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          classroom_id?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          organization_id?: string
          role?: string
          school_id?: string
          staff_school_assignment_id?: string
          starts_on?: string
          status?: string
          subject_id?: string
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_assignments_classroom_fk"
            columns: ["classroom_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "teaching_assignments_staff_fk"
            columns: [
              "staff_school_assignment_id",
              "organization_id",
              "school_id",
            ]
            isOneToOne: false
            referencedRelation: "staff_school_assignments"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "teaching_assignments_subject_fk"
            columns: ["subject_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "teaching_assignments_term_fk"
            columns: ["term_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "teaching_assignments_year_fk"
            columns: ["academic_year_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          code: string
          created_at: string
          ends_on: string
          id: string
          name: string
          organization_id: string
          school_id: string
          sequence: number
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          code: string
          created_at?: string
          ends_on: string
          id?: string
          name: string
          organization_id: string
          school_id: string
          sequence: number
          starts_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          code?: string
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          organization_id?: string
          school_id?: string
          sequence?: number
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_year_fk"
            columns: ["academic_year_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
      timetable_entries: {
        Row: {
          academic_year_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          end_time: string
          id: string
          organization_id: string
          room_label: string | null
          school_id: string
          start_time: string
          status: string
          teaching_assignment_id: string
          term_id: string | null
          updated_at: string
          weekday: number
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          end_time: string
          id?: string
          organization_id: string
          room_label?: string | null
          school_id: string
          start_time: string
          status?: string
          teaching_assignment_id: string
          term_id?: string | null
          updated_at?: string
          weekday: number
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          end_time?: string
          id?: string
          organization_id?: string
          room_label?: string | null
          school_id?: string
          start_time?: string
          status?: string
          teaching_assignment_id?: string
          term_id?: string | null
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "timetable_entries_assignment_fk"
            columns: ["teaching_assignment_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "teaching_assignments"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "timetable_entries_term_fk"
            columns: ["term_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
          {
            foreignKeyName: "timetable_entries_year_fk"
            columns: ["academic_year_id", "organization_id", "school_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "organization_id", "school_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_assessment: {
        Args: { p_assessment_id: string; p_permission_code: string }
        Returns: boolean
      }
      can_access_enrollment: {
        Args: { p_enrollment_id: string; p_permission_code: string }
        Returns: boolean
      }
      can_access_guardian: {
        Args: {
          p_guardian_id: string
          p_organization_id: string
          p_permission_code: string
        }
        Returns: boolean
      }
      can_access_report_card: {
        Args: { p_permission_code: string; p_report_card_id: string }
        Returns: boolean
      }
      can_access_staff: {
        Args: {
          p_organization_id: string
          p_permission_code: string
          p_staff_member_id: string
        }
        Returns: boolean
      }
      can_access_student: {
        Args: {
          p_organization_id: string
          p_permission_code: string
          p_student_id: string
        }
        Returns: boolean
      }
      can_access_teaching_assignment: {
        Args: { p_assignment_id: string; p_permission_code: string }
        Returns: boolean
      }
      can_read_membership: {
        Args: { p_membership_id: string; p_organization_id: string }
        Returns: boolean
      }
      can_read_membership_role: {
        Args: {
          p_membership_id: string
          p_organization_id: string
          p_scope_id: string
          p_scope_type: string
        }
        Returns: boolean
      }
      can_read_role: { Args: { p_role_id: string }; Returns: boolean }
      has_active_membership: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      has_any_active_membership: { Args: never; Returns: boolean }
      has_permission: {
        Args: {
          p_classroom_id?: string
          p_organization_id: string
          p_owner_profile_id?: string
          p_permission_code: string
          p_related_student_id?: string
          p_school_id?: string
        }
        Returns: boolean
      }
      has_permission_in_org: {
        Args: { p_organization_id: string; p_permission_code: string }
        Returns: boolean
      }
      has_staff_scope_permission: {
        Args: {
          p_classroom_id?: string
          p_organization_id: string
          p_permission_code: string
          p_school_id?: string
        }
        Returns: boolean
      }
      is_own_membership: { Args: { p_membership_id: string }; Returns: boolean }
      owns_teaching_assignment: {
        Args: { p_assignment_id: string }
        Returns: boolean
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
