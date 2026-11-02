export const MINI_SHARE_TITLE = "KotoBud · 日语背词与复习";
export const MINI_SHARE_HOME = "/pages/index/index";
export const MINI_SHARE_IMAGE = "/static/covers/garden.png";

// Only public product information enters a share card. A local illustration
// also avoids WeChat's default screenshot of the sender's current page.
export function createFriendShare() {
  return { title: MINI_SHARE_TITLE, path: MINI_SHARE_HOME, imageUrl: MINI_SHARE_IMAGE };
}

export function createTimelineShare() {
  // Timeline sharing opens the current page; WeChat accepts query, not path.
  // Discard the sender's search, account and active lesson parameters.
  return { title: MINI_SHARE_TITLE, query: "", imageUrl: MINI_SHARE_IMAGE };
}
