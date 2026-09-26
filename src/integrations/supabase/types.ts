export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admission_application_guardians: {
        Row: {
          application_id: string;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_primary: boolean;
          organization_id: string;
          phone: string | null;
          relationship: string;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          application_id: string;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          is_primary?: boolean;
          organization_id: string;
          phone?: string | null;
          relationship: string;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          application_id?: string;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_primary?: boolean;
          organization_id?: string;
          phone?: string | null;
          relationship?: string;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admission_application_guardians_application_fk";
            columns: ["application_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "admission_applications";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      admission_applications: {
        Row: {
          admission_cycle_id: string;
          applicant_birth_date: string | null;
          applicant_birth_place: string | null;
          applicant_email: string | null;
          applicant_full_name: string;
          applicant_gender: string | null;
          applicant_nisn: string | null;
          applicant_phone: string | null;
          applicant_preferred_name: string | null;
          application_number: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by_profile_id: string | null;
          decision_reason: string | null;
          id: string;
          organization_id: string;
          row_version: number;
          school_id: string;
          status: string;
          submission_note: string | null;
          submitted_at: string | null;
          target_academic_year_id: string;
          target_grade_level_id: string;
          updated_at: string;
        };
        Insert: {
          admission_cycle_id: string;
          applicant_birth_date?: string | null;
          applicant_birth_place?: string | null;
          applicant_email?: string | null;
          applicant_full_name: string;
          applicant_gender?: string | null;
          applicant_nisn?: string | null;
          applicant_phone?: string | null;
          applicant_preferred_name?: string | null;
          application_number?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by_profile_id?: string | null;
          decision_reason?: string | null;
          id?: string;
          organization_id: string;
          row_version?: number;
          school_id: string;
          status?: string;
          submission_note?: string | null;
          submitted_at?: string | null;
          target_academic_year_id: string;
          target_grade_level_id: string;
          updated_at?: string;
        };
        Update: {
          admission_cycle_id?: string;
          applicant_birth_date?: string | null;
          applicant_birth_place?: string | null;
          applicant_email?: string | null;
          applicant_full_name?: string;
          applicant_gender?: string | null;
          applicant_nisn?: string | null;
          applicant_phone?: string | null;
          applicant_preferred_name?: string | null;
          application_number?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by_profile_id?: string | null;
          decision_reason?: string | null;
          id?: string;
          organization_id?: string;
          row_version?: number;
          school_id?: string;
          status?: string;
          submission_note?: string | null;
          submitted_at?: string | null;
          target_academic_year_id?: string;
          target_grade_level_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admission_applications_cycle_scope_fk";
            columns: ["admission_cycle_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "admission_cycles";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "admission_applications_cycle_year_fk";
            columns: [
              "admission_cycle_id",
              "organization_id",
              "school_id",
              "target_academic_year_id",
            ];
            isOneToOne: false;
            referencedRelation: "admission_cycles";
            referencedColumns: ["id", "organization_id", "school_id", "academic_year_id"];
          },
          {
            foreignKeyName: "admission_applications_decided_by_profile_id_fkey";
            columns: ["decided_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admission_applications_grade_scope_fk";
            columns: ["target_grade_level_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "admission_applications_year_scope_fk";
            columns: ["target_academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      admission_command_requests: {
        Row: {
          actor_kind: string;
          actor_profile_id: string | null;
          command: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          request_id: string;
          result_payload: Json | null;
          school_id: string;
          semantic_fingerprint: string;
          started_at: string;
          status: string;
        };
        Insert: {
          actor_kind: string;
          actor_profile_id?: string | null;
          command: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          request_id: string;
          result_payload?: Json | null;
          school_id: string;
          semantic_fingerprint: string;
          started_at?: string;
          status?: string;
        };
        Update: {
          actor_kind?: string;
          actor_profile_id?: string | null;
          command?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          request_id?: string;
          result_payload?: Json | null;
          school_id?: string;
          semantic_fingerprint?: string;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admission_command_requests_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admission_command_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admission_command_requests_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      admission_consents: {
        Row: {
          application_id: string;
          consent_source: string;
          consented_at: string;
          created_at: string;
          id: string;
          organization_id: string;
          policy_version: string;
          school_id: string;
        };
        Insert: {
          application_id: string;
          consent_source: string;
          consented_at: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          policy_version: string;
          school_id: string;
        };
        Update: {
          application_id?: string;
          consent_source?: string;
          consented_at?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          policy_version?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admission_consents_application_fk";
            columns: ["application_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "admission_applications";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      admission_conversions: {
        Row: {
          application_id: string;
          converted_at: string;
          converted_by_profile_id: string;
          id: string;
          organization_id: string;
          request_id: string;
          school_id: string;
          student_enrollment_id: string;
          student_id: string;
        };
        Insert: {
          application_id: string;
          converted_at?: string;
          converted_by_profile_id: string;
          id?: string;
          organization_id: string;
          request_id: string;
          school_id: string;
          student_enrollment_id: string;
          student_id: string;
        };
        Update: {
          application_id?: string;
          converted_at?: string;
          converted_by_profile_id?: string;
          id?: string;
          organization_id?: string;
          request_id?: string;
          school_id?: string;
          student_enrollment_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admission_conversions_application_fk";
            columns: ["application_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "admission_applications";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "admission_conversions_converted_by_profile_id_fkey";
            columns: ["converted_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admission_conversions_enrollment_fk";
            columns: ["student_enrollment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "student_enrollments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "admission_conversions_student_fk";
            columns: ["student_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      admission_cycles: {
        Row: {
          academic_year_id: string;
          closes_at: string | null;
          created_at: string;
          created_by_profile_id: string | null;
          id: string;
          name: string;
          opens_at: string | null;
          organization_id: string;
          row_version: number;
          school_id: string;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          closes_at?: string | null;
          created_at?: string;
          created_by_profile_id?: string | null;
          id?: string;
          name: string;
          opens_at?: string | null;
          organization_id: string;
          row_version?: number;
          school_id: string;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          closes_at?: string | null;
          created_at?: string;
          created_by_profile_id?: string | null;
          id?: string;
          name?: string;
          opens_at?: string | null;
          organization_id?: string;
          row_version?: number;
          school_id?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admission_cycles_created_by_profile_id_fkey";
            columns: ["created_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admission_cycles_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "admission_cycles_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      admission_stage_history: {
        Row: {
          actor_kind: string;
          actor_profile_id: string | null;
          application_id: string;
          from_status: string | null;
          id: string;
          occurred_at: string;
          organization_id: string;
          reason: string | null;
          request_id: string | null;
          school_id: string;
          to_status: string;
        };
        Insert: {
          actor_kind: string;
          actor_profile_id?: string | null;
          application_id: string;
          from_status?: string | null;
          id?: string;
          occurred_at?: string;
          organization_id: string;
          reason?: string | null;
          request_id?: string | null;
          school_id: string;
          to_status: string;
        };
        Update: {
          actor_kind?: string;
          actor_profile_id?: string | null;
          application_id?: string;
          from_status?: string | null;
          id?: string;
          occurred_at?: string;
          organization_id?: string;
          reason?: string | null;
          request_id?: string | null;
          school_id?: string;
          to_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admission_stage_history_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admission_stage_history_application_fk";
            columns: ["application_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "admission_applications";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      academic_calendar_events: {
        Row: {
          academic_year_id: string;
          affects_instruction: boolean;
          created_at: string;
          ends_at: string | null;
          ends_on: string | null;
          event_type: string;
          id: string;
          organization_id: string;
          school_id: string;
          starts_at: string | null;
          starts_on: string | null;
          term_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          affects_instruction?: boolean;
          created_at?: string;
          ends_at?: string | null;
          ends_on?: string | null;
          event_type: string;
          id?: string;
          organization_id: string;
          school_id: string;
          starts_at?: string | null;
          starts_on?: string | null;
          term_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          affects_instruction?: boolean;
          created_at?: string;
          ends_at?: string | null;
          ends_on?: string | null;
          event_type?: string;
          id?: string;
          organization_id?: string;
          school_id?: string;
          starts_at?: string | null;
          starts_on?: string | null;
          term_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_term_fk";
            columns: ["term_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "calendar_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      academic_years: {
        Row: {
          code: string;
          created_at: string;
          closed_at: string | null;
          closed_by_profile_id: string | null;
          ends_on: string;
          id: string;
          is_current: boolean;
          name: string;
          organization_id: string;
          reopened_at: string | null;
          reopened_by_profile_id: string | null;
          school_id: string;
          starts_on: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          closed_at?: string | null;
          closed_by_profile_id?: string | null;
          ends_on: string;
          id?: string;
          is_current?: boolean;
          name: string;
          organization_id: string;
          reopened_at?: string | null;
          reopened_by_profile_id?: string | null;
          school_id: string;
          starts_on: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          closed_at?: string | null;
          closed_by_profile_id?: string | null;
          ends_on?: string;
          id?: string;
          is_current?: boolean;
          name?: string;
          organization_id?: string;
          reopened_at?: string | null;
          reopened_by_profile_id?: string | null;
          school_id?: string;
          starts_on?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academic_years_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      academic_period_command_requests: {
        Row: {
          actor_profile_id: string;
          command_name: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          payload_fingerprint: string;
          request_id: string;
          resource_id: string;
          resource_type: string;
          result_payload: Json | null;
          school_id: string;
          status: string;
        };
        Insert: {
          actor_profile_id: string;
          command_name: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          payload_fingerprint: string;
          request_id: string;
          resource_id: string;
          resource_type: string;
          result_payload?: Json | null;
          school_id: string;
          status?: string;
        };
        Update: {
          actor_profile_id?: string;
          command_name?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          payload_fingerprint?: string;
          request_id?: string;
          resource_id?: string;
          resource_type?: string;
          result_payload?: Json | null;
          school_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academic_period_command_requests_scope_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "academic_period_command_requests_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      assessment_learning_objectives: {
        Row: {
          assessment_id: string;
          created_at: string;
          learning_objective_id: string;
        };
        Insert: {
          assessment_id: string;
          created_at?: string;
          learning_objective_id: string;
        };
        Update: {
          assessment_id?: string;
          created_at?: string;
          learning_objective_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_learning_objectives_assessment_id_fkey";
            columns: ["assessment_id"];
            isOneToOne: false;
            referencedRelation: "assessments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_learning_objectives_learning_objective_id_fkey";
            columns: ["learning_objective_id"];
            isOneToOne: false;
            referencedRelation: "learning_objectives";
            referencedColumns: ["id"];
          },
        ];
      };
      assessment_types: {
        Row: {
          code: string;
          created_at: string;
          default_weight: number | null;
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          default_weight?: number | null;
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id: string;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          default_weight?: number | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_types_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      assessments: {
        Row: {
          academic_year_id: string;
          assessment_date: string;
          assessment_type_id: string;
          created_at: string;
          created_by_profile_id: string | null;
          description: string | null;
          id: string;
          max_score: number;
          min_score: number;
          organization_id: string;
          school_id: string;
          status: string;
          teaching_assignment_id: string;
          term_id: string;
          title: string;
          updated_at: string;
          version: number;
          weight: number | null;
        };
        Insert: {
          academic_year_id: string;
          assessment_date: string;
          assessment_type_id: string;
          created_at?: string;
          created_by_profile_id?: string | null;
          description?: string | null;
          id?: string;
          max_score?: number;
          min_score?: number;
          organization_id: string;
          school_id: string;
          status?: string;
          teaching_assignment_id: string;
          term_id: string;
          title: string;
          updated_at?: string;
          version?: number;
          weight?: number | null;
        };
        Update: {
          academic_year_id?: string;
          assessment_date?: string;
          assessment_type_id?: string;
          created_at?: string;
          created_by_profile_id?: string | null;
          description?: string | null;
          id?: string;
          max_score?: number;
          min_score?: number;
          organization_id?: string;
          school_id?: string;
          status?: string;
          teaching_assignment_id?: string;
          term_id?: string;
          title?: string;
          updated_at?: string;
          version?: number;
          weight?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "assessments_created_by_profile_id_fkey";
            columns: ["created_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessments_teaching_fk";
            columns: ["teaching_assignment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "teaching_assignments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "assessments_term_fk";
            columns: ["term_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "assessments_type_fk";
            columns: ["assessment_type_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "assessment_types";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "assessments_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      assessment_command_requests: {
        Row: {
          actor_profile_id: string;
          command_name: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          payload_fingerprint: string;
          request_id: string;
          resource_id: string | null;
          resource_type: string | null;
          result_payload: Json | null;
          school_id: string;
          status: string;
        };
        Insert: {
          actor_profile_id: string;
          command_name: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          payload_fingerprint: string;
          request_id: string;
          resource_id?: string | null;
          resource_type?: string | null;
          result_payload?: Json | null;
          school_id: string;
          status?: string;
        };
        Update: {
          actor_profile_id?: string;
          command_name?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          payload_fingerprint?: string;
          request_id?: string;
          resource_id?: string | null;
          resource_type?: string | null;
          result_payload?: Json | null;
          school_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_command_requests_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_command_requests_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      attendance_command_requests: {
        Row: {
          actor_profile_id: string;
          command_kind: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          request_fingerprint: string;
          request_id: string;
          result: Json | null;
          retained_until: string;
          school_id: string;
          target_id: string | null;
        };
        Insert: {
          actor_profile_id: string;
          command_kind: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          request_fingerprint: string;
          request_id: string;
          result?: Json | null;
          retained_until?: string;
          school_id: string;
          target_id?: string | null;
        };
        Update: {
          actor_profile_id?: string;
          command_kind?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          request_fingerprint?: string;
          request_id?: string;
          result?: Json | null;
          retained_until?: string;
          school_id?: string;
          target_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_command_requests_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_command_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      attendance_session_roster_members: {
        Row: {
          attendance_session_id: string;
          created_by_profile_id: string | null;
          id: string;
          organization_id: string;
          school_id: string;
          snapshot_source: string;
          snapshotted_at: string;
          student_enrollment_id: string;
          student_id: string;
        };
        Insert: {
          attendance_session_id: string;
          created_by_profile_id?: string | null;
          id?: string;
          organization_id: string;
          school_id: string;
          snapshot_source: string;
          snapshotted_at?: string;
          student_enrollment_id: string;
          student_id: string;
        };
        Update: {
          attendance_session_id?: string;
          created_by_profile_id?: string | null;
          id?: string;
          organization_id?: string;
          school_id?: string;
          snapshot_source?: string;
          snapshotted_at?: string;
          student_enrollment_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_roster_enrollment_student_fk";
            columns: ["student_enrollment_id", "student_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "student_enrollments";
            referencedColumns: ["id", "student_id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "attendance_roster_session_fk";
            columns: ["attendance_session_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "attendance_sessions";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "attendance_roster_student_fk";
            columns: ["student_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "attendance_session_roster_members_created_by_profile_id_fkey";
            columns: ["created_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_sessions: {
        Row: {
          academic_year_id: string;
          classroom_id: string;
          created_at: string;
          ends_at: string | null;
          id: string;
          locked_at: string | null;
          manual_reason: string | null;
          organization_id: string;
          school_id: string;
          session_date: string;
          starts_at: string | null;
          status: string;
          submitted_at: string | null;
          submitted_by_profile_id: string | null;
          teaching_assignment_id: string | null;
          term_id: string;
          timetable_entry_id: string | null;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          classroom_id: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          locked_at?: string | null;
          manual_reason?: string | null;
          organization_id: string;
          school_id: string;
          session_date: string;
          starts_at?: string | null;
          status?: string;
          submitted_at?: string | null;
          submitted_by_profile_id?: string | null;
          teaching_assignment_id?: string | null;
          term_id: string;
          timetable_entry_id?: string | null;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          classroom_id?: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          locked_at?: string | null;
          manual_reason?: string | null;
          organization_id?: string;
          school_id?: string;
          session_date?: string;
          starts_at?: string | null;
          status?: string;
          submitted_at?: string | null;
          submitted_by_profile_id?: string | null;
          teaching_assignment_id?: string | null;
          term_id?: string;
          timetable_entry_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_assignment_fk";
            columns: ["teaching_assignment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "teaching_assignments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "attendance_sessions_classroom_fk";
            columns: ["classroom_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "attendance_sessions_submitted_by_profile_id_fkey";
            columns: ["submitted_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_sessions_term_fk";
            columns: ["term_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "attendance_sessions_timetable_fk";
            columns: ["timetable_entry_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "timetable_entries";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "attendance_sessions_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_profile_id: string | null;
          actor_type: string;
          after_data: Json | null;
          before_data: Json | null;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip_address: unknown;
          metadata: Json | null;
          occurred_at: string;
          organization_id: string | null;
          school_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_profile_id?: string | null;
          actor_type?: string;
          after_data?: Json | null;
          before_data?: Json | null;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json | null;
          occurred_at?: string;
          organization_id?: string | null;
          school_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_profile_id?: string | null;
          actor_type?: string;
          after_data?: Json | null;
          before_data?: Json | null;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json | null;
          occurred_at?: string;
          organization_id?: string | null;
          school_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_org_fk";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      class_enrollments: {
        Row: {
          classroom_id: string;
          created_at: string;
          ends_on: string | null;
          id: string;
          is_primary: boolean;
          organization_id: string;
          school_id: string;
          starts_on: string;
          status: string;
          student_enrollment_id: string;
          updated_at: string;
        };
        Insert: {
          classroom_id: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          is_primary?: boolean;
          organization_id: string;
          school_id: string;
          starts_on: string;
          status?: string;
          student_enrollment_id: string;
          updated_at?: string;
        };
        Update: {
          classroom_id?: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          is_primary?: boolean;
          organization_id?: string;
          school_id?: string;
          starts_on?: string;
          status?: string;
          student_enrollment_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_enrollments_classroom_fk";
            columns: ["classroom_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "class_enrollments_enrollment_fk";
            columns: ["student_enrollment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "student_enrollments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      classrooms: {
        Row: {
          academic_year_id: string;
          capacity: number | null;
          code: string;
          created_at: string;
          grade_level_id: string;
          homeroom_staff_school_assignment_id: string | null;
          id: string;
          name: string;
          organization_id: string;
          school_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          capacity?: number | null;
          code: string;
          created_at?: string;
          grade_level_id: string;
          homeroom_staff_school_assignment_id?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          school_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          capacity?: number | null;
          code?: string;
          created_at?: string;
          grade_level_id?: string;
          homeroom_staff_school_assignment_id?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          school_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classrooms_grade_fk";
            columns: ["grade_level_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "classrooms_homeroom_assignment_fk";
            columns: ["homeroom_staff_school_assignment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "staff_school_assignments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "classrooms_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      curricula: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          school_id: string;
          status: string;
          updated_at: string;
          version: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          school_id: string;
          status?: string;
          updated_at?: string;
          version?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          school_id?: string;
          status?: string;
          updated_at?: string;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "curricula_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      file_assets: {
        Row: {
          bucket: string;
          created_at: string;
          id: string;
          mime_type: string | null;
          object_path: string;
          organization_id: string;
          original_filename: string;
          school_id: string | null;
          size_bytes: number | null;
          status: string;
          storage_provider: string;
          updated_at: string;
          uploaded_by_profile_id: string | null;
        };
        Insert: {
          bucket: string;
          created_at?: string;
          id?: string;
          mime_type?: string | null;
          object_path: string;
          organization_id: string;
          original_filename: string;
          school_id?: string | null;
          size_bytes?: number | null;
          status?: string;
          storage_provider?: string;
          updated_at?: string;
          uploaded_by_profile_id?: string | null;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          id?: string;
          mime_type?: string | null;
          object_path?: string;
          organization_id?: string;
          original_filename?: string;
          school_id?: string | null;
          size_bytes?: number | null;
          status?: string;
          storage_provider?: string;
          updated_at?: string;
          uploaded_by_profile_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "file_assets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "file_assets_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "file_assets_uploaded_by_profile_id_fkey";
            columns: ["uploaded_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      generated_documents: {
        Row: {
          checksum: string | null;
          created_at: string;
          document_type: string;
          entity_id: string;
          entity_type: string;
          file_asset_id: string;
          generated_at: string;
          generated_by_profile_id: string | null;
          id: string;
          organization_id: string;
          school_id: string;
        };
        Insert: {
          checksum?: string | null;
          created_at?: string;
          document_type: string;
          entity_id: string;
          entity_type: string;
          file_asset_id: string;
          generated_at?: string;
          generated_by_profile_id?: string | null;
          id?: string;
          organization_id: string;
          school_id: string;
        };
        Update: {
          checksum?: string | null;
          created_at?: string;
          document_type?: string;
          entity_id?: string;
          entity_type?: string;
          file_asset_id?: string;
          generated_at?: string;
          generated_by_profile_id?: string | null;
          id?: string;
          organization_id?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generated_documents_file_asset_id_fkey";
            columns: ["file_asset_id"];
            isOneToOne: false;
            referencedRelation: "file_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generated_documents_generated_by_profile_id_fkey";
            columns: ["generated_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generated_documents_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      grade_levels: {
        Row: {
          code: string;
          created_at: string;
          education_stage: string;
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string;
          school_id: string;
          sequence: number;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          education_stage: string;
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id: string;
          school_id: string;
          sequence: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          education_stage?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
          school_id?: string;
          sequence?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grade_levels_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      guardians: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          occupation: string | null;
          organization_id: string;
          phone: string | null;
          profile_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          occupation?: string | null;
          organization_id: string;
          phone?: string | null;
          profile_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          occupation?: string | null;
          organization_id?: string;
          phone?: string | null;
          profile_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guardians_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guardians_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by_profile_id: string | null;
          invited_role_id: string;
          invited_scope_id: string | null;
          invited_scope_type: string;
          organization_id: string;
          revoked_at: string | null;
          school_id: string | null;
          target_student_id: string | null;
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by_profile_id?: string | null;
          invited_role_id: string;
          invited_scope_id?: string | null;
          invited_scope_type: string;
          organization_id: string;
          revoked_at?: string | null;
          school_id?: string | null;
          target_student_id?: string | null;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by_profile_id?: string | null;
          invited_role_id?: string;
          invited_scope_id?: string | null;
          invited_scope_type?: string;
          organization_id?: string;
          revoked_at?: string | null;
          school_id?: string | null;
          target_student_id?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_profile_id_fkey";
            columns: ["invited_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_invited_role_id_fkey";
            columns: ["invited_role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "invitations_target_student_fk";
            columns: ["target_student_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      learning_objectives: {
        Row: {
          code: string;
          created_at: string;
          description: string;
          id: string;
          learning_outcome_id: string;
          organization_id: string;
          school_id: string;
          sequence: number;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description: string;
          id?: string;
          learning_outcome_id: string;
          organization_id: string;
          school_id: string;
          sequence?: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string;
          id?: string;
          learning_outcome_id?: string;
          organization_id?: string;
          school_id?: string;
          sequence?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "learning_objectives_outcome_fk";
            columns: ["learning_outcome_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "learning_outcomes";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      learning_outcomes: {
        Row: {
          code: string;
          created_at: string;
          curriculum_id: string;
          description: string;
          grade_level_id: string | null;
          id: string;
          organization_id: string;
          school_id: string;
          sequence: number;
          subject_id: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          curriculum_id: string;
          description: string;
          grade_level_id?: string | null;
          id?: string;
          organization_id: string;
          school_id: string;
          sequence?: number;
          subject_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          curriculum_id?: string;
          description?: string;
          grade_level_id?: string | null;
          id?: string;
          organization_id?: string;
          school_id?: string;
          sequence?: number;
          subject_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "learning_outcomes_curriculum_fk";
            columns: ["curriculum_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "curricula";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "learning_outcomes_grade_fk";
            columns: ["grade_level_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "learning_outcomes_subject_fk";
            columns: ["subject_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      membership_roles: {
        Row: {
          created_at: string;
          ends_at: string | null;
          id: string;
          membership_id: string;
          organization_id: string;
          role_id: string;
          scope_id: string | null;
          scope_type: string;
          starts_at: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          membership_id: string;
          organization_id: string;
          role_id: string;
          scope_id?: string | null;
          scope_type: string;
          starts_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          membership_id?: string;
          organization_id?: string;
          role_id?: string;
          scope_id?: string | null;
          scope_type?: string;
          starts_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membership_roles_membership_fk";
            columns: ["membership_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "membership_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      membership_school_access: {
        Row: {
          created_at: string;
          id: string;
          membership_id: string;
          organization_id: string;
          school_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          membership_id: string;
          organization_id: string;
          school_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          membership_id?: string;
          organization_id?: string;
          school_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "msa_membership_fk";
            columns: ["membership_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "msa_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      notification_recipients: {
        Row: {
          created_at: string;
          id: string;
          notification_id: string;
          organization_id: string;
          read_at: string | null;
          recipient_profile_id: string;
          school_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notification_id: string;
          organization_id: string;
          read_at?: string | null;
          recipient_profile_id: string;
          school_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notification_id?: string;
          organization_id?: string;
          read_at?: string | null;
          recipient_profile_id?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_recipients_notification_fk";
            columns: ["notification_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "notification_recipients_recipient_profile_id_fkey";
            columns: ["recipient_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          created_by_profile_id: string | null;
          dedupe_key: string;
          deep_link: string | null;
          expires_at: string | null;
          id: string;
          notification_type: string;
          organization_id: string;
          preview: string | null;
          school_id: string;
          source_permission_request_id: string | null;
          title: string;
        };
        Insert: {
          created_at?: string;
          created_by_profile_id?: string | null;
          dedupe_key: string;
          deep_link?: string | null;
          expires_at?: string | null;
          id?: string;
          notification_type: string;
          organization_id: string;
          preview?: string | null;
          school_id: string;
          source_permission_request_id?: string | null;
          title: string;
        };
        Update: {
          created_at?: string;
          created_by_profile_id?: string | null;
          dedupe_key?: string;
          deep_link?: string | null;
          expires_at?: string | null;
          id?: string;
          notification_type?: string;
          organization_id?: string;
          preview?: string | null;
          school_id?: string;
          source_permission_request_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_profile_id_fkey";
            columns: ["created_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_request_fk";
            columns: ["source_permission_request_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "parent_permission_requests";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "notifications_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      organization_memberships: {
        Row: {
          created_at: string;
          ended_at: string | null;
          id: string;
          joined_at: string | null;
          organization_id: string;
          profile_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          joined_at?: string | null;
          organization_id: string;
          profile_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          joined_at?: string | null;
          organization_id?: string;
          profile_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          legal_name: string | null;
          locale: string;
          name: string;
          status: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          legal_name?: string | null;
          locale?: string;
          name: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          legal_name?: string | null;
          locale?: string;
          name?: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      parent_permission_decision_history: {
        Row: {
          actor_guardian_id: string;
          actor_profile_id: string;
          changed_at: string;
          decision_id: string;
          id: string;
          new_decision: string;
          old_decision: string | null;
          operation: string;
          organization_id: string;
          request_id: string;
          request_recipient_id: string;
          school_id: string;
          student_id: string;
        };
        Insert: {
          actor_guardian_id: string;
          actor_profile_id: string;
          changed_at?: string;
          decision_id: string;
          id?: string;
          new_decision: string;
          old_decision?: string | null;
          operation?: string;
          organization_id: string;
          request_id: string;
          request_recipient_id: string;
          school_id: string;
          student_id: string;
        };
        Update: {
          actor_guardian_id?: string;
          actor_profile_id?: string;
          changed_at?: string;
          decision_id?: string;
          id?: string;
          new_decision?: string;
          old_decision?: string | null;
          operation?: string;
          organization_id?: string;
          request_id?: string;
          request_recipient_id?: string;
          school_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parent_permission_decision_history_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_permission_history_decision_fk";
            columns: [
              "decision_id",
              "organization_id",
              "school_id",
              "request_id",
              "request_recipient_id",
              "student_id",
            ];
            isOneToOne: false;
            referencedRelation: "parent_permission_decisions";
            referencedColumns: [
              "id",
              "organization_id",
              "school_id",
              "request_id",
              "request_recipient_id",
              "student_id",
            ];
          },
          {
            foreignKeyName: "parent_permission_history_guardian_fk";
            columns: ["actor_guardian_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      parent_permission_decisions: {
        Row: {
          decided_at: string;
          decided_by_guardian_id: string;
          decided_by_profile_id: string;
          decision: string;
          id: string;
          organization_id: string;
          request_id: string;
          request_recipient_id: string;
          school_id: string;
          student_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          decided_at?: string;
          decided_by_guardian_id: string;
          decided_by_profile_id: string;
          decision: string;
          id?: string;
          organization_id: string;
          request_id: string;
          request_recipient_id: string;
          school_id: string;
          student_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          decided_at?: string;
          decided_by_guardian_id?: string;
          decided_by_profile_id?: string;
          decision?: string;
          id?: string;
          organization_id?: string;
          request_id?: string;
          request_recipient_id?: string;
          school_id?: string;
          student_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "parent_permission_decisions_decided_by_profile_id_fkey";
            columns: ["decided_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_permission_decisions_guardian_fk";
            columns: ["decided_by_guardian_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "parent_permission_decisions_guardian_profile_fk";
            columns: ["decided_by_guardian_id", "decided_by_profile_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id", "profile_id", "organization_id"];
          },
          {
            foreignKeyName: "parent_permission_decisions_recipient_fk";
            columns: [
              "request_recipient_id",
              "organization_id",
              "school_id",
              "request_id",
              "student_id",
            ];
            isOneToOne: false;
            referencedRelation: "parent_permission_request_recipients";
            referencedColumns: ["id", "organization_id", "school_id", "request_id", "student_id"];
          },
        ];
      };
      parent_permission_request_draft_targets: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          request_id: string;
          school_id: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          request_id: string;
          school_id: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          request_id?: string;
          school_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "b12_draft_targets_request_fk";
            columns: ["request_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "parent_permission_requests";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "b12_draft_targets_student_fk";
            columns: ["student_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      parent_permission_request_recipients: {
        Row: {
          class_enrollment_id: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          request_id: string;
          school_id: string;
          snapshot_at: string;
          source_type: string;
          student_enrollment_id: string;
          student_id: string;
        };
        Insert: {
          class_enrollment_id?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          request_id: string;
          school_id: string;
          snapshot_at?: string;
          source_type: string;
          student_enrollment_id: string;
          student_id: string;
        };
        Update: {
          class_enrollment_id?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          request_id?: string;
          school_id?: string;
          snapshot_at?: string;
          source_type?: string;
          student_enrollment_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parent_permission_recipients_class_enrollment_fk";
            columns: ["class_enrollment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "class_enrollments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "parent_permission_recipients_enrollment_fk";
            columns: ["student_enrollment_id", "student_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "student_enrollments";
            referencedColumns: ["id", "student_id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "parent_permission_recipients_request_fk";
            columns: ["request_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "parent_permission_requests";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "parent_permission_recipients_student_fk";
            columns: ["student_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      parent_permission_requests: {
        Row: {
          cancelled_at: string | null;
          cancelled_by_profile_id: string | null;
          closed_at: string | null;
          closed_by_profile_id: string | null;
          created_at: string;
          created_by_profile_id: string;
          description: string | null;
          due_at: string | null;
          id: string;
          organization_id: string;
          published_at: string | null;
          published_by_profile_id: string | null;
          request_type: string;
          school_id: string;
          status: string;
          target_classroom_id: string | null;
          target_mode: string;
          title: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          cancelled_at?: string | null;
          cancelled_by_profile_id?: string | null;
          closed_at?: string | null;
          closed_by_profile_id?: string | null;
          created_at?: string;
          created_by_profile_id: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          organization_id: string;
          published_at?: string | null;
          published_by_profile_id?: string | null;
          request_type: string;
          school_id: string;
          status?: string;
          target_classroom_id?: string | null;
          target_mode: string;
          title: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          cancelled_at?: string | null;
          cancelled_by_profile_id?: string | null;
          closed_at?: string | null;
          closed_by_profile_id?: string | null;
          created_at?: string;
          created_by_profile_id?: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          organization_id?: string;
          published_at?: string | null;
          published_by_profile_id?: string | null;
          request_type?: string;
          school_id?: string;
          status?: string;
          target_classroom_id?: string | null;
          target_mode?: string;
          title?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "parent_permission_requests_cancelled_by_profile_id_fkey";
            columns: ["cancelled_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_permission_requests_classroom_fk";
            columns: ["target_classroom_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "parent_permission_requests_closed_by_profile_id_fkey";
            columns: ["closed_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_permission_requests_created_by_profile_id_fkey";
            columns: ["created_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_permission_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_permission_requests_published_by_profile_id_fkey";
            columns: ["published_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_permission_requests_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      permission_request_command_requests: {
        Row: {
          actor_profile_id: string;
          command_kind: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          request_fingerprint: string;
          request_id: string | null;
          request_key: string;
          result: Json | null;
          retained_until: string;
          school_id: string;
          target_id: string | null;
        };
        Insert: {
          actor_profile_id: string;
          command_kind: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          request_fingerprint: string;
          request_id?: string | null;
          request_key: string;
          result?: Json | null;
          retained_until?: string;
          school_id: string;
          target_id?: string | null;
        };
        Update: {
          actor_profile_id?: string;
          command_kind?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          request_fingerprint?: string;
          request_id?: string | null;
          request_key?: string;
          result?: Json | null;
          retained_until?: string;
          school_id?: string;
          target_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "permission_request_command_requests_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "permission_request_commands_request_fk";
            columns: ["request_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "parent_permission_requests";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      permissions: {
        Row: {
          action: string;
          code: string;
          created_at: string;
          description: string | null;
          domain: string;
          id: string;
        };
        Insert: {
          action: string;
          code: string;
          created_at?: string;
          description?: string | null;
          domain: string;
          id?: string;
        };
        Update: {
          action?: string;
          code?: string;
          created_at?: string;
          description?: string | null;
          domain?: string;
          id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_file_id: string | null;
          created_at: string;
          full_name: string;
          id: string;
          phone: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          avatar_file_id?: string | null;
          created_at?: string;
          full_name: string;
          id: string;
          phone?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          avatar_file_id?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_avatar_file_fk";
            columns: ["avatar_file_id"];
            isOneToOne: false;
            referencedRelation: "file_assets";
            referencedColumns: ["id"];
          },
        ];
      };
      progression_batches: {
        Row: {
          applied_at: string | null;
          applied_by_profile_id: string | null;
          approved_at: string | null;
          approved_by_profile_id: string | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by_profile_id: string | null;
          created_at: string;
          created_by_profile_id: string;
          id: string;
          organization_id: string;
          readiness_snapshot: Json;
          rejected_at: string | null;
          rejected_by_profile_id: string | null;
          rejection_reason: string | null;
          school_id: string;
          source_academic_year_id: string;
          status: string;
          submitted_at: string | null;
          submitted_by_profile_id: string | null;
          target_academic_year_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          applied_at?: string | null;
          applied_by_profile_id?: string | null;
          approved_at?: string | null;
          approved_by_profile_id?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by_profile_id?: string | null;
          created_at?: string;
          created_by_profile_id: string;
          id?: string;
          organization_id: string;
          readiness_snapshot?: Json;
          rejected_at?: string | null;
          rejected_by_profile_id?: string | null;
          rejection_reason?: string | null;
          school_id: string;
          source_academic_year_id: string;
          status?: string;
          submitted_at?: string | null;
          submitted_by_profile_id?: string | null;
          target_academic_year_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          applied_at?: string | null;
          applied_by_profile_id?: string | null;
          approved_at?: string | null;
          approved_by_profile_id?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by_profile_id?: string | null;
          created_at?: string;
          created_by_profile_id?: string;
          id?: string;
          organization_id?: string;
          readiness_snapshot?: Json;
          rejected_at?: string | null;
          rejected_by_profile_id?: string | null;
          rejection_reason?: string | null;
          school_id?: string;
          source_academic_year_id?: string;
          status?: string;
          submitted_at?: string | null;
          submitted_by_profile_id?: string | null;
          target_academic_year_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "progression_batches_applied_by_profile_id_fkey";
            columns: ["applied_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "progression_batches_approved_by_profile_id_fkey";
            columns: ["approved_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "progression_batches_cancelled_by_profile_id_fkey";
            columns: ["cancelled_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "progression_batches_created_by_profile_id_fkey";
            columns: ["created_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "progression_batches_rejected_by_profile_id_fkey";
            columns: ["rejected_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "progression_batches_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "progression_batches_source_year_fk";
            columns: ["source_academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "progression_batches_submitted_by_profile_id_fkey";
            columns: ["submitted_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "progression_batches_target_year_fk";
            columns: ["target_academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      progression_command_requests: {
        Row: {
          actor_profile_id: string;
          command_name: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          payload_fingerprint: string;
          request_id: string;
          resource_id: string | null;
          resource_type: string | null;
          result_payload: Json | null;
          school_id: string;
          status: string;
        };
        Insert: {
          actor_profile_id: string;
          command_name: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          payload_fingerprint: string;
          request_id: string;
          resource_id?: string | null;
          resource_type?: string | null;
          result_payload?: Json | null;
          school_id: string;
          status?: string;
        };
        Update: {
          actor_profile_id?: string;
          command_name?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          payload_fingerprint?: string;
          request_id?: string;
          resource_id?: string | null;
          resource_type?: string | null;
          result_payload?: Json | null;
          school_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "progression_command_requests_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      progression_decisions: {
        Row: {
          batch_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by_profile_id: string | null;
          exception_reason: string | null;
          id: string;
          operator_note: string | null;
          organization_id: string;
          outcome: string | null;
          readiness_snapshot: Json;
          school_id: string;
          source_student_enrollment_id: string;
          student_id: string;
          target_classroom_id: string | null;
          target_grade_level_id: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by_profile_id?: string | null;
          exception_reason?: string | null;
          id?: string;
          operator_note?: string | null;
          organization_id: string;
          outcome?: string | null;
          readiness_snapshot?: Json;
          school_id: string;
          source_student_enrollment_id: string;
          student_id: string;
          target_classroom_id?: string | null;
          target_grade_level_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by_profile_id?: string | null;
          exception_reason?: string | null;
          id?: string;
          operator_note?: string | null;
          organization_id?: string;
          outcome?: string | null;
          readiness_snapshot?: Json;
          school_id?: string;
          source_student_enrollment_id?: string;
          student_id?: string;
          target_classroom_id?: string | null;
          target_grade_level_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "progression_decisions_batch_fk";
            columns: ["batch_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "progression_batches";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "progression_decisions_decided_by_profile_id_fkey";
            columns: ["decided_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "progression_decisions_source_enrollment_fk";
            columns: ["source_student_enrollment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "student_enrollments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "progression_decisions_student_fk";
            columns: ["student_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "progression_decisions_target_classroom_fk";
            columns: ["target_classroom_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "progression_decisions_target_grade_fk";
            columns: ["target_grade_level_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      report_card_command_requests: {
        Row: {
          actor_profile_id: string;
          command_name: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          payload_fingerprint: string;
          report_card_id: string | null;
          request_id: string;
          resource_id: string | null;
          resource_type: string | null;
          result_payload: Json;
          school_id: string;
          status: string;
        };
        Insert: {
          actor_profile_id: string;
          command_name: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          payload_fingerprint: string;
          report_card_id?: string | null;
          request_id: string;
          resource_id?: string | null;
          resource_type?: string | null;
          result_payload?: Json;
          school_id: string;
          status?: string;
        };
        Update: {
          actor_profile_id?: string;
          command_name?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          payload_fingerprint?: string;
          report_card_id?: string | null;
          request_id?: string;
          resource_id?: string | null;
          resource_type?: string | null;
          result_payload?: Json;
          school_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_card_command_request_report_fk";
            columns: ["report_card_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "report_cards";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "report_card_command_request_scope_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "report_card_command_requests_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      report_card_narratives: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          organization_id: string;
          report_card_id: string;
          row_version: number;
          school_id: string;
          section_code: string;
          sequence: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          report_card_id: string;
          row_version?: number;
          school_id: string;
          section_code: string;
          sequence?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          report_card_id?: string;
          row_version?: number;
          school_id?: string;
          section_code?: string;
          sequence?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_card_narratives_report_fk";
            columns: ["report_card_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "report_cards";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      report_card_subject_entries: {
        Row: {
          created_at: string;
          final_score: number | null;
          id: string;
          narrative: string | null;
          organization_id: string;
          predicate: string | null;
          report_card_id: string;
          row_version: number;
          school_id: string;
          source_calculation: Json | null;
          subject_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          final_score?: number | null;
          id?: string;
          narrative?: string | null;
          organization_id: string;
          predicate?: string | null;
          report_card_id: string;
          row_version?: number;
          school_id: string;
          source_calculation?: Json | null;
          subject_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          final_score?: number | null;
          id?: string;
          narrative?: string | null;
          organization_id?: string;
          predicate?: string | null;
          report_card_id?: string;
          row_version?: number;
          school_id?: string;
          source_calculation?: Json | null;
          subject_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_card_subject_report_fk";
            columns: ["report_card_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "report_cards";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "report_card_subject_subject_fk";
            columns: ["subject_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      report_cards: {
        Row: {
          academic_year_id: string;
          attendance_summary: Json | null;
          created_at: string;
          homeroom_comment: string | null;
          id: string;
          organization_id: string;
          published_at: string | null;
          published_by_profile_id: string | null;
          reviewed_at: string | null;
          row_version: number;
          school_id: string;
          status: string;
          student_enrollment_id: string;
          submitted_at: string | null;
          term_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          academic_year_id: string;
          attendance_summary?: Json | null;
          created_at?: string;
          homeroom_comment?: string | null;
          id?: string;
          organization_id: string;
          published_at?: string | null;
          published_by_profile_id?: string | null;
          reviewed_at?: string | null;
          row_version?: number;
          school_id: string;
          status?: string;
          student_enrollment_id: string;
          submitted_at?: string | null;
          term_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          academic_year_id?: string;
          attendance_summary?: Json | null;
          created_at?: string;
          homeroom_comment?: string | null;
          id?: string;
          organization_id?: string;
          published_at?: string | null;
          published_by_profile_id?: string | null;
          reviewed_at?: string | null;
          row_version?: number;
          school_id?: string;
          status?: string;
          student_enrollment_id?: string;
          submitted_at?: string | null;
          term_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "report_cards_enrollment_fk";
            columns: ["student_enrollment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "student_enrollments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "report_cards_published_by_profile_id_fkey";
            columns: ["published_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_cards_term_fk";
            columns: ["term_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "report_cards_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          created_at: string;
          permission_id: string;
          role_id: string;
        };
        Insert: {
          created_at?: string;
          permission_id: string;
          role_id: string;
        };
        Update: {
          created_at?: string;
          permission_id?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          is_customizable: boolean;
          is_system_role: boolean;
          name: string;
          organization_id: string | null;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_customizable?: boolean;
          is_system_role?: boolean;
          name: string;
          organization_id?: string | null;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_customizable?: boolean;
          is_system_role?: boolean;
          name?: string;
          organization_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      school_settings: {
        Row: {
          attendance_settings: Json;
          created_at: string;
          grading_settings: Json;
          id: string;
          logo_file_id: string | null;
          organization_id: string;
          report_branding: Json;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          attendance_settings?: Json;
          created_at?: string;
          grading_settings?: Json;
          id?: string;
          logo_file_id?: string | null;
          organization_id: string;
          report_branding?: Json;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          attendance_settings?: Json;
          created_at?: string;
          grading_settings?: Json;
          id?: string;
          logo_file_id?: string | null;
          organization_id?: string;
          report_branding?: Json;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_settings_logo_file_fk";
            columns: ["logo_file_id"];
            isOneToOne: false;
            referencedRelation: "file_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "school_settings_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      schools: {
        Row: {
          code: string;
          created_at: string;
          education_stage: string;
          id: string;
          name: string;
          npsn: string | null;
          organization_id: string;
          status: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          education_stage: string;
          id?: string;
          name: string;
          npsn?: string | null;
          organization_id: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          education_stage?: string;
          id?: string;
          name?: string;
          npsn?: string | null;
          organization_id?: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schools_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      sis_import_entity_refs: {
        Row: {
          created_at: string;
          created_by_import_job_id: string | null;
          entity_type: string;
          external_ref: string;
          guardian_id: string | null;
          id: string;
          organization_id: string;
          staff_member_id: string | null;
          student_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by_import_job_id?: string | null;
          entity_type: string;
          external_ref: string;
          guardian_id?: string | null;
          id?: string;
          organization_id: string;
          staff_member_id?: string | null;
          student_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by_import_job_id?: string | null;
          entity_type?: string;
          external_ref?: string;
          guardian_id?: string | null;
          id?: string;
          organization_id?: string;
          staff_member_id?: string | null;
          student_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sis_import_entity_refs_created_by_job_fk";
            columns: ["created_by_import_job_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "sis_import_jobs";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sis_import_entity_refs_guardian_fk";
            columns: ["guardian_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sis_import_entity_refs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sis_import_entity_refs_staff_fk";
            columns: ["staff_member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff_members";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sis_import_entity_refs_student_fk";
            columns: ["student_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      sis_import_job_issues: {
        Row: {
          created_at: string;
          error_code: string;
          field_name: string | null;
          id: string;
          import_job_row_id: string;
          message: string;
          normalized_value: string | null;
          raw_value: string | null;
          severity: string;
        };
        Insert: {
          created_at?: string;
          error_code: string;
          field_name?: string | null;
          id?: string;
          import_job_row_id: string;
          message: string;
          normalized_value?: string | null;
          raw_value?: string | null;
          severity: string;
        };
        Update: {
          created_at?: string;
          error_code?: string;
          field_name?: string | null;
          id?: string;
          import_job_row_id?: string;
          message?: string;
          normalized_value?: string | null;
          raw_value?: string | null;
          severity?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sis_import_job_issues_import_job_row_id_fkey";
            columns: ["import_job_row_id"];
            isOneToOne: false;
            referencedRelation: "sis_import_job_rows";
            referencedColumns: ["id"];
          },
        ];
      };
      sis_import_job_rows: {
        Row: {
          action: string;
          created_at: string;
          entity_type: string;
          expected_state: Json | null;
          id: string;
          import_job_id: string;
          match_key: Json | null;
          normalized_data: Json | null;
          raw_data: Json | null;
          resolved_entity_id: string | null;
          row_number: number;
          sheet_name: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          entity_type: string;
          expected_state?: Json | null;
          id?: string;
          import_job_id: string;
          match_key?: Json | null;
          normalized_data?: Json | null;
          raw_data?: Json | null;
          resolved_entity_id?: string | null;
          row_number: number;
          sheet_name: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity_type?: string;
          expected_state?: Json | null;
          id?: string;
          import_job_id?: string;
          match_key?: Json | null;
          normalized_data?: Json | null;
          raw_data?: Json | null;
          resolved_entity_id?: string | null;
          row_number?: number;
          sheet_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sis_import_job_rows_import_job_id_fkey";
            columns: ["import_job_id"];
            isOneToOne: false;
            referencedRelation: "sis_import_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      sis_import_jobs: {
        Row: {
          completed_at: string | null;
          confirmation_token_hash: string | null;
          confirmed_at: string | null;
          created_at: string;
          created_by_profile_id: string | null;
          failure_summary: string | null;
          id: string;
          normalized_plan_fingerprint: string | null;
          organization_id: string;
          preview_version: number;
          school_id: string;
          source_file_asset_id: string | null;
          source_file_hash: string;
          source_filename: string;
          status: string;
          template_version: string;
          totals: Json;
          updated_at: string;
          validated_at: string | null;
        };
        Insert: {
          completed_at?: string | null;
          confirmation_token_hash?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          created_by_profile_id?: string | null;
          failure_summary?: string | null;
          id?: string;
          normalized_plan_fingerprint?: string | null;
          organization_id: string;
          preview_version?: number;
          school_id: string;
          source_file_asset_id?: string | null;
          source_file_hash: string;
          source_filename: string;
          status?: string;
          template_version: string;
          totals?: Json;
          updated_at?: string;
          validated_at?: string | null;
        };
        Update: {
          completed_at?: string | null;
          confirmation_token_hash?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          created_by_profile_id?: string | null;
          failure_summary?: string | null;
          id?: string;
          normalized_plan_fingerprint?: string | null;
          organization_id?: string;
          preview_version?: number;
          school_id?: string;
          source_file_asset_id?: string | null;
          source_file_hash?: string;
          source_filename?: string;
          status?: string;
          template_version?: string;
          totals?: Json;
          updated_at?: string;
          validated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sis_import_jobs_created_by_profile_id_fkey";
            columns: ["created_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sis_import_jobs_file_asset_fk";
            columns: ["source_file_asset_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "file_assets";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sis_import_jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sis_import_jobs_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      staff_attendance_records: {
        Row: {
          attendance_date: string;
          check_in_at: string | null;
          check_out_at: string | null;
          created_at: string;
          id: string;
          note: string | null;
          organization_id: string;
          school_id: string;
          staff_member_id: string;
          status: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          attendance_date: string;
          check_in_at?: string | null;
          check_out_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          organization_id: string;
          school_id: string;
          staff_member_id: string;
          status: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          attendance_date?: string;
          check_in_at?: string | null;
          check_out_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          organization_id?: string;
          school_id?: string;
          staff_member_id?: string;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "staff_attendance_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "staff_attendance_staff_fk";
            columns: ["staff_member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff_members";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      staff_members: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          organization_id: string;
          profile_id: string | null;
          staff_kind: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          id?: string;
          organization_id: string;
          profile_id?: string | null;
          staff_kind: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          organization_id?: string;
          profile_id?: string | null;
          staff_kind?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_school_assignments: {
        Row: {
          created_at: string;
          employee_number: string | null;
          employment_status: string;
          id: string;
          joined_on: string | null;
          left_on: string | null;
          organization_id: string;
          position_title: string | null;
          school_id: string;
          staff_member_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          employee_number?: string | null;
          employment_status?: string;
          id?: string;
          joined_on?: string | null;
          left_on?: string | null;
          organization_id: string;
          position_title?: string | null;
          school_id: string;
          staff_member_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          employee_number?: string | null;
          employment_status?: string;
          id?: string;
          joined_on?: string | null;
          left_on?: string | null;
          organization_id?: string;
          position_title?: string | null;
          school_id?: string;
          staff_member_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_school_assignments_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "staff_school_assignments_staff_fk";
            columns: ["staff_member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff_members";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      student_attendance_records: {
        Row: {
          attendance_session_id: string;
          check_in_at: string | null;
          correction_reason: string | null;
          created_at: string;
          id: string;
          note: string | null;
          organization_id: string;
          recorded_by_profile_id: string | null;
          school_id: string;
          status: string;
          student_enrollment_id: string;
          updated_at: string;
          updated_by_profile_id: string | null;
          version: number;
        };
        Insert: {
          attendance_session_id: string;
          check_in_at?: string | null;
          correction_reason?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          organization_id: string;
          recorded_by_profile_id?: string | null;
          school_id: string;
          status: string;
          student_enrollment_id: string;
          updated_at?: string;
          updated_by_profile_id?: string | null;
          version?: number;
        };
        Update: {
          attendance_session_id?: string;
          check_in_at?: string | null;
          correction_reason?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          organization_id?: string;
          recorded_by_profile_id?: string | null;
          school_id?: string;
          status?: string;
          student_enrollment_id?: string;
          updated_at?: string;
          updated_by_profile_id?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "student_attendance_enrollment_fk";
            columns: ["student_enrollment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "student_enrollments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "student_attendance_records_recorded_by_profile_id_fkey";
            columns: ["recorded_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_attendance_records_updated_by_profile_id_fkey";
            columns: ["updated_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_attendance_roster_member_fk";
            columns: [
              "attendance_session_id",
              "student_enrollment_id",
              "organization_id",
              "school_id",
            ];
            isOneToOne: false;
            referencedRelation: "attendance_session_roster_members";
            referencedColumns: [
              "attendance_session_id",
              "student_enrollment_id",
              "organization_id",
              "school_id",
            ];
          },
          {
            foreignKeyName: "student_attendance_session_fk";
            columns: ["attendance_session_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "attendance_sessions";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      student_enrollments: {
        Row: {
          academic_year_id: string;
          created_at: string;
          ended_on: string | null;
          enrolled_on: string;
          enrollment_number: string | null;
          grade_level_id: string;
          id: string;
          organization_id: string;
          previous_enrollment_id: string | null;
          school_id: string;
          status: string;
          student_id: string;
          student_number: string | null;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          created_at?: string;
          ended_on?: string | null;
          enrolled_on: string;
          enrollment_number?: string | null;
          grade_level_id: string;
          id?: string;
          organization_id: string;
          previous_enrollment_id?: string | null;
          school_id: string;
          status?: string;
          student_id: string;
          student_number?: string | null;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          created_at?: string;
          ended_on?: string | null;
          enrolled_on?: string;
          enrollment_number?: string | null;
          grade_level_id?: string;
          id?: string;
          organization_id?: string;
          previous_enrollment_id?: string | null;
          school_id?: string;
          status?: string;
          student_id?: string;
          student_number?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_enrollments_grade_fk";
            columns: ["grade_level_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "student_enrollments_previous_fk";
            columns: ["previous_enrollment_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "student_enrollments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "student_enrollments_student_fk";
            columns: ["student_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "student_enrollments_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      student_guardians: {
        Row: {
          can_manage_permissions: boolean;
          can_receive_notification: boolean;
          can_view_academic: boolean;
          can_view_attendance: boolean;
          created_at: string;
          guardian_id: string;
          id: string;
          is_primary: boolean;
          organization_id: string;
          relationship_type: string;
          status: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          can_manage_permissions?: boolean;
          can_receive_notification?: boolean;
          can_view_academic?: boolean;
          can_view_attendance?: boolean;
          created_at?: string;
          guardian_id: string;
          id?: string;
          is_primary?: boolean;
          organization_id: string;
          relationship_type: string;
          status?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          can_manage_permissions?: boolean;
          can_receive_notification?: boolean;
          can_view_academic?: boolean;
          can_view_attendance?: boolean;
          created_at?: string;
          guardian_id?: string;
          id?: string;
          is_primary?: boolean;
          organization_id?: string;
          relationship_type?: string;
          status?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_fk";
            columns: ["guardian_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "student_guardians_student_fk";
            columns: ["student_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      student_scores: {
        Row: {
          assessment_id: string;
          created_at: string;
          entered_by_profile_id: string | null;
          feedback: string | null;
          id: string;
          organization_id: string;
          school_id: string;
          score: number | null;
          status: string;
          student_enrollment_id: string;
          updated_at: string;
          updated_by_profile_id: string | null;
        };
        Insert: {
          assessment_id: string;
          created_at?: string;
          entered_by_profile_id?: string | null;
          feedback?: string | null;
          id?: string;
          organization_id: string;
          school_id: string;
          score?: number | null;
          status?: string;
          student_enrollment_id: string;
          updated_at?: string;
          updated_by_profile_id?: string | null;
        };
        Update: {
          assessment_id?: string;
          created_at?: string;
          entered_by_profile_id?: string | null;
          feedback?: string | null;
          id?: string;
          organization_id?: string;
          school_id?: string;
          score?: number | null;
          status?: string;
          student_enrollment_id?: string;
          updated_at?: string;
          updated_by_profile_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "student_scores_assessment_fk";
            columns: ["assessment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "assessments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "student_scores_enrollment_fk";
            columns: ["student_enrollment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "student_enrollments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "student_scores_entered_by_profile_id_fkey";
            columns: ["entered_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_scores_updated_by_profile_id_fkey";
            columns: ["updated_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      students: {
        Row: {
          birth_date: string | null;
          birth_place: string | null;
          created_at: string;
          full_name: string;
          gender: string | null;
          id: string;
          nisn: string | null;
          organization_id: string;
          preferred_name: string | null;
          profile_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          birth_date?: string | null;
          birth_place?: string | null;
          created_at?: string;
          full_name: string;
          gender?: string | null;
          id?: string;
          nisn?: string | null;
          organization_id: string;
          preferred_name?: string | null;
          profile_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          birth_date?: string | null;
          birth_place?: string | null;
          created_at?: string;
          full_name?: string;
          gender?: string | null;
          id?: string;
          nisn?: string | null;
          organization_id?: string;
          preferred_name?: string | null;
          profile_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      subjects: {
        Row: {
          category: string | null;
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          code: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id: string;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subjects_school_fk";
            columns: ["school_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      teacher_daily_operation_command_requests: {
        Row: {
          actor_profile_id: string;
          command_name: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          organization_id: string;
          payload_fingerprint: string;
          request_id: string;
          resource_id: string | null;
          result_payload: Json | null;
          school_id: string;
          status: string;
        };
        Insert: {
          actor_profile_id: string;
          command_name: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id: string;
          payload_fingerprint: string;
          request_id: string;
          resource_id?: string | null;
          result_payload?: Json | null;
          school_id: string;
          status?: string;
        };
        Update: {
          actor_profile_id?: string;
          command_name?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string;
          payload_fingerprint?: string;
          request_id?: string;
          resource_id?: string | null;
          result_payload?: Json | null;
          school_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_daily_operation_command_requests_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      teaching_assignments: {
        Row: {
          academic_year_id: string;
          classroom_id: string;
          created_at: string;
          ends_on: string | null;
          id: string;
          organization_id: string;
          role: string;
          school_id: string;
          staff_school_assignment_id: string;
          starts_on: string;
          status: string;
          subject_id: string;
          term_id: string | null;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          classroom_id: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          organization_id: string;
          role?: string;
          school_id: string;
          staff_school_assignment_id: string;
          starts_on: string;
          status?: string;
          subject_id: string;
          term_id?: string | null;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          classroom_id?: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          organization_id?: string;
          role?: string;
          school_id?: string;
          staff_school_assignment_id?: string;
          starts_on?: string;
          status?: string;
          subject_id?: string;
          term_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teaching_assignments_classroom_fk";
            columns: ["classroom_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "classrooms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "teaching_assignments_staff_fk";
            columns: ["staff_school_assignment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "staff_school_assignments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "teaching_assignments_subject_fk";
            columns: ["subject_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "teaching_assignments_term_fk";
            columns: ["term_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "teaching_assignments_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      teaching_journals: {
        Row: {
          academic_year_id: string;
          created_at: string;
          created_by_profile_id: string;
          follow_up: string | null;
          id: string;
          journal_date: string;
          material_taught: string | null;
          obstacles: string | null;
          organization_id: string;
          school_id: string;
          status: string;
          submitted_at: string | null;
          submitted_by_profile_id: string | null;
          teacher_note: string | null;
          teaching_assignment_id: string;
          term_id: string;
          timetable_entry_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          academic_year_id: string;
          created_at?: string;
          created_by_profile_id: string;
          follow_up?: string | null;
          id?: string;
          journal_date: string;
          material_taught?: string | null;
          obstacles?: string | null;
          organization_id: string;
          school_id: string;
          status?: string;
          submitted_at?: string | null;
          submitted_by_profile_id?: string | null;
          teacher_note?: string | null;
          teaching_assignment_id: string;
          term_id: string;
          timetable_entry_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          academic_year_id?: string;
          created_at?: string;
          created_by_profile_id?: string;
          follow_up?: string | null;
          id?: string;
          journal_date?: string;
          material_taught?: string | null;
          obstacles?: string | null;
          organization_id?: string;
          school_id?: string;
          status?: string;
          submitted_at?: string | null;
          submitted_by_profile_id?: string | null;
          teacher_note?: string | null;
          teaching_assignment_id?: string;
          term_id?: string;
          timetable_entry_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "teaching_journals_assignment_fk";
            columns: ["teaching_assignment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "teaching_assignments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "teaching_journals_created_by_profile_id_fkey";
            columns: ["created_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teaching_journals_submitted_by_profile_id_fkey";
            columns: ["submitted_by_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teaching_journals_term_fk";
            columns: ["term_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "teaching_journals_timetable_fk";
            columns: ["timetable_entry_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "timetable_entries";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "teaching_journals_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      terms: {
        Row: {
          academic_year_id: string;
          code: string;
          created_at: string;
          closed_at: string | null;
          closed_by_profile_id: string | null;
          ends_on: string;
          id: string;
          name: string;
          organization_id: string;
          reopened_at: string | null;
          reopened_by_profile_id: string | null;
          school_id: string;
          sequence: number;
          starts_on: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          code: string;
          created_at?: string;
          closed_at?: string | null;
          closed_by_profile_id?: string | null;
          ends_on: string;
          id?: string;
          name: string;
          organization_id: string;
          reopened_at?: string | null;
          reopened_by_profile_id?: string | null;
          school_id: string;
          sequence: number;
          starts_on: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          code?: string;
          created_at?: string;
          closed_at?: string | null;
          closed_by_profile_id?: string | null;
          ends_on?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          reopened_at?: string | null;
          reopened_by_profile_id?: string | null;
          school_id?: string;
          sequence?: number;
          starts_on?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "terms_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      timetable_entries: {
        Row: {
          academic_year_id: string;
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          end_time: string;
          id: string;
          organization_id: string;
          room_label: string | null;
          row_version: number;
          school_id: string;
          start_time: string;
          status: string;
          teaching_assignment_id: string;
          term_id: string | null;
          timetable_period_id: string;
          updated_at: string;
          weekday: number;
        };
        Insert: {
          academic_year_id: string;
          created_at?: string;
          effective_from: string;
          effective_to?: string | null;
          end_time: string;
          id?: string;
          organization_id: string;
          room_label?: string | null;
          row_version?: number;
          school_id: string;
          start_time: string;
          status?: string;
          teaching_assignment_id: string;
          term_id?: string | null;
          timetable_period_id: string;
          updated_at?: string;
          weekday: number;
        };
        Update: {
          academic_year_id?: string;
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          end_time?: string;
          id?: string;
          organization_id?: string;
          room_label?: string | null;
          row_version?: number;
          school_id?: string;
          start_time?: string;
          status?: string;
          teaching_assignment_id?: string;
          term_id?: string | null;
          timetable_period_id?: string;
          updated_at?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "timetable_entries_assignment_fk";
            columns: ["teaching_assignment_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "teaching_assignments";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "timetable_entries_period_fk";
            columns: [
              "timetable_period_id",
              "organization_id",
              "school_id",
              "academic_year_id",
              "start_time",
              "end_time",
            ];
            isOneToOne: false;
            referencedRelation: "timetable_periods";
            referencedColumns: [
              "id",
              "organization_id",
              "school_id",
              "academic_year_id",
              "start_time",
              "end_time",
            ];
          },
          {
            foreignKeyName: "timetable_entries_term_fk";
            columns: ["term_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
          {
            foreignKeyName: "timetable_entries_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
      timetable_periods: {
        Row: {
          academic_year_id: string;
          created_at: string;
          end_time: string;
          id: string;
          label: string;
          organization_id: string;
          period_type: string;
          school_id: string;
          sequence: number;
          start_time: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          created_at?: string;
          end_time: string;
          id?: string;
          label: string;
          organization_id: string;
          period_type?: string;
          school_id: string;
          sequence: number;
          start_time: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          created_at?: string;
          end_time?: string;
          id?: string;
          label?: string;
          organization_id?: string;
          period_type?: string;
          school_id?: string;
          sequence?: number;
          start_time?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "timetable_periods_year_fk";
            columns: ["academic_year_id", "organization_id", "school_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "organization_id", "school_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      b18_accept_admission_application: {
        Args: {
          p_application_id: string;
          p_expected_row_version: number;
          p_reason?: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      b18_archive_admission_cycle: {
        Args: {
          p_cycle_id: string;
          p_expected_row_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      b18_close_admission_cycle: {
        Args: {
          p_cycle_id: string;
          p_expected_row_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      b18_convert_admission_application: {
        Args: {
          p_application_id: string;
          p_expected_row_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      b18_cycle_transition: {
        Args: {
          p_command: string;
          p_cycle_id: string;
          p_expected_row_version: number;
          p_reason: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      b18_get_admission_application: {
        Args: { p_application_id: string };
        Returns: Json;
      };
      b18_get_admission_cycle: { Args: { p_cycle_id: string }; Returns: Json };
      b18_get_public_admission_cycle: {
        Args: { p_admission_cycle_id: string };
        Returns: {
          academic_year_name: string;
          available: boolean;
          closes_at: string;
          grades: Json;
          id: string;
          name: string;
          opens_at: string;
          school_name: string;
        }[];
      };
      b18_list_admission_applications: {
        Args: {
          p_cycle_id?: string;
          p_grade_level_id?: string;
          p_limit?: number;
          p_offset?: number;
          p_status?: string;
        };
        Returns: Json;
      };
      b18_list_admission_cycles: {
        Args: { p_school_id?: string };
        Returns: {
          academic_year_id: string;
          closes_at: string;
          id: string;
          name: string;
          opens_at: string;
          row_version: number;
          school_id: string;
          status: string;
        }[];
      };
      b18_open_admission_cycle: {
        Args: {
          p_cycle_id: string;
          p_expected_row_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      b18_reject_admission_application: {
        Args: {
          p_application_id: string;
          p_expected_row_version: number;
          p_reason: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      b18_reopen_admission_cycle: {
        Args: {
          p_cycle_id: string;
          p_expected_row_version: number;
          p_reason: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      b18_start_admission_review: {
        Args: {
          p_application_id: string;
          p_expected_row_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      b18_submit_admission_application: {
        Args: {
          p_admission_cycle_id: string;
          p_payload: Json;
          p_request_id: string;
        };
        Returns: Json;
      };
      b18_transition_admission_application: {
        Args: {
          p_application_id: string;
          p_command: string;
          p_expected_row_version: number;
          p_reason?: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      b18_withdraw_admission_application: {
        Args: {
          p_application_id: string;
          p_expected_row_version: number;
          p_reason: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      b17_close_academic_year: {
        Args: {
          p_academic_year_id: string;
          p_expected_updated_at: string;
          p_reason?: string | null;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: Json;
      };
      b17_close_term: {
        Args: {
          p_expected_updated_at: string;
          p_reason?: string | null;
          p_request_id: string;
          p_school_id: string;
          p_term_id: string;
        };
        Returns: Json;
      };
      b17_get_academic_year_close_readiness: {
        Args: { p_academic_year_id: string; p_school_id: string };
        Returns: Json;
      };
      b17_get_term_close_readiness: {
        Args: { p_school_id: string; p_term_id: string };
        Returns: Json;
      };
      b17_reopen_academic_year: {
        Args: {
          p_academic_year_id: string;
          p_expected_updated_at: string;
          p_reason: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: Json;
      };
      b17_reopen_term: {
        Args: {
          p_expected_updated_at: string;
          p_reason: string;
          p_request_id: string;
          p_school_id: string;
          p_term_id: string;
        };
        Returns: Json;
      };
      apply_progression_batch: {
        Args: {
          p_batch_id: string;
          p_expected_version: number;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: Json;
      };
      approve_progression_batch: {
        Args: {
          p_batch_id: string;
          p_expected_version: number;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: Json;
      };
      assert_sis_import_permissions_for_entities: {
        Args: {
          p_entity_types: string[];
          p_organization_id: string;
          p_school_id: string;
        };
        Returns: undefined;
      };
      assert_sis_permission_for_school: {
        Args: {
          p_organization_id: string;
          p_permission_code: string;
          p_school_id: string;
        };
        Returns: undefined;
      };
      attendance_school_timezone: {
        Args: { p_school_id: string };
        Returns: string;
      };
      b11_attendance_fingerprint: { Args: { p_payload: Json }; Returns: string };
      b11_attendance_request_begin: {
        Args: {
          p_command_kind: string;
          p_fingerprint: string;
          p_organization_id: string;
          p_request_id: string;
          p_school_id: string;
          p_target_id: string;
        };
        Returns: Json;
      };
      b11_attendance_request_finish: {
        Args: { p_request_id: string; p_result: Json };
        Returns: undefined;
      };
      b12_audit: {
        Args: {
          p_action: string;
          p_entity_id: string;
          p_entity_type: string;
          p_metadata?: Json;
          p_organization_id: string;
          p_school_id: string;
        };
        Returns: undefined;
      };
      b12_claim_command: {
        Args: {
          p_command_id: string;
          p_completed?: boolean;
          p_fingerprint: string;
          p_kind: string;
          p_organization_id: string;
          p_request_id: string;
          p_result: Json;
          p_school_id: string;
          p_target_id: string;
        };
        Returns: Json;
      };
      b12_command_fingerprint: { Args: { p_payload: Json }; Returns: string };
      b12_replay_command: {
        Args: { p_command_id: string; p_fingerprint: string };
        Returns: Json;
      };
      b12_require_staff: {
        Args: {
          p_classroom_id?: string;
          p_organization_id: string;
          p_permission: string;
          p_school_id: string;
        };
        Returns: undefined;
      };
      b13_claim_teacher_daily_command: {
        Args: {
          p_command_name: string;
          p_organization_id: string;
          p_payload: Json;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: Json;
      };
      b13_complete_teacher_daily_command: {
        Args: {
          p_command_id: string;
          p_resource_id: string;
          p_result_payload: Json;
        };
        Returns: undefined;
      };
      b14_authorize: {
        Args: { p_permission: string; p_school_id: string };
        Returns: string;
      };
      b14_command_begin: {
        Args: {
          p_command_name: string;
          p_fingerprint: string;
          p_organization_id: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: Json;
      };
      b14_command_complete: {
        Args: {
          p_command_name: string;
          p_request_id: string;
          p_resource_id: string;
          p_resource_type: string;
          p_result: Json;
        };
        Returns: undefined;
      };
      b14_command_fingerprint: { Args: { p_payload: Json }; Returns: string };
      b14_readiness: {
        Args: {
          p_enrollment_id: string;
          p_organization_id: string;
          p_school_id: string;
          p_source_year_id: string;
        };
        Returns: Json;
      };
      b14_transition_batch: {
        Args: {
          p_batch_id: string;
          p_command: string;
          p_expected_version: number;
          p_permission: string;
          p_reason?: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: Json;
      };
      b14_validate_decision: {
        Args: {
          p_batch: Database["public"]["Tables"]["progression_batches"]["Row"];
          p_decision: Database["public"]["Tables"]["progression_decisions"]["Row"];
          p_require_complete?: boolean;
        };
        Returns: undefined;
      };
      b15_assessment_create: {
        Args: {
          p_academic_year_id: string;
          p_assessment_date: string;
          p_assessment_type_id: string;
          p_description: string | null;
          p_max_score: number;
          p_min_score: number;
          p_organization_id: string;
          p_request_id: string;
          p_school_id: string;
          p_teaching_assignment_id: string;
          p_term_id: string;
          p_title: string;
          p_weight: number | null;
        };
        Returns: {
          assessment_id: string;
          status: string;
          version: number;
        }[];
      };
      b15_assessment_request_fingerprint: { Args: { p_payload: Json }; Returns: string };
      b15_assessment_save_scores: {
        Args: {
          p_assessment_id: string;
          p_entries: Json;
          p_expected_assessment_version: number | null;
          p_organization_id: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: { assessment_id: string; saved_count: number; version: number }[];
      };
      b15_assessment_transition: {
        Args: {
          p_action: string;
          p_assessment_id: string;
          p_expected_version: number;
          p_organization_id: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: { assessment_id: string; status: string; version: number }[];
      };
      b15_assessment_update_draft: {
        Args: {
          p_assessment_date: string;
          p_assessment_id: string;
          p_assessment_type_id: string;
          p_description: string | null;
          p_expected_version: number;
          p_max_score: number;
          p_min_score: number;
          p_organization_id: string;
          p_request_id: string;
          p_school_id: string;
          p_title: string;
          p_weight: number | null;
        };
        Returns: { assessment_id: string; status: string; version: number }[];
      };
      b15_correct_final_score: {
        Args: {
          p_assessment_id: string;
          p_expected_score_version: number;
          p_new_score: number;
          p_new_status: string;
          p_organization_id: string;
          p_reason: string;
          p_request_id: string;
          p_school_id: string;
          p_score_id: string;
        };
        Returns: { score_id: string; status: string; version: number }[];
      };
      b15_get_assessment: {
        Args: { p_assessment_id: string; p_organization_id: string; p_school_id: string };
        Returns: {
          academic_year_id: string;
          assessment_date: string;
          assessment_type_id: string;
          created_at: string;
          created_by_profile_id: string;
          description: string;
          id: string;
          max_score: number;
          min_score: number;
          organization_id: string;
          school_id: string;
          status: string;
          teaching_assignment_id: string;
          term_id: string;
          title: string;
          updated_at: string;
          version: number;
          weight: number;
        }[];
      };
      b15_get_gradebook: {
        Args: { p_assessment_id: string; p_organization_id: string; p_school_id: string };
        Returns: {
          current_eligible: boolean;
          enrollment_status: string;
          feedback: string;
          score: number;
          score_id: string;
          score_status: string;
          score_version: number;
          student_enrollment_id: string;
          student_id: string;
          student_name: string;
        }[];
      };
      b15_list_assessments: {
        Args: {
          p_academic_year_id?: string | null;
          p_limit?: number;
          p_offset?: number;
          p_organization_id: string;
          p_school_id: string;
          p_status?: string | null;
          p_term_id?: string | null;
        };
        Returns: {
          academic_year_id: string;
          assessment_date: string;
          assessment_type_id: string;
          id: string;
          school_id: string;
          status: string;
          teaching_assignment_id: string;
          term_id: string;
          title: string;
          updated_at: string;
          version: number;
        }[];
      };
      b16_get_report_card: {
        Args: { p_report_card_id: string };
        Returns: Json;
      };
      b16_list_report_card_candidates: {
        Args: { p_academic_year_id?: string | null; p_school_id: string };
        Returns: {
          academic_year_id: string;
          classroom_id: string | null;
          classroom_name: string | null;
          has_working_report_card: boolean;
          student_enrollment_id: string;
          student_name: string;
        }[];
      };
      b16_list_report_cards: {
        Args: {
          p_academic_year_id?: string | null;
          p_limit?: number;
          p_offset?: number;
          p_school_id: string;
          p_status?: string | null;
          p_term_id?: string | null;
        };
        Returns: {
          academic_year_id: string;
          business_version: number;
          classroom_id: string | null;
          classroom_name: string | null;
          organization_id: string;
          published_at: string | null;
          report_card_id: string;
          row_version: number;
          school_id: string;
          status: string;
          student_enrollment_id: string;
          student_name: string;
          term_id: string;
          updated_at: string;
        }[];
      };
      b16_report_card_create_revision: {
        Args: {
          p_expected_source_row_version: number;
          p_reason: string;
          p_request_id: string;
          p_source_report_card_id: string;
        };
        Returns: {
          business_version: number;
          report_card_id: string;
          row_version: number;
          source_report_card_id: string;
          status: string;
        }[];
      };
      b16_report_card_generate_draft: {
        Args: {
          p_expected_row_version?: number | null;
          p_request_id: string;
          p_student_enrollment_id: string;
          p_term_id: string;
        };
        Returns: {
          business_version: number;
          report_card_id: string;
          row_version: number;
          status: string;
        }[];
      };
      b16_report_card_publish: {
        Args: { p_expected_row_version: number; p_report_card_id: string; p_request_id: string };
        Returns: {
          business_version: number;
          report_card_id: string;
          row_version: number;
          status: string;
        }[];
      };
      b16_report_card_save_content: {
        Args: {
          p_content: Json;
          p_expected_row_version: number;
          p_report_card_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      b16_report_card_transition: {
        Args: {
          p_action: string;
          p_expected_row_version: number;
          p_report_card_id: string;
          p_request_id: string;
        };
        Returns: {
          business_version: number;
          report_card_id: string;
          row_version: number;
          status: string;
        }[];
      };
      can_access_assessment: {
        Args: { p_assessment_id: string; p_permission_code: string };
        Returns: boolean;
      };
      can_access_enrollment: {
        Args: { p_enrollment_id: string; p_permission_code: string };
        Returns: boolean;
      };
      can_access_guardian: {
        Args: {
          p_guardian_id: string;
          p_organization_id: string;
          p_permission_code: string;
        };
        Returns: boolean;
      };
      can_access_report_card: {
        Args: { p_permission_code: string; p_report_card_id: string };
        Returns: boolean;
      };
      can_access_staff: {
        Args: {
          p_organization_id: string;
          p_permission_code: string;
          p_staff_member_id: string;
        };
        Returns: boolean;
      };
      can_access_student: {
        Args: {
          p_organization_id: string;
          p_permission_code: string;
          p_student_id: string;
        };
        Returns: boolean;
      };
      can_access_teaching_assignment: {
        Args: { p_assignment_id: string; p_permission_code: string };
        Returns: boolean;
      };
      can_delete_orphan_report_card_document_object: {
        Args: { p_object_path: string };
        Returns: boolean;
      };
      can_insert_sis_import_storage_object: {
        Args: { p_name: string };
        Returns: boolean;
      };
      can_manage_assessment_context: {
        Args: {
          p_academic_year_id: string;
          p_organization_id: string;
          p_permission_code: string;
          p_school_id: string;
          p_teaching_assignment_id: string;
          p_term_id: string;
        };
        Returns: boolean;
      };
      can_manage_assessment_update_context: {
        Args: {
          p_academic_year_id: string;
          p_assessment_id: string;
          p_organization_id: string;
          p_permission_code: string;
          p_school_id: string;
          p_teaching_assignment_id: string;
          p_term_id: string;
        };
        Returns: boolean;
      };
      can_read_membership: {
        Args: { p_membership_id: string; p_organization_id: string };
        Returns: boolean;
      };
      can_read_membership_role: {
        Args: {
          p_membership_id: string;
          p_organization_id: string;
          p_scope_id: string;
          p_scope_type: string;
        };
        Returns: boolean;
      };
      can_read_report_card_document_object: {
        Args: { p_object_path: string };
        Returns: boolean;
      };
      can_read_role: { Args: { p_role_id: string }; Returns: boolean };
      can_read_sis_import_job: { Args: { p_job_id: string }; Returns: boolean };
      can_select_sis_import_storage_object: {
        Args: { p_name: string };
        Returns: boolean;
      };
      can_staff_download_report_card_document_object: {
        Args: { p_object_path: string };
        Returns: boolean;
      };
      can_write_report_card_document_object: {
        Args: { p_object_path: string };
        Returns: boolean;
      };
      cancel_permission_request: {
        Args: {
          p_command_request_id?: string;
          p_expected_version: number;
          p_organization_id: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: {
          request_id: string;
          status: string;
          version: number;
        }[];
      };
      cancel_progression_batch: {
        Args: {
          p_batch_id: string;
          p_expected_version: number;
          p_reason: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: Json;
      };
      close_permission_request: {
        Args: {
          p_command_request_id?: string;
          p_expected_version: number;
          p_organization_id: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: {
          request_id: string;
          status: string;
          version: number;
        }[];
      };
      commit_sis_import_job: {
        Args: { p_confirmation_token: string; p_job_id: string };
        Returns: {
          failure_summary: string;
          job_id: string;
          status: string;
          totals: Json;
        }[];
      };
      correct_attendance_record: {
        Args: {
          p_correction_reason: string;
          p_expected_updated_at: string;
          p_note: string;
          p_record_id: string;
          p_request_id: string;
          p_status: string;
        };
        Returns: {
          record_id: string;
          record_status: string;
          record_updated_at: string;
        }[];
      };
      create_permission_request: {
        Args: {
          p_command_request_id?: string;
          p_description: string;
          p_due_at?: string;
          p_organization_id: string;
          p_request_id: string;
          p_request_type: string;
          p_school_id: string;
          p_student_ids?: string[];
          p_target_classroom_id?: string;
          p_target_mode: string;
          p_title: string;
        };
        Returns: {
          request_id: string;
          status: string;
          version: number;
        }[];
      };
      create_progression_batch: {
        Args: {
          p_request_id: string;
          p_school_id: string;
          p_source_academic_year_id: string;
          p_target_academic_year_id: string;
        };
        Returns: Json;
      };
      create_report_card_revision: {
        Args: {
          p_expected_updated_at: string;
          p_published_report_card_id: string;
        };
        Returns: string;
      };
      create_sis_import_job: {
        Args: {
          p_organization_id: string;
          p_school_id: string;
          p_source_file_hash: string;
          p_source_filename: string;
          p_template_version: string;
        };
        Returns: {
          completed_at: string | null;
          confirmation_token_hash: string | null;
          confirmed_at: string | null;
          created_at: string;
          created_by_profile_id: string | null;
          failure_summary: string | null;
          id: string;
          normalized_plan_fingerprint: string | null;
          organization_id: string;
          preview_version: number;
          school_id: string;
          source_file_asset_id: string | null;
          source_file_hash: string;
          source_filename: string;
          status: string;
          template_version: string;
          totals: Json;
          updated_at: string;
          validated_at: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "sis_import_jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_teaching_journal: {
        Args: {
          p_follow_up?: string;
          p_journal_date: string;
          p_material_taught?: string;
          p_obstacles?: string;
          p_request_id: string;
          p_teacher_note?: string;
          p_timetable_entry_id: string;
        };
        Returns: {
          journal_date: string;
          journal_id: string;
          status: string;
          version: number;
        }[];
      };
      fail_sis_import_upload: { Args: { p_job_id: string }; Returns: undefined };
      generate_report_card_draft: {
        Args: {
          p_expected_updated_at?: string;
          p_student_enrollment_id: string;
          p_term_id: string;
        };
        Returns: string;
      };
      generate_sis_confirmation_token: { Args: never; Returns: string };
      generate_sis_entity_ref: {
        Args: { p_entity_type: string };
        Returns: string;
      };
      get_my_teaching_journal: {
        Args: { p_journal_id: string };
        Returns: {
          classroom_id: string;
          classroom_name: string;
          follow_up: string;
          journal_date: string;
          journal_id: string;
          material_taught: string;
          obstacles: string;
          status: string;
          subject_id: string;
          subject_name: string;
          submitted_at: string;
          teacher_note: string;
          teaching_assignment_id: string;
          timetable_entry_id: string;
          version: number;
        }[];
      };
      get_parent_permission_request: {
        Args: { p_request_id: string };
        Returns: {
          description: string;
          due_at: string;
          expired: boolean;
          id: string;
          request_type: string;
          status: string;
          students: Json;
          title: string;
        }[];
      };
      get_progression_batch: {
        Args: { p_batch_id: string; p_school_id: string };
        Returns: Json;
      };
      get_sis_export_projection: {
        Args: { p_school_id: string };
        Returns: Json;
      };
      get_sis_import_job_payload: { Args: { p_job_id: string }; Returns: Json };
      get_sis_import_validation_snapshot: {
        Args: {
          p_employee_numbers: string[];
          p_guardian_refs: string[];
          p_job_id: string;
          p_staff_refs: string[];
          p_student_nisns: string[];
          p_student_refs: string[];
        };
        Returns: Json;
      };
      get_staff_attendance_record: {
        Args: { p_attendance_record_id: string; p_school_id: string };
        Returns: {
          attendance_date: string;
          attendance_record_id: string;
          check_in_at: string;
          check_out_at: string;
          note: string;
          staff_member_id: string;
          staff_name: string;
          status: string;
          version: number;
        }[];
      };
      get_staff_permission_request: {
        Args: {
          p_organization_id: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: {
          approved_count: number;
          created_at: string;
          description: string;
          due_at: string;
          id: string;
          pending_count: number;
          published_at: string;
          recipient_count: number;
          rejected_count: number;
          request_type: string;
          status: string;
          target_classroom_id: string;
          target_mode: string;
          title: string;
          version: number;
        }[];
      };
      get_staff_teaching_journal: {
        Args: { p_journal_id: string; p_school_id: string };
        Returns: {
          classroom_id: string;
          classroom_name: string;
          follow_up: string;
          journal_date: string;
          journal_id: string;
          material_taught: string;
          obstacles: string;
          status: string;
          subject_id: string;
          subject_name: string;
          submitted_at: string;
          teacher_name: string;
          teacher_note: string;
          teacher_staff_member_id: string;
          teaching_assignment_id: string;
          timetable_entry_id: string;
          version: number;
        }[];
      };
      has_active_membership: {
        Args: { p_organization_id: string };
        Returns: boolean;
      };
      has_any_active_membership: { Args: never; Returns: boolean };
      has_any_sis_import_permission_for_school: {
        Args: { p_organization_id: string; p_school_id: string };
        Returns: boolean;
      };
      has_permission: {
        Args: {
          p_classroom_id?: string;
          p_organization_id: string;
          p_owner_profile_id?: string;
          p_permission_code: string;
          p_related_student_id?: string;
          p_school_id?: string;
        };
        Returns: boolean;
      };
      has_permission_in_org: {
        Args: { p_organization_id: string; p_permission_code: string };
        Returns: boolean;
      };
      has_scoped_permission_exact_subject: {
        Args: {
          p_classroom_id: string;
          p_organization_id: string;
          p_permission_code: string;
          p_related_student_id: string;
          p_school_id: string;
          p_subject_profile_id: string;
        };
        Returns: boolean;
      };
      has_sis_permission_for_school: {
        Args: {
          p_organization_id: string;
          p_permission_code: string;
          p_school_id: string;
        };
        Returns: boolean;
      };
      has_staff_scope_permission: {
        Args: {
          p_classroom_id?: string;
          p_organization_id: string;
          p_permission_code: string;
          p_school_id?: string;
        };
        Returns: boolean;
      };
      hash_sis_confirmation_token: {
        Args: {
          p_job_id: string;
          p_normalized_plan_fingerprint: string;
          p_preview_version: number;
          p_token: string;
        };
        Returns: string;
      };
      is_own_membership: { Args: { p_membership_id: string }; Returns: boolean };
      list_attendance_corrections: {
        Args: { p_offset?: number; p_page_size?: number; p_record_id: string };
        Returns: {
          actor_name: string;
          actor_profile_id: string;
          changed_at: string;
          new_status: string;
          old_status: string;
          reason: string;
          record_id: string;
          session_id: string;
          student_id: string;
          student_name: string;
        }[];
      };
      list_attendance_history: {
        Args: {
          p_classroom_id?: string;
          p_from: string;
          p_offset?: number;
          p_page_size?: number;
          p_school_id: string;
          p_status?: string;
          p_student_id?: string;
          p_to: string;
        };
        Returns: {
          absent_count: number;
          classroom_id: string;
          classroom_name: string;
          excused_count: number;
          late_count: number;
          lifecycle: string;
          marked_count: number;
          origin: string;
          other_count: number;
          present_count: number;
          roster_count: number;
          session_date: string;
          session_id: string;
          sick_count: number;
          teaching_assignment_id: string;
          timetable_entry_id: string;
        }[];
      };
      list_my_notifications: {
        Args: { p_offset?: number; p_page_size?: number };
        Returns: {
          created_at: string;
          deep_link: string;
          delivery_id: string;
          expires_at: string;
          notification_id: string;
          notification_type: string;
          preview: string;
          read_at: string;
          source_request_id: string;
          title: string;
          unread_count: number;
        }[];
      };
      list_my_staff_attendance: {
        Args: {
          p_from?: string;
          p_page?: number;
          p_page_size?: number;
          p_status?: string;
          p_to?: string;
        };
        Returns: {
          attendance_date: string;
          attendance_record_id: string;
          check_in_at: string;
          check_out_at: string;
          note: string;
          staff_member_id: string;
          status: string;
          version: number;
        }[];
      };
      list_my_teaching_journals: {
        Args: {
          p_academic_year_id?: string;
          p_from?: string;
          p_page?: number;
          p_page_size?: number;
          p_status?: string;
          p_term_id?: string;
          p_to?: string;
        };
        Returns: {
          classroom_id: string;
          classroom_name: string;
          follow_up: string;
          journal_date: string;
          journal_id: string;
          material_taught: string;
          obstacles: string;
          status: string;
          subject_id: string;
          subject_name: string;
          submission_at: string;
          teacher_note: string;
          teaching_assignment_id: string;
          timetable_entry_id: string;
          version: number;
        }[];
      };
      list_my_teaching_occurrences: {
        Args: {
          p_from: string;
          p_page?: number;
          p_page_size?: number;
          p_to: string;
        };
        Returns: {
          classroom_id: string;
          classroom_name: string;
          end_time: string;
          journal_id: string;
          journal_status: string;
          journal_version: number;
          occurrence_date: string;
          start_time: string;
          subject_id: string;
          subject_name: string;
          teaching_assignment_id: string;
          timetable_entry_id: string;
        }[];
      };
      list_parent_permission_requests: {
        Args: { p_offset?: number; p_page_size?: number };
        Returns: {
          due_at: string;
          expired: boolean;
          id: string;
          request_type: string;
          status: string;
          students: Json;
          title: string;
        }[];
      };
      list_parent_student_attendance: {
        Args: { p_from?: string; p_student_id: string; p_to?: string };
        Returns: {
          classroom_id: string;
          organization_id: string;
          record_id: string;
          recorded_at: string;
          school_id: string;
          session_date: string;
          session_id: string;
          session_status: string;
          status: string;
        }[];
      };
      list_permission_decision_history: {
        Args: {
          p_offset?: number;
          p_page_size?: number;
          p_request_id: string;
          p_request_recipient_id?: string;
        };
        Returns: {
          changed_at: string;
          new_decision: string;
          old_decision: string;
          operation: string;
        }[];
      };
      list_permission_request_responses: {
        Args: { p_offset?: number; p_page_size?: number; p_request_id: string };
        Returns: {
          decided: boolean;
          decided_at: string;
          decision: string;
          recipient_id: string;
          student_id: string;
          student_name: string;
        }[];
      };
      list_progression_batches: {
        Args: { p_limit?: number; p_offset?: number; p_school_id: string };
        Returns: Json;
      };
      list_progression_candidates: {
        Args: {
          p_batch_id: string;
          p_limit?: number;
          p_offset?: number;
          p_school_id: string;
        };
        Returns: Json;
      };
      list_sis_import_jobs: {
        Args: { p_limit?: number; p_offset?: number; p_school_id: string };
        Returns: Json;
      };
      list_staff_attendance: {
        Args: {
          p_from?: string;
          p_page?: number;
          p_page_size?: number;
          p_school_id: string;
          p_staff_member_id?: string;
          p_status?: string;
          p_to?: string;
        };
        Returns: {
          attendance_date: string;
          attendance_record_id: string;
          check_in_at: string;
          check_out_at: string;
          note: string;
          staff_member_id: string;
          staff_name: string;
          status: string;
          version: number;
        }[];
      };
      list_staff_permission_requests: {
        Args: {
          p_offset?: number;
          p_organization_id: string;
          p_page_size?: number;
          p_school_id: string;
          p_status?: string;
        };
        Returns: {
          approved_count: number;
          created_at: string;
          due_at: string;
          id: string;
          pending_count: number;
          published_at: string;
          recipient_count: number;
          rejected_count: number;
          request_type: string;
          status: string;
          target_mode: string;
          title: string;
          version: number;
        }[];
      };
      list_staff_student_attendance_history: {
        Args: {
          p_from: string;
          p_offset?: number;
          p_page_size?: number;
          p_student_id: string;
          p_to: string;
        };
        Returns: {
          classroom_id: string;
          classroom_name: string;
          note: string;
          origin: string;
          record_id: string;
          session_date: string;
          session_id: string;
          status: string;
          updated_at: string;
          was_corrected: boolean;
        }[];
      };
      list_staff_teaching_journals: {
        Args: {
          p_classroom_id?: string;
          p_from?: string;
          p_page?: number;
          p_page_size?: number;
          p_school_id: string;
          p_status?: string;
          p_subject_id?: string;
          p_teacher_profile_id?: string;
          p_to?: string;
        };
        Returns: {
          classroom_id: string;
          classroom_name: string;
          follow_up: string;
          journal_date: string;
          journal_id: string;
          material_taught: string;
          obstacles: string;
          status: string;
          subject_id: string;
          subject_name: string;
          submitted_at: string;
          teacher_name: string;
          teacher_note: string;
          teacher_staff_member_id: string;
          teaching_assignment_id: string;
          timetable_entry_id: string;
          version: number;
        }[];
      };
      list_student_own_attendance: {
        Args: {
          p_from?: string;
          p_organization_id: string;
          p_school_id: string;
          p_to?: string;
        };
        Returns: {
          classroom_id: string;
          organization_id: string;
          record_id: string;
          recorded_at: string;
          school_id: string;
          session_date: string;
          session_id: string;
          session_status: string;
          status: string;
        }[];
      };
      list_student_published_schedule: {
        Args: { p_organization_id: string };
        Returns: {
          classroom_name: string;
          day_of_week: number;
          ends_at: string;
          entry_id: string;
          starts_at: string;
          subject_name: string;
          teacher_name: string;
        }[];
      };
      lock_attendance_session: {
        Args: {
          p_expected_updated_at: string;
          p_request_id: string;
          p_session_id: string;
        };
        Returns: {
          locked_at: string;
          session_id: string;
          session_status: string;
        }[];
      };
      manage_staff_attendance: {
        Args: {
          p_attendance_date: string;
          p_check_in_at?: string;
          p_check_out_at?: string;
          p_expected_version?: number;
          p_note?: string;
          p_request_id: string;
          p_staff_member_id: string;
          p_status: string;
        };
        Returns: {
          attendance_date: string;
          attendance_record_id: string;
          check_in_at: string;
          check_out_at: string;
          status: string;
          version: number;
        }[];
      };
      mark_notification_read: {
        Args: { p_notification_recipient_id: string };
        Returns: {
          notification_recipient_id: string;
          read_at: string;
        }[];
      };
      mint_sis_entity_ref: {
        Args: {
          p_created_by_import_job_id?: string;
          p_entity_type: string;
          p_external_ref: string;
          p_guardian_id?: string;
          p_organization_id: string;
          p_staff_member_id?: string;
          p_student_id?: string;
        };
        Returns: string;
      };
      open_attendance_session: {
        Args: {
          p_acknowledge_collision?: boolean;
          p_acknowledge_non_instructional?: boolean;
          p_classroom_id?: string;
          p_ends_at?: string;
          p_manual_reason?: string;
          p_request_id: string;
          p_session_date: string;
          p_starts_at?: string;
          p_teaching_assignment_id?: string;
          p_term_id?: string;
          p_timetable_entry_id?: string;
        };
        Returns: {
          calendar_warning: boolean;
          collision_warning: boolean;
          roster_count: number;
          school_timezone: string;
          session_id: string;
          session_status: string;
        }[];
      };
      owns_teaching_assignment: {
        Args: { p_assignment_id: string };
        Returns: boolean;
      };
      persist_sis_import_validation: {
        Args: {
          p_attestation: string;
          p_attestation_expires_at: number;
          p_expected_previous_preview_version: number;
          p_issues_json: string;
          p_job_id: string;
          p_normalized_plan_fingerprint: string;
          p_rows_json: string;
          p_totals_json: string;
        };
        Returns: {
          blocking_error_count: number;
          confirmation_token: string;
          job_id: string;
          preview_version: number;
        }[];
      };
      prepare_sis_import_references: {
        Args: { p_organization_id: string; p_school_id: string };
        Returns: {
          already_mapped_count: number;
          entity_type: string;
          minted_count: number;
        }[];
      };
      publish_permission_request: {
        Args: {
          p_command_request_id?: string;
          p_expected_version: number;
          p_organization_id: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: {
          notification_id: string;
          recipient_count: number;
          request_id: string;
          status: string;
          version: number;
        }[];
      };
      publish_report_card: {
        Args: { p_expected_updated_at: string; p_report_card_id: string };
        Returns: {
          academic_year_id: string;
          attendance_summary: Json | null;
          created_at: string;
          homeroom_comment: string | null;
          id: string;
          organization_id: string;
          published_at: string | null;
          published_by_profile_id: string | null;
          reviewed_at: string | null;
          school_id: string;
          status: string;
          student_enrollment_id: string;
          submitted_at: string | null;
          term_id: string;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "report_cards";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      register_report_card_document: {
        Args: {
          p_attestation: string;
          p_attestation_expires_at: number;
          p_checksum: string;
          p_object_path: string;
          p_report_card_id: string;
          p_size_bytes: number;
        };
        Returns: {
          checksum: string;
          file_asset_id: string;
          generated_document_id: string;
          object_path: string;
        }[];
      };
      register_sis_import_source_file: {
        Args: {
          p_job_id: string;
          p_mime_type: string;
          p_object_path: string;
          p_original_filename: string;
          p_size_bytes: number;
        };
        Returns: string;
      };
      reject_progression_batch: {
        Args: {
          p_batch_id: string;
          p_expected_version: number;
          p_reason: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: Json;
      };
      replace_report_card_document: {
        Args: {
          p_attestation: string;
          p_attestation_expires_at: number;
          p_checksum: string;
          p_expected_file_asset_id: string;
          p_object_path: string;
          p_report_card_id: string;
          p_size_bytes: number;
        };
        Returns: {
          checksum: string;
          file_asset_id: string;
          generated_document_id: string;
          object_path: string;
          previous_object_path: string;
        }[];
      };
      replace_teaching_assignment: {
        Args: {
          p_academic_year_id: string;
          p_classroom_id: string;
          p_ends_on: string;
          p_organization_id: string;
          p_role: string;
          p_school_id: string;
          p_staff_school_assignment_id: string;
          p_starts_on: string;
          p_status: string;
          p_subject_id: string;
          p_teaching_assignment_id: string;
          p_term_id: string;
        };
        Returns: {
          replacement_occurred: boolean;
          teaching_assignment_id: string;
        }[];
      };
      replace_timetable_entry: {
        Args: {
          p_cutover_date: string;
          p_expected_row_version: number;
          p_inherit_effective_to?: boolean;
          p_inherit_room_label?: boolean;
          p_organization_id: string;
          p_room_label?: string;
          p_school_id: string;
          p_successor_effective_to?: string;
          p_teaching_assignment_id: string;
          p_term_id: string;
          p_timetable_entry_id: string;
          p_timetable_period_id: string;
          p_weekday: number;
        };
        Returns: {
          replacement_mode: string;
          timetable_entry_id: string;
        }[];
      };
      report_card_document_object_path: {
        Args: { p_generation_id: string; p_report_card_id: string };
        Returns: string;
      };
      resolve_sis_guardian_ref: {
        Args: {
          p_external_ref: string;
          p_organization_id: string;
          p_school_id: string;
        };
        Returns: string;
      };
      resolve_sis_staff_employee_number: {
        Args: {
          p_employee_number: string;
          p_organization_id: string;
          p_school_id: string;
        };
        Returns: string;
      };
      resolve_sis_staff_ref: {
        Args: {
          p_external_ref: string;
          p_organization_id: string;
          p_school_id: string;
        };
        Returns: string;
      };
      resolve_sis_student_nisn: {
        Args: { p_nisn: string; p_organization_id: string; p_school_id: string };
        Returns: string;
      };
      resolve_sis_student_ref: {
        Args: {
          p_external_ref: string;
          p_organization_id: string;
          p_school_id: string;
        };
        Returns: string;
      };
      save_attendance_draft: {
        Args: {
          p_expected_session_updated_at: string;
          p_records: Json;
          p_request_id: string;
          p_session_id: string;
        };
        Returns: {
          saved_count: number;
          session_id: string;
        }[];
      };
      save_progression_decision: {
        Args: {
          p_batch_id: string;
          p_exception_reason?: string;
          p_expected_version?: number;
          p_operator_note?: string;
          p_outcome: string;
          p_request_id: string;
          p_school_id: string;
          p_source_student_enrollment_id: string;
          p_target_classroom_id?: string;
          p_target_grade_level_id?: string;
        };
        Returns: Json;
      };
      scrub_expired_sis_import_payloads: { Args: never; Returns: number };
      send_permission_request_reminder: {
        Args: {
          p_command_request_id?: string;
          p_organization_id: string;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: {
          delivery_count: number;
          notification_id: string;
          request_id: string;
        }[];
      };
      sis_entity_export_permission_codes: {
        Args: { p_entity_type: string };
        Returns: string[];
      };
      sis_entity_import_permission_codes: {
        Args: { p_entity_type: string };
        Returns: string[];
      };
      submit_attendance_session: {
        Args: {
          p_expected_updated_at: string;
          p_request_id: string;
          p_session_id: string;
        };
        Returns: {
          session_id: string;
          session_status: string;
          submitted_at: string;
        }[];
      };
      submit_parent_permission_decision: {
        Args: {
          p_command_request_id?: string;
          p_decision: string;
          p_expected_version?: number;
          p_request_id: string;
          p_request_recipient_id: string;
        };
        Returns: {
          decision: string;
          decision_id: string;
          request_id: string;
          request_recipient_id: string;
          version: number;
        }[];
      };
      submit_progression_batch: {
        Args: {
          p_batch_id: string;
          p_expected_version: number;
          p_request_id: string;
          p_school_id: string;
        };
        Returns: Json;
      };
      submit_teaching_journal: {
        Args: {
          p_expected_version: number;
          p_journal_id: string;
          p_request_id: string;
        };
        Returns: {
          journal_date: string;
          journal_id: string;
          status: string;
          submitted_at: string;
          version: number;
        }[];
      };
      transition_report_card: {
        Args: {
          p_action: string;
          p_expected_updated_at: string;
          p_report_card_id: string;
        };
        Returns: {
          academic_year_id: string;
          attendance_summary: Json | null;
          created_at: string;
          homeroom_comment: string | null;
          id: string;
          organization_id: string;
          published_at: string | null;
          published_by_profile_id: string | null;
          reviewed_at: string | null;
          school_id: string;
          status: string;
          student_enrollment_id: string;
          submitted_at: string | null;
          term_id: string;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "report_cards";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_permission_request: {
        Args: {
          p_command_request_id?: string;
          p_description: string;
          p_due_at?: string;
          p_expected_version: number;
          p_organization_id: string;
          p_request_id: string;
          p_request_type: string;
          p_school_id: string;
          p_student_ids?: string[];
          p_target_classroom_id?: string;
          p_target_mode: string;
          p_title: string;
        };
        Returns: {
          request_id: string;
          status: string;
          version: number;
        }[];
      };
      update_teaching_journal: {
        Args: {
          p_expected_version: number;
          p_follow_up?: string;
          p_journal_id: string;
          p_material_taught?: string;
          p_obstacles?: string;
          p_request_id: string;
          p_teacher_note?: string;
        };
        Returns: {
          journal_date: string;
          journal_id: string;
          status: string;
          version: number;
        }[];
      };
      verify_report_card_document_attestation: {
        Args: {
          p_actor_id: string;
          p_attestation: string;
          p_attestation_expires_at: number;
          p_checksum: string;
          p_object_path: string;
          p_organization_id: string;
          p_report_card_id: string;
          p_school_id: string;
          p_size_bytes: number;
          p_version: number;
        };
        Returns: boolean;
      };
      verify_sis_import_plan_attestation: {
        Args: {
          p_actor_id: string;
          p_attestation: string;
          p_attestation_expires_at: number;
          p_expected_previous_preview_version: number;
          p_issues_json: string;
          p_job_id: string;
          p_normalized_plan_fingerprint: string;
          p_rows_json: string;
          p_totals_json: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
