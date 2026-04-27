import { getUserTestDrives } from "@/actions/test-drive";
import { ReservationsList } from "./_components/reservations-list";

export const metadata = {
  title: "My Reservations | Vehiql",
  description: "Manage your test drive reservations",
};

export default async function ReservationsPage() {
  // Fetch reservations on the server
  const reservationsResult = await getUserTestDrives();

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-6xl mb-6 gradient-title">Your Reservations</h1>
      <ReservationsList initialData={reservationsResult} />
    </div>
  );
}
