import { db } from "./prisma";

const DEMO_USER = {
  clerkUserId: "demo_clerk_user_id",
  email: "demo@example.com",
  name: "Demo User",
  imageUrl: "/logo.png",
};

export const checkUser = async () => {
  try {
    // Check if demo user exists
    let user = await db.user.findUnique({
      where: {
        clerkUserId: DEMO_USER.clerkUserId,
      },
    });

    if (user) {
      return user;
    }

    // Create demo user if it doesn't exist
    user = await db.user.create({
      data: {
        clerkUserId: DEMO_USER.clerkUserId,
        name: DEMO_USER.name,
        imageUrl: DEMO_USER.imageUrl,
        email: DEMO_USER.email,
        role: "ADMIN", // Demo user is admin so all features work
      },
    });

    return user;
  } catch (error) {
    console.log(error.message);
    return null;
  }
};
