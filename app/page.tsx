import KitchenDashboard from './aangan-dashboard';
import { getPanchangaSnapshot } from '@/lib/panchanga';

export default function Home() {
  const now = new Date();
  return (
    <KitchenDashboard
      initialNow={now.toISOString()}
      panchanga={getPanchangaSnapshot(now)}
    />
  );
}
