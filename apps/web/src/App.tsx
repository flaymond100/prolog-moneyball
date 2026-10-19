import { RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from '@/router.ts'

const router = createAppRouter()

export default function App() {
  return <RouterProvider router={router} />
}
