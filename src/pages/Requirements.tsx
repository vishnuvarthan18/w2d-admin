import { ListingsPage } from './Listings';

/** Requirements view — same moderation tools, locked to postType=requirement. */
export function RequirementsPage() {
  return (
    <ListingsPage
      forcedPostType="requirement"
      title="Requirements"
    />
  );
}
