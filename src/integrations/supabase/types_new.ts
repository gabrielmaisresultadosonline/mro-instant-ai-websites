export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      site_pages: {
        Row: {
          background_type: "color" | "image" | "gradient" | null
          background_value: string | null
          created_at: string
          cta_link: string | null
          cta_text: string | null
          description: string | null
          fb_pixel_id: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          owner_id: string
          site_id: string
          slug: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          background_type?: "color" | "image" | "gradient" | null
          background_value?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          description?: string | null
          fb_pixel_id?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          owner_id: string
          site_id: string
          slug: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          background_type?: "color" | "image" | "gradient" | null
          background_value?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          description?: string | null
          fb_pixel_id?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          owner_id?: string
          site_id?: string
          slug?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
      }
      site_page_leads: {
        Row: {
          created_at: string
          event_name: string
          id: string
          metadata: Json | null
          page_id: string
          site_id: string
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json | null
          page_id: string
          site_id: string
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json | null
          page_id?: string
          site_id?: string
        }
      }
    }
  }
}
