import Sidebar from '@/components/Sidebar';
import DashboardAccessGuard from '@/components/DashboardAccessGuard';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardAccessGuard>
      <div className="dashboard-layout" style={{
        display: 'flex',
        flexWrap: 'wrap',
        minHeight: '100vh',
        background: '#f5efe6',
      }}>
        <Sidebar />
        <main className="dashboard-main" style={{
          flex: 1,
          marginLeft: '256px',
          padding: '32px',
        }}>
          {children}
        </main>
      </div>
    </DashboardAccessGuard>
  );
}