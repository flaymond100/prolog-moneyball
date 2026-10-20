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
      anthropometrics: {
        Row: {
          athlete_id: string
          body_fat_pct: number | null
          created_at: string
          date: string
          entered_by: string | null
          height_cm: number | null
          notes: string | null
          updated_at: string
          weight_kg: number | null
        }
        ComputedFields: never
        Insert: {
          athlete_id: string
          body_fat_pct?: number | null
          created_at?: string
          date: string
          entered_by?: string | null
          height_cm?: number | null
          notes?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          athlete_id?: string
          body_fat_pct?: number | null
          created_at?: string
          date?: string
          entered_by?: string | null
          height_cm?: number | null
          notes?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'anthropometrics_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
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
      benchmark_points: {
        Row: {
          anchor_ratings: number[] | null
          anchor_values: number[] | null
          attribute: Database['public']['Enums']['rating_attribute']
          citation: string
          mean: number | null
          method: Database['public']['Enums']['benchmark_method']
          sd: number | null
          set_id: string
          status: Database['public']['Enums']['evidence_status']
          unit: string
        }
        ComputedFields: never
        Insert: {
          anchor_ratings?: number[] | null
          anchor_values?: number[] | null
          attribute: Database['public']['Enums']['rating_attribute']
          citation: string
          mean?: number | null
          method: Database['public']['Enums']['benchmark_method']
          sd?: number | null
          set_id: string
          status: Database['public']['Enums']['evidence_status']
          unit: string
        }
        Update: {
          anchor_ratings?: number[] | null
          anchor_values?: number[] | null
          attribute?: Database['public']['Enums']['rating_attribute']
          citation?: string
          mean?: number | null
          method?: Database['public']['Enums']['benchmark_method']
          sd?: number | null
          set_id?: string
          status?: Database['public']['Enums']['evidence_status']
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: 'benchmark_points_set_id_fkey'
            columns: ['set_id']
            isOneToOne: false
            referencedRelation: 'benchmark_sets'
            referencedColumns: ['id']
          },
        ]
      }
      benchmark_sets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          version: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          is_active?: boolean
          name: string
          version: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          version?: number
        }
        Relationships: []
      }
      ca_weights: {
        Row: {
          absolute_watts: boolean
          attribute: Database['public']['Enums']['rating_attribute']
          rider_type: Database['public']['Enums']['rider_type']
          updated_at: string
          weight: number
        }
        ComputedFields: never
        Insert: {
          absolute_watts?: boolean
          attribute: Database['public']['Enums']['rating_attribute']
          rider_type: Database['public']['Enums']['rider_type']
          updated_at?: string
          weight: number
        }
        Update: {
          absolute_watts?: boolean
          attribute?: Database['public']['Enums']['rating_attribute']
          rider_type?: Database['public']['Enums']['rider_type']
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      consents: {
        Row: {
          athlete_id: string
          created_at: string
          granted_at: string
          id: string
          notes: string | null
          policy_version: string
          recorded_by: string | null
          scope: Database['public']['Enums']['consent_scope']
          withdrawn_at: string | null
          withdrawn_by: string | null
        }
        ComputedFields: never
        Insert: {
          athlete_id: string
          created_at?: string
          granted_at?: string
          id?: string
          notes?: string | null
          policy_version: string
          recorded_by?: string | null
          scope: Database['public']['Enums']['consent_scope']
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          granted_at?: string
          id?: string
          notes?: string | null
          policy_version?: string
          recorded_by?: string | null
          scope?: Database['public']['Enums']['consent_scope']
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'consents_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
        ]
      }
      cycle_data: {
        Row: {
          athlete_id: string
          date: string
          phase: string | null
          phase_predicted: string | null
          raw: NonNullable<Json>
          synced_at: string
        }
        ComputedFields: never
        Insert: {
          athlete_id: string
          date: string
          phase?: never
          phase_predicted?: never
          raw: NonNullable<Json>
          synced_at?: string
        }
        Update: {
          athlete_id?: string
          date?: string
          phase?: never
          phase_predicted?: never
          raw?: NonNullable<Json>
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cycle_data_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
        ]
      }
      durability_efforts: {
        Row: {
          activity_id: string
          computed_at: string
          duration_s: number
          kj_kg_bucket: number
          watts: number
          wkg: number | null
        }
        ComputedFields: never
        Insert: {
          activity_id: string
          computed_at?: string
          duration_s: number
          kj_kg_bucket: number
          watts: number
          wkg?: number | null
        }
        Update: {
          activity_id?: string
          computed_at?: string
          duration_s?: number
          kj_kg_bucket?: number
          watts?: number
          wkg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'durability_efforts_activity_id_fkey'
            columns: ['activity_id']
            isOneToOne: false
            referencedRelation: 'activities'
            referencedColumns: ['id']
          },
        ]
      }
      edit_history: {
        Row: {
          athlete_id: string
          changed_at: string
          changed_by: string | null
          id: number
          new_row: Json | null
          old_row: Json | null
          operation: string
          table_name: string
        }
        ComputedFields: never
        Insert: {
          athlete_id: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          operation: string
          table_name: string
        }
        Update: {
          athlete_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          operation?: string
          table_name?: string
        }
        Relationships: []
      }
      forecasts: {
        Row: {
          athlete_id: string
          created_at: string
          horizon_date: string
          metric: string
          model: string
          p10: number | null
          p50: number
          p90: number | null
          plateau: boolean | null
          scenario: number
        }
        ComputedFields: never
        Insert: {
          athlete_id: string
          created_at?: string
          horizon_date: string
          metric: string
          model: string
          p10?: number | null
          p50: number
          p90?: number | null
          plateau?: boolean | null
          scenario?: number
        }
        Update: {
          athlete_id?: string
          created_at?: string
          horizon_date?: string
          metric?: string
          model?: string
          p10?: number | null
          p50?: number
          p90?: number | null
          plateau?: boolean | null
          scenario?: number
        }
        Relationships: [
          {
            foreignKeyName: 'forecasts_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
        ]
      }
      lab_tests: {
        Row: {
          at_w: number | null
          athlete_id: string
          body_fat_pct: number | null
          carbmax_g_h: number | null
          created_at: string
          entered_by: string | null
          fatmax_g_h: number | null
          fatmax_w: number | null
          height_cm: number | null
          id: string
          method: Database['public']['Enums']['lab_test_method']
          notes: string | null
          test_date: string
          tester: string | null
          updated_at: string
          vlamax_mmol_l_s: number | null
          vo2max_l_min: number | null
          vo2max_ml_kg_min: number | null
          weight_kg: number | null
        }
        ComputedFields: never
        Insert: {
          at_w?: number | null
          athlete_id: string
          body_fat_pct?: number | null
          carbmax_g_h?: number | null
          created_at?: string
          entered_by?: string | null
          fatmax_g_h?: number | null
          fatmax_w?: number | null
          height_cm?: number | null
          id?: string
          method: Database['public']['Enums']['lab_test_method']
          notes?: string | null
          test_date: string
          tester?: string | null
          updated_at?: string
          vlamax_mmol_l_s?: number | null
          vo2max_l_min?: number | null
          vo2max_ml_kg_min?: number | null
          weight_kg?: number | null
        }
        Update: {
          at_w?: number | null
          athlete_id?: string
          body_fat_pct?: number | null
          carbmax_g_h?: number | null
          created_at?: string
          entered_by?: string | null
          fatmax_g_h?: number | null
          fatmax_w?: number | null
          height_cm?: number | null
          id?: string
          method?: Database['public']['Enums']['lab_test_method']
          notes?: string | null
          test_date?: string
          tester?: string | null
          updated_at?: string
          vlamax_mmol_l_s?: number | null
          vo2max_l_min?: number | null
          vo2max_ml_kg_min?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'lab_tests_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
        ]
      }
      medical_markers: {
        Row: {
          athlete_id: string
          created_at: string
          entered_by: string | null
          id: string
          marker: string
          measured_on: string
          notes: string | null
          unit: string
          updated_at: string
          value: number
        }
        ComputedFields: never
        Insert: {
          athlete_id: string
          created_at?: string
          entered_by?: string | null
          id?: string
          marker: string
          measured_on: string
          notes?: string | null
          unit: string
          updated_at?: string
          value: number
        }
        Update: {
          athlete_id?: string
          created_at?: string
          entered_by?: string | null
          id?: string
          marker?: string
          measured_on?: string
          notes?: string | null
          unit?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: 'medical_markers_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
        ]
      }
      model_priors: {
        Row: {
          citation: string
          key: string
          label: string
          model: string
          note: string | null
          status: Database['public']['Enums']['evidence_status']
          unit: string
          updated_at: string
          updated_by: string | null
          value: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          citation: string
          key: string
          label: string
          model: string
          note?: string | null
          status: Database['public']['Enums']['evidence_status']
          unit?: string
          updated_at?: string
          updated_by?: string | null
          value: NonNullable<Json>
        }
        Update: {
          citation?: string
          key?: string
          label?: string
          model?: string
          note?: string | null
          status?: Database['public']['Enums']['evidence_status']
          unit?: string
          updated_at?: string
          updated_by?: string | null
          value?: NonNullable<Json>
        }
        Relationships: []
      }
      model_priors_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: number
          key: string
          new_row: Json | null
          old_row: Json | null
          operation: string
        }
        ComputedFields: never
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          key: string
          new_row?: Json | null
          old_row?: Json | null
          operation: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          key?: string
          new_row?: Json | null
          old_row?: Json | null
          operation?: string
        }
        Relationships: []
      }
      planned_events: {
        Row: {
          athlete_id: string
          category: string | null
          icu_training_load: number | null
          id: string
          moving_time: number | null
          name: string | null
          raw: NonNullable<Json>
          start_date_local: string
          synced_at: string
          type: string | null
        }
        ComputedFields: never
        Insert: {
          athlete_id: string
          category?: never
          icu_training_load?: never
          id: string
          moving_time?: never
          name?: never
          raw: NonNullable<Json>
          start_date_local: string
          synced_at?: string
          type?: never
        }
        Update: {
          athlete_id?: string
          category?: never
          icu_training_load?: never
          id?: string
          moving_time?: never
          name?: never
          raw?: NonNullable<Json>
          start_date_local?: string
          synced_at?: string
          type?: never
        }
        Relationships: [
          {
            foreignKeyName: 'planned_events_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
        ]
      }
      power_curves: {
        Row: {
          as_of: string
          athlete_id: string
          raw: NonNullable<Json>
          secs: number[]
          synced_at: string
          time_window: Database['public']['Enums']['power_curve_window']
          watts: number[]
          wkg: number[] | null
        }
        ComputedFields: never
        Insert: {
          as_of: string
          athlete_id: string
          raw?: NonNullable<Json>
          secs: number[]
          synced_at?: string
          time_window: Database['public']['Enums']['power_curve_window']
          watts: number[]
          wkg?: number[] | null
        }
        Update: {
          as_of?: string
          athlete_id?: string
          raw?: NonNullable<Json>
          secs?: number[]
          synced_at?: string
          time_window?: Database['public']['Enums']['power_curve_window']
          watts?: number[]
          wkg?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: 'power_curves_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
        ]
      }
      rider_ca_pa: {
        Row: {
          as_of: string
          athlete_id: string
          ca: number
          ca_12m_p50: number | null
          computed_at: string
          model_version: string
          pa_p10: number | null
          pa_p50: number | null
          pa_p90: number | null
          primary_type: Database['public']['Enums']['rider_type']
          seed: number | null
          set_id: string
          type_overridden: boolean
          type_probs: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          as_of: string
          athlete_id: string
          ca: number
          ca_12m_p50?: number | null
          computed_at?: string
          model_version: string
          pa_p10?: number | null
          pa_p50?: number | null
          pa_p90?: number | null
          primary_type: Database['public']['Enums']['rider_type']
          seed?: number | null
          set_id: string
          type_overridden?: boolean
          type_probs: NonNullable<Json>
        }
        Update: {
          as_of?: string
          athlete_id?: string
          ca?: number
          ca_12m_p50?: number | null
          computed_at?: string
          model_version?: string
          pa_p10?: number | null
          pa_p50?: number | null
          pa_p90?: number | null
          primary_type?: Database['public']['Enums']['rider_type']
          seed?: number | null
          set_id?: string
          type_overridden?: boolean
          type_probs?: NonNullable<Json>
        }
        Relationships: [
          {
            foreignKeyName: 'rider_ca_pa_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'rider_ca_pa_set_id_fkey'
            columns: ['set_id']
            isOneToOne: false
            referencedRelation: 'benchmark_sets'
            referencedColumns: ['id']
          },
        ]
      }
      rider_profiles: {
        Row: {
          athlete_id: string
          background: string | null
          cohort: Database['public']['Enums']['rider_cohort']
          contract_end: string | null
          created_at: string
          data_source: Database['public']['Enums']['rider_data_source']
          date_of_birth: string | null
          hrv_source: string | null
          primary_type_override: Database['public']['Enums']['rider_type'] | null
          training_age_entered_on: string | null
          training_age_years: number | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          athlete_id: string
          background?: string | null
          cohort?: Database['public']['Enums']['rider_cohort']
          contract_end?: string | null
          created_at?: string
          data_source?: Database['public']['Enums']['rider_data_source']
          date_of_birth?: string | null
          hrv_source?: string | null
          primary_type_override?: Database['public']['Enums']['rider_type'] | null
          training_age_entered_on?: string | null
          training_age_years?: number | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          background?: string | null
          cohort?: Database['public']['Enums']['rider_cohort']
          contract_end?: string | null
          created_at?: string
          data_source?: Database['public']['Enums']['rider_data_source']
          date_of_birth?: string | null
          hrv_source?: string | null
          primary_type_override?: Database['public']['Enums']['rider_type'] | null
          training_age_entered_on?: string | null
          training_age_years?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'rider_profiles_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: true
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
        ]
      }
      rider_ratings: {
        Row: {
          as_of: string
          athlete_id: string
          attribute: Database['public']['Enums']['rating_attribute']
          computed_at: string
          confidence: Database['public']['Enums']['rating_confidence']
          rating: number
          set_id: string
          squad_rating: number | null
          value: number
          watts: number | null
          watts_squad_rating: number | null
        }
        ComputedFields: never
        Insert: {
          as_of: string
          athlete_id: string
          attribute: Database['public']['Enums']['rating_attribute']
          computed_at?: string
          confidence: Database['public']['Enums']['rating_confidence']
          rating: number
          set_id: string
          squad_rating?: number | null
          value: number
          watts?: number | null
          watts_squad_rating?: number | null
        }
        Update: {
          as_of?: string
          athlete_id?: string
          attribute?: Database['public']['Enums']['rating_attribute']
          computed_at?: string
          confidence?: Database['public']['Enums']['rating_confidence']
          rating?: number
          set_id?: string
          squad_rating?: number | null
          value?: number
          watts?: number | null
          watts_squad_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'rider_ratings_athlete_id_fkey'
            columns: ['athlete_id']
            isOneToOne: false
            referencedRelation: 'athletes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'rider_ratings_set_id_fkey'
            columns: ['set_id']
            isOneToOne: false
            referencedRelation: 'benchmark_sets'
            referencedColumns: ['id']
          },
        ]
      }
      saved_filters: {
        Row: {
          conditions: NonNullable<Json>
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          conditions: NonNullable<Json>
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          conditions?: NonNullable<Json>
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_layouts: {
        Row: {
          created_at: string
          id: string
          layout: NonNullable<Json>
          name: string
          updated_at: string
          user_id: string
          view: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          layout: NonNullable<Json>
          name: string
          updated_at?: string
          user_id?: string
          view?: string
        }
        Update: {
          created_at?: string
          id?: string
          layout?: NonNullable<Json>
          name?: string
          updated_at?: string
          user_id?: string
          view?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          display_name: string | null
          role: Database['public']['Enums']['staff_role']
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          display_name?: string | null
          role?: Database['public']['Enums']['staff_role']
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          role?: Database['public']['Enums']['staff_role']
          user_id?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          api_calls: number | null
          athlete_ids: string[]
          counts: NonNullable<Json>
          error_count: number | null
          errors: NonNullable<Json>
          finished_at: string | null
          id: number
          job: string
          params: NonNullable<Json>
          rate_limit_remaining: number | null
          started_at: string
          status: string
        }
        ComputedFields: never
        Insert: {
          api_calls?: number | null
          athlete_ids?: string[]
          counts?: NonNullable<Json>
          error_count?: never
          errors?: NonNullable<Json>
          finished_at?: string | null
          id?: never
          job?: string
          params?: NonNullable<Json>
          rate_limit_remaining?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          api_calls?: number | null
          athlete_ids?: string[]
          counts?: NonNullable<Json>
          error_count?: never
          errors?: NonNullable<Json>
          finished_at?: string | null
          id?: never
          job?: string
          params?: NonNullable<Json>
          rate_limit_remaining?: number | null
          started_at?: string
          status?: string
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
      v_body_mass: {
        Row: {
          athlete_id: string | null
          body_fat_pct: number | null
          date: string | null
          source: string | null
          source_id: string | null
          weight_kg: number | null
        }
        ComputedFields: never
        Relationships: []
      }
    }
    Functions: {
      assert_in_range: {
        Args: { hi: number; label: string; lo: number; val: number }
        Returns: boolean
      }
      assert_not_future: { Args: { label: string; val: string }; Returns: boolean }
      has_active_consent: {
        Args: { p_athlete_id: string; p_scope: Database['public']['Enums']['consent_scope'] }
        Returns: boolean
      }
      has_role: { Args: { required_role: string }; Returns: boolean }
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_strictly_increasing: { Args: { vals: number[] }; Returns: boolean }
      seed_model_reference: { Args: Record<PropertyKey, never>; Returns: undefined }
    }
    Enums: {
      benchmark_method: 'z_score' | 'anchors'
      consent_scope: 'cycle_data' | 'medical_markers' | 'recruitment_assessment'
      evidence_status: 'source' | 'prior'
      lab_test_method: 'inscyd_lab' | 'inscyd_ppd_field'
      power_curve_window: '42d' | '84d' | 'season'
      rating_attribute: 'p5s' | 'p30s' | 'p1m' | 'p5m' | 'p20m' | 'p60m' | 'durability' | 'vo2max'
      rating_confidence: 'high' | 'low'
      rider_cohort: 'squad' | 'prospect' | 'alumni'
      rider_data_source: 'intervals' | 'manual_upload'
      rider_type: 'sprinter' | 'puncheur' | 'climber' | 'rouleur_tt' | 'all_rounder'
      staff_role: 'coach' | 'analyst' | 'medical' | 'viewer'
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
    Enums: {
      benchmark_method: ['z_score', 'anchors'],
      consent_scope: ['cycle_data', 'medical_markers', 'recruitment_assessment'],
      evidence_status: ['source', 'prior'],
      lab_test_method: ['inscyd_lab', 'inscyd_ppd_field'],
      power_curve_window: ['42d', '84d', 'season'],
      rating_attribute: ['p5s', 'p30s', 'p1m', 'p5m', 'p20m', 'p60m', 'durability', 'vo2max'],
      rating_confidence: ['high', 'low'],
      rider_cohort: ['squad', 'prospect', 'alumni'],
      rider_data_source: ['intervals', 'manual_upload'],
      rider_type: ['sprinter', 'puncheur', 'climber', 'rouleur_tt', 'all_rounder'],
      staff_role: ['coach', 'analyst', 'medical', 'viewer'],
    },
  },
} as const
