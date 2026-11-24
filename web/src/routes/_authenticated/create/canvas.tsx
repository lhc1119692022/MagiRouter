import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/create/canvas')({
  beforeLoad: () => {
    throw redirect({ to: '/create', replace: true })
  },
})
