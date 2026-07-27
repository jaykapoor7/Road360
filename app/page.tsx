import { AppShell } from '@/components/layout/app-shell';
import { TabBar } from '@/components/layout/tab-bar';

export default function HomePage() {
  return (
    <>
      <AppShell>
        <h1 className="text-3xl font-bold">Road360</h1>
      </AppShell>
      <TabBar />
    </>
  );
}
