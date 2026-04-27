// Mock auth function to replace Clerk's auth()
// Returns a demo user ID for all requests

const DEMO_USER_ID = "demo_clerk_user_id";

export async function auth() {
  return {
    userId: DEMO_USER_ID,
  };
}

export function getAuth() {
  return {
    userId: DEMO_USER_ID,
  };
}
