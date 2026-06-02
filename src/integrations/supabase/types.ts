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
      admin_settings: {
        Row: {
          claude_token: string | null
          deepseek_token: string | null
          id: boolean
          openai_token: string | null
          updated_at: string
        }
        Insert: {
          claude_token?: string | null
          deepseek_token?: string | null
          id?: boolean
          openai_token?: string | null
          updated_at?: string
        }
        Update: {
          claude_token?: string | null
          deepseek_token?: string | null
          id?: boolean
          openai_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cpf: string
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          cpf: string
          created_at?: string
          email: string
          id: string
          name: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          cpf?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
      site_generations: {
        Row: {
          brief: string
          created_at: string
          html: string
          id: string
          is_active: boolean
          owner_id: string
          prompt: string
          provider: string
          site_id: string
        }
        Insert: {
          brief?: string
          created_at?: string
          html?: string
          id?: string
          is_active?: boolean
          owner_id: string
          prompt?: string
          provider: string
          site_id: string
        }
        Update: {
          brief?: string
          created_at?: string
          html?: string
          id?: string
          is_active?: boolean
          owner_id?: string
          prompt?: string
          provider?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_generations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_images: {
        Row: {
          created_at: string
          id: string
          label: string | null
          owner_id: string
          path: string
          public_url: string
          site_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          owner_id: string
          path: string
          public_url: string
          site_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          owner_id?: string
          path?: string
          public_url?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_images_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          id: string
          ip: string | null
          referrer: string | null
          region: string | null
          site_id: string
          user_agent: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          referrer?: string | null
          region?: string | null
          site_id: string
          user_agent?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          referrer?: string | null
          region?: string | null
          site_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          created_at: string
          edits_this_week: number
          gens_this_month: number
          html: string
          id: string
          is_published: boolean
          last_prompt: string
          month_started_at: string
          next_provider_idx: number
          owner_id: string
          pixels: Json
          slug: string
          title: string
          updated_at: string
          week_started_at: string
        }
        Insert: {
          created_at?: string
          edits_this_week?: number
          gens_this_month?: number
          html?: string
          id?: string
          is_published?: boolean
          last_prompt?: string
          month_started_at?: string
          next_provider_idx?: number
          owner_id: string
          pixels?: Json
          slug: string
          title?: string
          updated_at?: string
          week_started_at?: string
        }
        Update: {
          created_at?: string
          edits_this_week?: number
          gens_this_month?: number
          html?: string
          id?: string
          is_published?: boolean
          last_prompt?: string
          month_started_at?: string
          next_provider_idx?: number
          owner_id?: string
          pixels?: Json
          slug?: string
          title?: string
          updated_at?: string
          week_started_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
