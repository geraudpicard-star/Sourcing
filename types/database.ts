/**
 * Minimal hand-written Database types for Supabase client typing.
 * Regenerate with `supabase gen types typescript` once the project is linked.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          siren: string;
          siret: string | null;
          denomination: string;
          legal_form: string | null;
          naf_code: string | null;
          naf_label: string | null;
          creation_date: string | null;
          age_years: number | null;
          employee_range: string | null;
          employee_range_code: string | null;
          active: boolean;
          street: string | null;
          complement_adresse: string | null;
          cedex: string | null;
          postal_code: string | null;
          city: string | null;
          department: string | null;
          source: string;
          fetched_at: string;
          saved_by: string | null;
          saved_at: string;
          raw: Json | null;
          dirigeants: Json | null;
          dirigeants_fetched_at: string | null;
          financials: Json | null;
          financials_fetched_at: string | null;
          no_public_accounts: boolean | null;
          principal_dirigeant: Json | null;
        };
        Insert: {
          siren: string;
          siret?: string | null;
          denomination: string;
          legal_form?: string | null;
          naf_code?: string | null;
          naf_label?: string | null;
          creation_date?: string | null;
          age_years?: number | null;
          employee_range?: string | null;
          employee_range_code?: string | null;
          active?: boolean;
          street?: string | null;
          complement_adresse?: string | null;
          cedex?: string | null;
          postal_code?: string | null;
          city?: string | null;
          department?: string | null;
          source?: string;
          fetched_at?: string;
          saved_by?: string | null;
          saved_at?: string;
          raw?: Json | null;
          dirigeants?: Json | null;
          dirigeants_fetched_at?: string | null;
          financials?: Json | null;
          financials_fetched_at?: string | null;
          no_public_accounts?: boolean | null;
          principal_dirigeant?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["companies"]["Insert"]>;
        Relationships: [];
      };
      search_cache: {
        Row: {
          key: string;
          payload: Json;
          total: number;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          key: string;
          payload: Json;
          total: number;
          created_at?: string;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["search_cache"]["Insert"]>;
        Relationships: [];
      };
      search_sessions: {
        Row: {
          id: string;
          user_id: string;
          label: string | null;
          filters: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label?: string | null;
          filters?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["search_sessions"]["Insert"]>;
        Relationships: [];
      };
      session_companies: {
        Row: {
          session_id: string;
          siren: string;
        };
        Insert: {
          session_id: string;
          siren: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_companies"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
