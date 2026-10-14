import { permanentRedirect } from "next/navigation";

// The timeline is the home page now. This address stays so links to it keep working.
export default function TimelinePage(): never {
  return permanentRedirect("/");
}
