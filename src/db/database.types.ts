// GENEROWANY PLIK - nie edytowac recznie.
// Regeneracja po kazdej zmianie schematu: npm run db:types
// (wymaga uruchomionego lokalnego stacku: npx supabase start)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          cancelled_at: string | null
          created_at: string
          horse_id: number
          hour: number
          id: number
          rider_id: string
          schedule_day_id: number
          status: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          horse_id: number
          hour: number
          id?: never
          rider_id: string
          schedule_day_id: number
          status?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          horse_id?: number
          hour?: number
          id?: never
          rider_id?: string
          schedule_day_id?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_scheduled_horse_fkey"
            columns: ["schedule_day_id", "horse_id"]
            isOneToOne: false
            referencedRelation: "schedule_day_horses"
            referencedColumns: ["schedule_day_id", "horse_id"]
          },
        ]
      }
      horses: {
        Row: {
          active: boolean
          created_at: string
          id: number
          name: string
          notes: string | null
          stable_id: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: never
          name: string
          notes?: string | null
          stable_id: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: never
          name?: string
          notes?: string | null
          stable_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "horses_stable_id_fkey"
            columns: ["stable_id"]
            isOneToOne: false
            referencedRelation: "stables"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      schedule_day_horses: {
        Row: {
          created_at: string
          horse_id: number
          schedule_day_id: number
          stable_id: number
        }
        Insert: {
          created_at?: string
          horse_id: number
          schedule_day_id: number
          stable_id: number
        }
        Update: {
          created_at?: string
          horse_id?: number
          schedule_day_id?: number
          stable_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_day_horses_day_fkey"
            columns: ["schedule_day_id", "stable_id"]
            isOneToOne: false
            referencedRelation: "schedule_days"
            referencedColumns: ["id", "stable_id"]
          },
          {
            foreignKeyName: "schedule_day_horses_horse_fkey"
            columns: ["horse_id", "stable_id"]
            isOneToOne: false
            referencedRelation: "horses"
            referencedColumns: ["id", "stable_id"]
          },
        ]
      }
      schedule_days: {
        Row: {
          close_hour: number
          created_at: string
          day: string
          id: number
          open_hour: number
          stable_id: number
          updated_at: string
        }
        Insert: {
          close_hour: number
          created_at?: string
          day: string
          id?: never
          open_hour: number
          stable_id: number
          updated_at?: string
        }
        Update: {
          close_hour?: number
          created_at?: string
          day?: string
          id?: never
          open_hour?: number
          stable_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_days_stable_id_fkey"
            columns: ["stable_id"]
            isOneToOne: false
            referencedRelation: "stables"
            referencedColumns: ["id"]
          },
        ]
      }
      stables: {
        Row: {
          city: string
          created_at: string
          description: string | null
          id: number
          name: string
          owner_id: string
        }
        Insert: {
          city: string
          created_at?: string
          description?: string | null
          id?: never
          name: string
          owner_id: string
        }
        Update: {
          city?: string
          created_at?: string
          description?: string | null
          id?: never
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stables_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_taken_slots: {
        Args: { p_day: string; p_stable_id: number }
        Returns: {
          horse_id: number
          hour: number
        }[]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

