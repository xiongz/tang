import type { PartialSchema, Schema } from './base'

/** Appschema */
export interface PageSchema extends Schema {
  name?: string
  path?: string
}

export type PartialPageSchema = PartialSchema<PageSchema>
