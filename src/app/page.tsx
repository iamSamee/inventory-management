import { redirect } from "next/navigation";

// If this route is reached, middleware has already confirmed a valid
// session (unauthenticated requests are redirected to /login there).
export default function RootPage() {
  redirect("/overview");
}
