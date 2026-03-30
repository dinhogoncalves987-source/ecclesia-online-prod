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
      announcements: {
        Row: {
          church_id: string | null
          content: string
          created_at: string
          id: string
          priority: string
          title: string
          user_id: string
        }
        Insert: {
          church_id?: string | null
          content: string
          created_at?: string
          id?: string
          priority?: string
          title: string
          user_id: string
        }
        Update: {
          church_id?: string | null
          content?: string
          created_at?: string
          id?: string
          priority?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      churches: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          is_matriz: boolean
          logo_url: string | null
          name: string
          parent_church_id: string | null
          pastor_name: string | null
          phone: string | null
          primary_color: string | null
          slug: string
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_matriz?: boolean
          logo_url?: string | null
          name: string
          parent_church_id?: string | null
          pastor_name?: string | null
          phone?: string | null
          primary_color?: string | null
          slug: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_matriz?: boolean
          logo_url?: string | null
          name?: string
          parent_church_id?: string | null
          pastor_name?: string | null
          phone?: string | null
          primary_color?: string | null
          slug?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "churches_parent_church_id_fkey"
            columns: ["parent_church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          church_id: string | null
          created_at: string
          description: string | null
          file_type: string | null
          file_url: string | null
          id: string
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          church_id?: string | null
          created_at?: string
          description?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          title: string
          user_id: string
        }
        Update: {
          category?: string
          church_id?: string | null
          created_at?: string
          description?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          church_id: string | null
          color: string | null
          created_at: string
          event_date: string
          id: string
          location: string | null
          time: string | null
          title: string
          user_id: string
        }
        Insert: {
          church_id?: string | null
          color?: string | null
          created_at?: string
          event_date: string
          id?: string
          location?: string | null
          time?: string | null
          title: string
          user_id: string
        }
        Update: {
          church_id?: string | null
          color?: string | null
          created_at?: string
          event_date?: string
          id?: string
          location?: string | null
          time?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          church_id: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
          since: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          church_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          since?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          church_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          since?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      prayer_requests: {
        Row: {
          church_id: string | null
          created_at: string
          description: string | null
          id: string
          is_anonymous: boolean
          praying_count: number
          status: string
          title: string
          user_id: string
        }
        Insert: {
          church_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_anonymous?: boolean
          praying_count?: number
          status?: string
          title: string
          user_id: string
        }
        Update: {
          church_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_anonymous?: boolean
          praying_count?: number
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_requests_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          church_id: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role_title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          church_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role_title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          church_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role_title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          assigned_to: string | null
          church_id: string | null
          created_at: string
          id: string
          ministry: string
          notes: string | null
          schedule_date: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          church_id?: string | null
          created_at?: string
          id?: string
          ministry?: string
          notes?: string | null
          schedule_date: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          church_id?: string | null
          created_at?: string
          id?: string
          ministry?: string
          notes?: string | null
          schedule_date?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      small_groups: {
        Row: {
          church_id: string | null
          created_at: string
          current_members: number
          description: string | null
          id: string
          leader: string
          location: string | null
          max_members: number
          meeting_day: string | null
          meeting_time: string | null
          name: string
          status: string
          user_id: string
        }
        Insert: {
          church_id?: string | null
          created_at?: string
          current_members?: number
          description?: string | null
          id?: string
          leader: string
          location?: string | null
          max_members?: number
          meeting_day?: string | null
          meeting_time?: string | null
          name: string
          status?: string
          user_id: string
        }
        Update: {
          church_id?: string | null
          created_at?: string
          current_members?: number
          description?: string | null
          id?: string
          leader?: string
          location?: string | null
          max_members?: number
          meeting_day?: string | null
          meeting_time?: string | null
          name?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "small_groups_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string | null
          church_id: string | null
          created_at: string
          date: string
          description: string
          id: string
          status: string
          type: string
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string | null
          church_id?: string | null
          created_at?: string
          date?: string
          description: string
          id?: string
          status?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          church_id?: string | null
          created_at?: string
          date?: string
          description?: string
          id?: string
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          church_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          church_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          church_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_church_data: {
        Args: { _church_id: string; _user_id: string }
        Returns: boolean
      }
      get_user_church_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_matriz_admin: {
        Args: { _church_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "tesoureiro" | "obreiro" | "lider" | "membro"
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
      app_role: ["admin", "tesoureiro", "obreiro", "lider", "membro"],
    },
  },
} as const
