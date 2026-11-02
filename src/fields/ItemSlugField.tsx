'use client'

import { SlugField, useDocumentInfo, useField, useFormFields } from '@payloadcms/ui'
import type { SlugFieldClientProps } from 'payload'
import { useEffect, useRef } from 'react'
import { slugifyItemName } from './slugifyItemName'

/** Payload 3.92's native SlugField only generates on demand. Keep its lock/manual UI. */
export const ItemSlugField = (props: SlugFieldClientProps) => {
  const { id } = useDocumentInfo()
  const { value, setValue, formInitializing } = useField<string>({
    path: props.path || props.field.name,
  })
  const name = useFormFields(([fields]) => fields[props.useAsSlug || 'name']?.value)
  const automatic = useRef(!value)
  const lastGenerated = useRef('')
  const lastObserved = useRef(value || '')

  useEffect(() => {
    if (formInitializing || props.field.admin?.readOnly) return
    // A saved document or a value supplied manually must never follow name changes.
    const current = value || ''
    if (id != null || (current !== lastObserved.current && current !== lastGenerated.current)) {
      automatic.current = false
    }
    lastObserved.current = current
    if (!automatic.current) return
    const next = slugifyItemName(name)
    lastGenerated.current = next
    if ((value || '') !== next) setValue(next)
  }, [formInitializing, id, name, props.field.admin?.readOnly, setValue, value])

  return <SlugField {...props} />
}
