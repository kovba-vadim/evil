'use client'

import { SelectField, useFormFields } from '@payloadcms/ui'
import type { ComponentProps } from 'react'

export function ClothingCategoryField(props: ComponentProps<typeof SelectField>) {
  const equipmentSet = useFormFields(([fields]) => fields.equipmentSet?.value)
  const dispatch = useFormFields(([, dispatchFields]) => dispatchFields)

  return (
    <SelectField
      {...props}
      onChange={(category) => {
        // Payload submits the last value of the relationship even after hiding the field.
        if ((category === 'hazmat' || category === 'ring') && equipmentSet != null) {
          dispatch({ type: 'UPDATE', path: 'equipmentSet', value: null })
        }
      }}
    />
  )
}
