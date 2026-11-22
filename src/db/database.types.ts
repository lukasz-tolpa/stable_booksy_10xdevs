// GENEROWANY PLIK - nie edytowac recznie.
// Regeneracja po kazdej zmianie schematu: npm run db:types
// (wymaga uruchomionego lokalnego stacku: npx supabase start)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
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
      bookings: {
        Row: {
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          horse_id: number | null;
          hour: number;
          id: number;
          instructor_id: number;
          rider_id: string | null;
          schedule_day_id: number;
          status: string;
        };
        Insert: {
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          horse_id?: number | null;
          hour: number;
          id?: never;
          instructor_id: number;
          rider_id?: string | null;
          schedule_day_id: number;
          status?: string;
        };
        Update: {
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          horse_id?: number | null;
          hour?: number;
          id?: never;
          instructor_id?: number;
          rider_id?: string | null;
          schedule_day_id?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_assigned_horse_fkey";
            columns: ["schedule_day_id", "horse_id"];
            isOneToOne: false;
            referencedRelation: "schedule_day_horses";
            referencedColumns: ["schedule_day_id", "horse_id"];
          },
          {
            foreignKeyName: "bookings_instructor_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_rider_id_fkey";
            columns: ["rider_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_schedule_day_fkey";
            columns: ["schedule_day_id"];
            isOneToOne: false;
            referencedRelation: "schedule_days";
            referencedColumns: ["id"];
          },
        ];
      };
      extra_costs: {
        Row: {
          amount: number;
          created_at: string;
          id: number;
          month: string;
          name: string;
          rider_id: string;
          stable_id: number;
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: never;
          month: string;
          name: string;
          rider_id: string;
          stable_id: number;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: never;
          month?: string;
          name?: string;
          rider_id?: string;
          stable_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extra_costs_rider_id_fkey";
            columns: ["rider_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extra_costs_stable_id_fkey";
            columns: ["stable_id"];
            isOneToOne: false;
            referencedRelation: "stables";
            referencedColumns: ["id"];
          },
        ];
      };
      horses: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          name: string;
          notes: string | null;
          stable_id: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          name: string;
          notes?: string | null;
          stable_id: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          name?: string;
          notes?: string | null;
          stable_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "horses_stable_id_fkey";
            columns: ["stable_id"];
            isOneToOne: false;
            referencedRelation: "stables";
            referencedColumns: ["id"];
          },
        ];
      };
      instructor_invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: number;
          instructor_id: number;
          revoked_at: string | null;
          stable_id: number;
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: never;
          instructor_id: number;
          revoked_at?: string | null;
          stable_id: number;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: never;
          instructor_id?: number;
          revoked_at?: string | null;
          stable_id?: number;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "instructor_invitations_instructor_fkey";
            columns: ["instructor_id", "stable_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id", "stable_id"];
          },
          {
            foreignKeyName: "instructor_invitations_stable_id_fkey";
            columns: ["stable_id"];
            isOneToOne: false;
            referencedRelation: "stables";
            referencedColumns: ["id"];
          },
        ];
      };
      instructors: {
        Row: {
          account_id: string | null;
          active: boolean;
          arranges_schedule: boolean;
          created_at: string;
          id: number;
          name: string;
          stable_id: number;
        };
        Insert: {
          account_id?: string | null;
          active?: boolean;
          arranges_schedule?: boolean;
          created_at?: string;
          id?: never;
          name: string;
          stable_id: number;
        };
        Update: {
          account_id?: string | null;
          active?: boolean;
          arranges_schedule?: boolean;
          created_at?: string;
          id?: never;
          name?: string;
          stable_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "instructors_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instructors_stable_id_fkey";
            columns: ["stable_id"];
            isOneToOne: false;
            referencedRelation: "stables";
            referencedColumns: ["id"];
          },
        ];
      };
      places: {
        Row: {
          active: boolean;
          created_at: string;
          id: number;
          name: string;
          stable_id: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: never;
          name: string;
          stable_id: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: never;
          name?: string;
          stable_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "places_stable_id_fkey";
            columns: ["stable_id"];
            isOneToOne: false;
            referencedRelation: "stables";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string | null;
          id: string;
          role: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string | null;
          id: string;
          role: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          id?: string;
          role?: string;
        };
        Relationships: [];
      };
      rates: {
        Row: {
          amount: number | null;
          from_month: string;
          id: number;
          rider_id: string | null;
          stable_id: number;
        };
        Insert: {
          amount?: number | null;
          from_month: string;
          id?: never;
          rider_id?: string | null;
          stable_id: number;
        };
        Update: {
          amount?: number | null;
          from_month?: string;
          id?: never;
          rider_id?: string | null;
          stable_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rates_rider_id_fkey";
            columns: ["rider_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rates_stable_id_fkey";
            columns: ["stable_id"];
            isOneToOne: false;
            referencedRelation: "stables";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_day_horses: {
        Row: {
          created_at: string;
          horse_id: number;
          schedule_day_id: number;
          stable_id: number;
        };
        Insert: {
          created_at?: string;
          horse_id: number;
          schedule_day_id: number;
          stable_id: number;
        };
        Update: {
          created_at?: string;
          horse_id?: number;
          schedule_day_id?: number;
          stable_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_day_horses_day_fkey";
            columns: ["schedule_day_id", "stable_id"];
            isOneToOne: false;
            referencedRelation: "schedule_days";
            referencedColumns: ["id", "stable_id"];
          },
          {
            foreignKeyName: "schedule_day_horses_horse_fkey";
            columns: ["horse_id", "stable_id"];
            isOneToOne: false;
            referencedRelation: "horses";
            referencedColumns: ["id", "stable_id"];
          },
        ];
      };
      schedule_day_instructors: {
        Row: {
          created_at: string;
          instructor_id: number;
          schedule_day_id: number;
          stable_id: number;
        };
        Insert: {
          created_at?: string;
          instructor_id: number;
          schedule_day_id: number;
          stable_id: number;
        };
        Update: {
          created_at?: string;
          instructor_id?: number;
          schedule_day_id?: number;
          stable_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_day_instructors_day_fkey";
            columns: ["schedule_day_id", "stable_id"];
            isOneToOne: false;
            referencedRelation: "schedule_days";
            referencedColumns: ["id", "stable_id"];
          },
          {
            foreignKeyName: "schedule_day_instructors_instructor_fkey";
            columns: ["instructor_id", "stable_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id", "stable_id"];
          },
        ];
      };
      schedule_days: {
        Row: {
          close_hour: number;
          created_at: string;
          day: string;
          id: number;
          open_hour: number;
          stable_id: number;
          updated_at: string;
        };
        Insert: {
          close_hour: number;
          created_at?: string;
          day: string;
          id?: never;
          open_hour: number;
          stable_id: number;
          updated_at?: string;
        };
        Update: {
          close_hour?: number;
          created_at?: string;
          day?: string;
          id?: never;
          open_hour?: number;
          stable_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_days_stable_id_fkey";
            columns: ["stable_id"];
            isOneToOne: false;
            referencedRelation: "stables";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_slots: {
        Row: {
          hour: number;
          instructor_id: number;
          place_id: number;
          schedule_day_id: number;
          seats: number;
        };
        Insert: {
          hour: number;
          instructor_id: number;
          place_id: number;
          schedule_day_id: number;
          seats?: number;
        };
        Update: {
          hour?: number;
          instructor_id?: number;
          place_id?: number;
          schedule_day_id?: number;
          seats?: number;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_slots_day_instructor_fkey";
            columns: ["schedule_day_id", "instructor_id"];
            isOneToOne: false;
            referencedRelation: "schedule_day_instructors";
            referencedColumns: ["schedule_day_id", "instructor_id"];
          },
          {
            foreignKeyName: "schedule_slots_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
        ];
      };
      stables: {
        Row: {
          city: string;
          created_at: string;
          description: string | null;
          id: number;
          name: string;
          owner_id: string;
        };
        Insert: {
          city: string;
          created_at?: string;
          description?: string | null;
          id?: never;
          name: string;
          owner_id: string;
        };
        Update: {
          city?: string;
          created_at?: string;
          description?: string | null;
          id?: never;
          name?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stables_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assign_my_slot_horse: {
        Args: { p_booking_id: number; p_horse_id?: number };
        Returns: undefined;
      };
      create_stable: {
        Args: { p_city: string; p_instructor_name: string; p_name: string };
        Returns: number;
      };
      get_my_month_bookings: {
        Args: { p_from: string; p_to: string };
        Returns: {
          anonymised: boolean;
          day: string;
          horse_name: string;
          hour: number;
          rider_key: string;
          rider_name: string;
        }[];
      };
      get_my_slot_bookings: {
        Args: { p_from: string };
        Returns: {
          anonymised: boolean;
          booking_id: number;
          day: string;
          horse_id: number;
          horse_name: string;
          hour: number;
          rider_name: string;
        }[];
      };
      get_my_slot_horse_options: {
        Args: { p_from: string };
        Returns: {
          booking_id: number;
          horse_id: number;
          horse_name: string;
          taken: boolean;
        }[];
      };
      get_slot_occupancy: {
        Args: { p_day: string; p_stable_id: number };
        Returns: {
          hour: number;
          instructor_id: number;
          taken: number;
        }[];
      };
      invitation_by_token: {
        Args: { p_token: string };
        Returns: {
          email: string;
          stable_name: string;
          state: string;
        }[];
      };
      issue_instructor_invitation: {
        Args: { p_email: string; p_instructor_id: number };
        Returns: {
          expires_at: string;
          token: string;
        }[];
      };
      list_instructor_accounts: {
        Args: never;
        Returns: {
          arranges_schedule: boolean;
          instructor_id: number;
          owner: boolean;
        }[];
      };
      list_instructor_invitations: {
        Args: never;
        Returns: {
          email: string;
          expires_at: string;
          instructor_id: number;
        }[];
      };
      my_instructor: {
        Args: never;
        Returns: {
          active: boolean;
          arranges_schedule: boolean;
          id: number;
          name: string;
          stable_name: string;
          stable_owner_id: string;
        }[];
      };
      revoke_instructor_invitation: {
        Args: { p_instructor_id: number };
        Returns: boolean;
      };
      save_schedule_day: {
        Args: {
          p_close_hour: number;
          p_day: string;
          p_horse_ids: number[];
          p_instructor_ids: number[];
          p_open_hour: number;
          p_seats?: Json;
        };
        Returns: number;
      };
      schedule_stable_id: { Args: never; Returns: number };
      set_schedule_permission: {
        Args: { p_granted: boolean; p_instructor_id: number };
        Returns: undefined;
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
