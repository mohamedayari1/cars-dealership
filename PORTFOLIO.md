# Vehiql - AI-Powered Car Marketplace

## Project Overview

Vehiql is a modern, full-stack car marketplace application that allows users to browse, save, and book test drives for vehicles. It features an admin dashboard for inventory management with AI-powered image processing capabilities.

**Live Demo:** [localhost:3000](http://localhost:3000)
**Tech Stack:** Next.js 15, React 19, PostgreSQL, Prisma, TailwindCSS

---

## Key Features

### For Users
| Feature | Description |
|---------|-------------|
| **Browse Cars** | Search and filter cars by make, model, body type, fuel type, price range |
| **Car Details** | View full specifications, image gallery, and EMI calculator |
| **Save Favorites** | Wishlist functionality to save cars for later |
| **Book Test Drives** | Schedule test drives with date/time picker and availability checking |
| **Responsive Design** | Fully responsive UI that works on mobile, tablet, and desktop |

### For Admins
| Feature | Description |
|---------|-------------|
| **Dashboard** | Overview of inventory stats, test drive bookings, and conversion rates |
| **Car Management** | Add, edit, delete cars with multi-image upload |
| **AI Background Removal** | One-click background removal for car images using Remove.bg API |
| **Test Drive Management** | View, confirm, and manage all test drive bookings |
| **Working Hours Config** | Set dealership working hours for test drive availability |
| **User Management** | View users and manage admin roles |

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  Next.js 15 (App Router) + React 19 + TailwindCSS           │
│  - Server Components for SEO & Performance                   │
│  - Client Components for Interactivity                       │
│  - Shadcn/ui Component Library                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Server Actions                           │
│  - Type-safe API layer (no REST endpoints needed)            │
│  - Direct database access with Prisma ORM                    │
│  - Image processing with Remove.bg API                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Database                               │
│  PostgreSQL (Neon) + Prisma ORM                              │
│  - Users, Cars, Test Drives, Wishlist                        │
│  - Dealership Info & Working Hours                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack Details

### Frontend
- **Next.js 15** - React framework with App Router, Server Components, and Turbopack
- **React 19** - Latest React with concurrent features
- **TailwindCSS** - Utility-first CSS framework
- **Shadcn/ui** - Accessible, customizable component library
- **React Hook Form + Zod** - Form handling with schema validation
- **Sonner** - Toast notifications

### Backend
- **Next.js Server Actions** - Type-safe server-side functions
- **Prisma ORM** - Type-safe database access
- **PostgreSQL (Neon)** - Serverless PostgreSQL database

### External APIs
- **Remove.bg API** - AI-powered background removal for car images

### Dev Tools
- **TypeScript-ready** - Full TypeScript support
- **ESLint** - Code linting
- **Bun** - Fast JavaScript runtime and package manager

---

## Database Schema

```prisma
model User {
  id visibleId        String   @id
  email        String   @unique
  name         String?
  role         UserRole @default(USER)  // USER or ADMIN
  savedCars    UserSavedCar[]
  testDrives   TestDriveBooking[]
}

model Car {
  id           String    @id
  make         String
  model        String
  year         Int
  price        Decimal
  mileage      Int
  color        String
  fuelType     String
  transmission String
  bodyType     String
  description  String
  status       CarStatus  // AVAILABLE, UNAVAILABLE, SOLD
  featured     Boolean
  images       String[]   // Array of image URLs
}

model TestDriveBooking {
  id          String        @id
  car         Car
  user        User
  bookingDate DateTime
  startTime   String
  endTime     String
  status      BookingStatus // PENDING, CONFIRMED, COMPLETED, CANCELLED
}
```

---

## Key Implementation Highlights

### 1. Server Actions for Data Fetching
No REST API needed - direct database access with type safety:

```javascript
// actions/car-listing.js
export async function getCars({ search, make, bodyType, ...filters }) {
  const cars = await db.car.findMany({
    where: { status: "AVAILABLE", ...buildFilters(filters) },
    orderBy: { createdAt: "desc" },
  });
  return { success: true, data: cars };
}
```

### 2. AI-Powered Image Processing
One-click background removal integration:

```javascript
// actions/image-processing.js
export async function removeImageBackground(imageBase64) {
  const response = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": process.env.REMOVEBG_API_KEY },
    body: JSON.stringify({ image_file_b64: imageBase64, bg_color: "FFFFFF" }),
  });
  return { success: true, data: processedImage };
}
```

### 3. Optimistic UI Updates
Using custom hooks for seamless user experience:

```javascript
// hooks/use-fetch.js
const { loading, fn: toggleSave, data } = useFetch(toggleSavedCar);

// Instant UI feedback while server processes
await toggleSave(carId);
```

### 4. Form Validation with Zod
Type-safe form handling:

```javascript
const carFormSchema = z.object({
  make: z.string().min(1, "Make is required"),
  price: z.string().min(1, "Price is required"),
  year: z.string().refine(val => {
    const year = parseInt(val);
    return year >= 1900 && year <= new Date().getFullYear() + 1;
  }, "Valid year required"),
});
```

---

## Project Structure

```
ai-car-marketplace/
├── app/
│   ├── (admin)/admin/       # Admin dashboard pages
│   │   ├── cars/            # Car management
│   │   ├── test-drives/     # Test drive management
│   │   └── settings/        # Dealership settings
│   ├── (main)/              # Public pages
│   │   ├── cars/            # Car listings & details
│   │   ├── saved-cars/      # User wishlist
│   │   └── reservations/    # User test drives
│   └── page.js              # Homepage
├── actions/                 # Server actions
│   ├── cars.js              # Car CRUD operations
│   ├── car-listing.js       # Public car queries
│   ├── test-drive.js        # Test drive booking
│   ├── admin.js             # Admin operations
│   └── image-processing.js  # AI image processing
├── components/              # Reusable UI components
├── lib/                     # Utilities & database client
└── prisma/schema.prisma     # Database schema
```

---

## Performance Optimizations

1. **Server Components** - Reduced client-side JavaScript bundle
2. **Image Optimization** - Next.js Image component with lazy loading
3. **Database Indexing** - Optimized queries with Prisma indexes
4. **Turbopack** - Fast development builds with Next.js 15

---

## Security Considerations

1. **Input Validation** - Zod schemas for all user inputs
2. **Server-Side Auth** - Protected routes and actions
3. **Environment Variables** - Sensitive keys stored securely
4. **SQL Injection Prevention** - Prisma ORM parameterized queries

---

## Future Enhancements

- [ ] Payment integration for car purchases
- [ ] Real-time chat with dealers
- [ ] Vehicle history reports
- [ ] Compare cars feature
- [ ] Email notifications for test drive confirmations

---

## Running Locally

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Add DATABASE_URL and REMOVEBG_API_KEY

# Push database schema
bunx prisma db push

# Start development server
bun run dev
```

---

## Contact

Built with Next.js 15, React 19, and PostgreSQL.

Ready to discuss the technical implementation in detail!
