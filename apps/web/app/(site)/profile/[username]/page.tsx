import { normaliseUsername } from "@repo/shared/accounts";
import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-header";
import { ProfileView } from "@/components/profile/profile-view";

/** The username in the path as typed, lowercased; a malformed escape is kept as it is. */
function usernameFrom(raw: string): string {
  try {
    return normaliseUsername(decodeURIComponent(raw));
  } catch {
    return normaliseUsername(raw);
  }
}

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const username = usernameFrom((await params).username);
  return {
    title: username,
    description: `${username}'s solved problems, papers and activity.`,
    // Per-user pages are not indexed (docs/specs/08-web.md §9).
    robots: { index: false },
  };
}

/** The shell renders on the server; the profile loads in the browser (docs/specs/08-web.md §1). */
export default async function ProfilePage({ params }: ProfilePageProps) {
  const username = usernameFrom((await params).username);
  return (
    <PageContainer>
      <ProfileView username={username} />
    </PageContainer>
  );
}
