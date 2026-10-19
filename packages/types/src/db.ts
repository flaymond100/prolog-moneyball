export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          athlete_id: string
          average_heartrate: number | null
          decoupling: number | null
          elapsed_time: number | null
          feel: number | null
          icu_atl: number | null
          icu_average_watts: number | null
          icu_ctl: number | null
          icu_distance: number | null
          icu_efficiency_factor: number | null
          icu_ftp: number | null
          icu_intensity: number | null
          icu_joules: number | null
          icu_joules_above_ftp: number | null
          icu_rpe: number | null
          icu_training_load: number | null
          icu_variability_index: number | null
          icu_weight: number | null
          icu_weighted_avg_watts: number | null
          id: string
          max_heartrate: number | null
          moving_time: number | null
          paired_event_id: string | null
          race: boolean | null
          raw: NonNullable<Json>
          source: string | null
          start_date_local: string
          synced_at: string
          total_elevation_gain: number | null
          trainer: boolean | null
          trimp: number | null
          type: string | null
        }
        ComputedFields: never
        Insert: {
          athlete_id: string
          average_heartrate?: never
          decoupling?: never
          elapsed_time?: never
          feel?: never
          icu_atl?: never
          icu_average_watts?: never
          icu_ctl?: never
          icu_distance?: never
          icu_efficiency_factor?: never
          icu_ftp?: never
          icu_intensity?: never
          icu_joules?: never
          icu_joules_above_ftp?: never
          icu_rpe?: never
          icu_training_load?: never
          icu_variability_index?: never
          icu_weight?: never
          icu_weighted_avg_watts?: never
          id: string
          max_heartrate?: never
          moving_time?: never
          paired_event_id?: never
          race?: never
          raw: NonNullable<Json>
          source?: never
          start_date_local: string
          synced_at?: string
          total_elevation_gain?: never
          trainer?: never
          trimp?: never
          type?: never
        }
        Update: {
          athlete_id?: string
          average_heartrate?: never
          decoupling?: never
          elapsed_time?: never
          feel?: never
          icu_atl?: never
          icu_average_watts?: never
          icu_ctl?: never
          icu_distance?: never
          icu_efficiency_factor?: never
          icu_ftp?: never
          icu_intensity?: never
          icu_joules?: never
          icu_joules_above_ftp?: never
          icu_rpe?: never
          icu_training_load?: never
          icu_variability_index?: never
          icu_weight?: never
          icu_weighted_avg_watts?: never
          id?: string
          max_heartrate?: never
          moving_time?: never
          paired_event_id?: never
          race?: never
          raw?: NonNullable<Json>
          source?: never
          start_date_local?: string
          synced_at?: string
          total_elevation_gain?: never
          trainer?: never
          trimp?: never
          type?: never
        }
        Relationships: [
          {
            foreignKeyName: 'activities_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
        ]
      }
      activity_intervals: {
        Row: {
          activity_id: string
          average_cadence: number | null
          average_heartrate: number | null
          average_watts: number | null
          average_watts_kg: number | null
          decoupling: number | null
          group_id: string | null
          intensity: number | null
          interval_id: number
          label: string | null
          max_watts: number | null
          moving_time: number | null
          raw: NonNullable<Json>
          training_load: number | null
          type: string | null
          wbal_end: number | null
          wbal_start: number | null
          weighted_average_watts: number | null
          zone: number | null
        }
        ComputedFields: never
        Insert: {
          activity_id: string
          average_cadence?: never
          average_heartrate?: never
          average_watts?: never
          average_watts_kg?: never
          decoupling?: never
          group_id?: never
          intensity?: never
          interval_id: number
          label?: never
          max_watts?: never
          moving_time?: never
          raw: NonNullable<Json>
          training_load?: never
          type?: never
          wbal_end?: never
          wbal_start?: never
          weighted_average_watts?: never
          zone?: never
        }
        Update: {
          activity_id?: string
          average_cadence?: never
          average_heartrate?: never
          average_watts?: never
          average_watts_kg?: never
          decoupling?: never
          group_id?: never
          intensity?: never
          interval_id?: number
          label?: never
          max_watts?: never
          moving_time?: never
          raw?: NonNullable<Json>
          training_load?: never
          type?: never
          wbal_end?: never
          wbal_start?: never
          weighted_average_watts?: never
          zone?: never
        }
        Relationships: [
          {
            foreignKeyName: 'activity_intervals_activity_id_fkey'
            columns: ['activity_id']
            isOneToOne: false
            referencedRelation: 'activities'
            referencedColumns: ['id']
          },
        ]
      }
      athletes: {
        Row: {
          active: boolean
          id: string
          name: string
          raw: NonNullable<Json>
          synced_at: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          id: string
          name: string
          raw?: NonNullable<Json>
          synced_at?: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          raw?: NonNullable<Json>
          synced_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          display_name: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          display_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wellness: {
        Row: {
          athlete_id: string
          atl: number | null
          avg_sleeping_hr: number | null
          ctl: number | null
          date: string
          fatigue: number | null
          hrv: number | null
          hrv_sdnn: number | null
          injury: number | null
          mood: number | null
          motivation: number | null
          ramp_rate: number | null
          raw: NonNullable<Json>
          readiness: number | null
          resting_hr: number | null
          sleep_quality: number | null
          sleep_score: number | null
          sleep_secs: number | null
          soreness: number | null
          spo2: number | null
          stress: number | null
          synced_at: string
          vo2max: number | null
          weight: number | null
        }
        ComputedFields: never
        Insert: {
          athlete_id: string
          atl?: never
          avg_sleeping_hr?: never
          ctl?: never
          date: string
          fatigue?: never
          hrv?: never
          hrv_sdnn?: never
          injury?: never
          mood?: never
          motivation?: never
          ramp_rate?: never
          raw: NonNullable<Json>
          readiness?: never
          resting_hr?: never
          sleep_quality?: never
          sleep_score?: never
          sleep_secs?: never
          soreness?: never
          spo2?: never
          stress?: never
          synced_at?: string
          vo2max?: never
          weight?: never
        }
        Update: {
          athlete_id?: string
          atl?: never
          avg_sleeping_hr?: never
          ctl?: never
          date?: string
          fatigue?: never
          hrv?: never
          hrv_sdnn?: never
          injury?: never
          mood?: never
          motivation?: never
          ramp_rate?: never
          raw?: NonNullable<Json>
          readiness?: never
          resting_hr?: never
          sleep_quality?: never
          sleep_score?: never
          sleep_secs?: never
          soreness?: never
          spo2?: never
          stress?: never
          synced_at?: string
          vo2max?: never
          weight?: never
        }
        Relationships: [
          {
            foreignKeyName: 'wellness_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
