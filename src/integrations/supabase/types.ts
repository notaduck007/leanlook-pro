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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      look_aheads: {
        Row: {
          company_id: string
          created_at: string
          id: string
          project_id: string
          status: Database["public"]["Enums"]["lookahead_status"]
          super_id: string
          updated_at: string
          week_start_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          project_id: string
          status?: Database["public"]["Enums"]["lookahead_status"]
          super_id: string
          updated_at?: string
          week_start_date: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["lookahead_status"]
          super_id?: string
          updated_at?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "look_aheads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "look_aheads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      lookahead_lines: {
        Row: {
          assigned_trade: string | null
          company_id: string
          constraints: string | null
          custom_text: string | null
          id: string
          lookahead_id: string
          materials_needed: string | null
          notes: string | null
          parent_line_id: string | null
          photos: string[] | null
          sort_order: number | null
          status_per_day: Json | null
          task_id: string | null
        }
        Insert: {
          assigned_trade?: string | null
          company_id: string
          constraints?: string | null
          custom_text?: string | null
          id?: string
          lookahead_id: string
          materials_needed?: string | null
          notes?: string | null
          parent_line_id?: string | null
          photos?: string[] | null
          sort_order?: number | null
          status_per_day?: Json | null
          task_id?: string | null
        }
        Update: {
          assigned_trade?: string | null
          company_id?: string
          constraints?: string | null
          custom_text?: string | null
          id?: string
          lookahead_id?: string
          materials_needed?: string | null
          notes?: string | null
          parent_line_id?: string | null
          photos?: string[] | null
          sort_order?: number | null
          status_per_day?: Json | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lookahead_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lookahead_lines_lookahead_id_fkey"
            columns: ["lookahead_id"]
            isOneToOne: false
            referencedRelation: "look_aheads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lookahead_lines_parent_line_id_fkey"
            columns: ["parent_line_id"]
            isOneToOne: false
            referencedRelation: "lookahead_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lookahead_lines_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      master_subtasks: {
        Row: {
          category: string | null
          created_at: string
          id: string
          master_task_id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          master_task_id: string
          name: string
          sort_order?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          master_task_id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "master_subtasks_master_task_id_fkey"
            columns: ["master_task_id"]
            isOneToOne: false
            referencedRelation: "master_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      master_tasks: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
          normalized_name: string
          tags: string[] | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
          normalized_name: string
          tags?: string[] | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string
          tags?: string[] | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          link: string | null
          message: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          display_name: string | null
          id: string
          project_ids: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          project_ids?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          project_ids?: string[] | null
          updated_at?: string
          user_id?: string
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
      projects: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_versions: {
        Row: {
          company_id: string
          file_url: string
          id: string
          project_id: string
          uploaded_at: string
          version_number: number
        }
        Insert: {
          company_id: string
          file_url: string
          id?: string
          project_id: string
          uploaded_at?: string
          version_number?: number
        }
        Update: {
          company_id?: string
          file_url?: string
          id?: string
          project_id?: string
          uploaded_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          checklist_items: Json | null
          company_id: string
          created_at: string
          id: string
          tag: string
        }
        Insert: {
          checklist_items?: Json | null
          company_id: string
          created_at?: string
          id?: string
          tag: string
        }
        Update: {
          checklist_items?: Json | null
          company_id?: string
          created_at?: string
          id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          company_id: string
          duration: string | null
          external_id: string | null
          finish_date: string | null
          id: string
          metadata: Json | null
          name: string
          parent_id: string | null
          percent_complete: number | null
          predecessors: Json | null
          schedule_version_id: string
          start_date: string | null
          tags: string[] | null
        }
        Insert: {
          company_id: string
          duration?: string | null
          external_id?: string | null
          finish_date?: string | null
          id?: string
          metadata?: Json | null
          name: string
          parent_id?: string | null
          percent_complete?: number | null
          predecessors?: Json | null
          schedule_version_id: string
          start_date?: string | null
          tags?: string[] | null
        }
        Update: {
          company_id?: string
          duration?: string | null
          external_id?: string | null
          finish_date?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          parent_id?: string | null
          percent_complete?: number | null
          predecessors?: Json | null
          schedule_version_id?: string
          start_date?: string | null
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_schedule_version_id_fkey"
            columns: ["schedule_version_id"]
            isOneToOne: false
            referencedRelation: "schedule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      onboard_company: {
        Args: { _company_name: string; _slug: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "pm" | "super"
      lookahead_status: "draft" | "submitted" | "approved" | "rejected"
      project_status: "active" | "completed" | "on_hold" | "archived"
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
      app_role: ["admin", "pm", "super"],
      lookahead_status: ["draft", "submitted", "approved", "rejected"],
      project_status: ["active", "completed", "on_hold", "archived"],
    },
  },
} as const
