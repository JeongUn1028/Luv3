
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "comments": {
                  Row: {
                    "author_id": string,"content": string,"created_at": string,"date_id": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"content": string,"created_at"?: string,"date_id": string,"id"?: string
                  }
                  Update: {
                    "author_id"?: string,"content"?: string,"created_at"?: string,"date_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_date_id_fkey"
      columns: ["date_id"]
isOneToOne: false
      referencedRelation: "dates"
      referencedColumns: ["id"]
    }
                  ]
                },"couple_photo": {
                  Row: {
                    "id": boolean,"path": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"path"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "id"?: boolean,"path"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"dates": {
                  Row: {
                    "author_id": string,"cover_photo_id": string | null,"created_at": string,"date": string,"end_date": string | null,"event_date": string | null,"event_id": string | null,"id": string,"memo": string | null,"place": string | null,"place_lat": number | null,"place_lng": number | null,"revision": string,"tags": (string)[],"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"cover_photo_id"?: string | null,"created_at"?: string,"date": string,"end_date"?: string | null,"event_date"?: string | null,"event_id"?: string | null,"id"?: string,"memo"?: string | null,"place"?: string | null,"place_lat"?: number | null,"place_lng"?: number | null,"revision"?: string,"tags"?: (string)[],"title": string
                  }
                  Update: {
                    "author_id"?: string,"cover_photo_id"?: string | null,"created_at"?: string,"date"?: string,"end_date"?: string | null,"event_date"?: string | null,"event_id"?: string | null,"id"?: string,"memo"?: string | null,"place"?: string | null,"place_lat"?: number | null,"place_lng"?: number | null,"revision"?: string,"tags"?: (string)[],"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dates_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dates_cover_photo_id_fkey"
      columns: ["cover_photo_id"]
isOneToOne: false
      referencedRelation: "photos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dates_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_exceptions": {
                  Row: {
                    "date": string,"event_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "date": string,"event_id": string
                  }
                  Update: {
                    "date"?: string,"event_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_exceptions_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "author_id": string,"created_at": string,"date": string,"end_date": string | null,"id": string,"is_together": boolean,"memo": string | null,"place": string | null,"repeat_parent_id": string | null,"repeat_rule": string | null,"repeat_until": string | null,"start_time": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"created_at"?: string,"date": string,"end_date"?: string | null,"id"?: string,"is_together"?: boolean,"memo"?: string | null,"place"?: string | null,"repeat_parent_id"?: string | null,"repeat_rule"?: string | null,"repeat_until"?: string | null,"start_time"?: string | null,"title": string
                  }
                  Update: {
                    "author_id"?: string,"created_at"?: string,"date"?: string,"end_date"?: string | null,"id"?: string,"is_together"?: boolean,"memo"?: string | null,"place"?: string | null,"repeat_parent_id"?: string | null,"repeat_rule"?: string | null,"repeat_until"?: string | null,"start_time"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_repeat_parent_id_fkey"
      columns: ["repeat_parent_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "created_at": string,"email": string,"id": string,"nickname": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"id": string,"nickname": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: string,"nickname"?: string
                  }
                  Relationships: [
                    
                  ]
                },"photos": {
                  Row: {
                    "caption": string | null,"created_at": string,"date_id": string,"id": string,"path": string,"sort_order": number,"thumb_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string | null,"created_at"?: string,"date_id": string,"id"?: string,"path": string,"sort_order"?: number,"thumb_path": string
                  }
                  Update: {
                    "caption"?: string | null,"created_at"?: string,"date_id"?: string,"id"?: string,"path"?: string,"sort_order"?: number,"thumb_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "photos_date_id_fkey"
      columns: ["date_id"]
isOneToOne: false
      referencedRelation: "dates"
      referencedColumns: ["id"]
    }
                  ]
                },"todos": {
                  Row: {
                    "author_id": string,"completed_at": string | null,"content": string,"created_at": string,"id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"completed_at"?: string | null,"content": string,"created_at"?: string,"id"?: string,"sort_order"?: number
                  }
                  Update: {
                    "author_id"?: string,"completed_at"?: string | null,"content"?: string,"created_at"?: string,"id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "todos_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "are_valid_date_tags":
{ Args: { "p_tags": string }; Returns: boolean
                           },
"assert_date_record_fields":
{ Args: { "p_date": string,"p_end_date": string,"p_title": string }; Returns: undefined
                           },
"clear_couple_photo":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"create_date_record":
{ Args: { "p_cover_photo_id": string,"p_date": string,"p_end_date"?: string,"p_event_date"?: string,"p_event_id"?: string,"p_id": string,"p_memo": string,"p_photos": Json,"p_place": string,"p_place_location"?: Json,"p_tags"?: (string)[],"p_title": string }; Returns: string
                           },
"detach_event_occurrence":
{ Args: { "p_date": string,"p_event_id": string,"p_memo"?: string,"p_occurrence_date": string,"p_place"?: string,"p_start_time"?: string,"p_title": string }; Returns: string
                           },
"is_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"keepalive":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"link_date_record":
{ Args: { "p_date_id": string,"p_event_date": string,"p_event_id": string }; Returns: undefined
                           },
"move_todo":
{ Args: { "p_id": string,"p_offset": number }; Returns: undefined
                           },
"set_couple_photo":
{ Args: { "p_path": string }; Returns: string
                           },
"swap_couple_photo_path":
{ Args: { "p_path": string }; Returns: string
                           },
"unlink_date_record":
{ Args: { "p_date_id": string,"p_event_id": string }; Returns: undefined
                           },
"update_date_record":
{ Args: { "p_cover_photo_id": string,"p_date": string,"p_end_date"?: string,"p_expected_revisions"?: (string)[],"p_id": string,"p_memo": string,"p_new_revision"?: string,"p_photos": Json,"p_place": string,"p_place_location"?: Json,"p_tags"?: (string)[],"p_title": string }; Returns: (string)[]
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
