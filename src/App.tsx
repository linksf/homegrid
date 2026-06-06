import { useEffect, useState } from 'react';
import { NewJobDialog, type NewJobChoice } from './components/NewJobDialog';
import { ElectricLoader } from './components/ElectricLoader';
import { getFloorPlan } from './persistence/floor-plan-db';
import { useFloorPlanStore } from './store/floor-plan-store';
import { useJobStore } from './store/job-store';
import { EditorScreen } from './screens/EditorScreen';
import { FloorPlanEditorScreen } from './screens/FloorPlanEditorScreen';
import { HomeScreen } from './screens/HomeScreen';

type AppScreen = 'home' | 'editor' | 'floorplan-editor';

export default function App() {
  const loadLibrary = useJobStore((s) => s.loadLibrary);
  const jobLoading = useJobStore((s) => s.jobLoading);
  const createJob = useJobStore((s) => s.createJob);
  const createFloorPlan = useFloorPlanStore((s) => s.createFloorPlan);
  const activeFloorPlan = useFloorPlanStore((s) => s.activeFloorPlan);
  const [screen, setScreen] = useState<AppScreen>('home');
  const [newJobOpen, setNewJobOpen] = useState(false);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  async function handleNewJobChoice(choice: NewJobChoice): Promise<void> {
    setNewJobOpen(false);
    if (choice.kind === 'sandbox') {
      await createJob({ mode: 'sandbox' });
      setScreen('editor');
      return;
    }
    if (choice.kind === 'create-floorplan') {
      await createFloorPlan();
      setScreen('floorplan-editor');
      return;
    }
    const floorPlan = await getFloorPlan(choice.floorPlanId);
    if (!floorPlan) return;
    await createJob({ mode: 'floorplan', floorPlan });
    setScreen('editor');
  }

  async function handleFloorPlanDone(): Promise<void> {
    if (!activeFloorPlan) return;
    await createJob({ mode: 'floorplan', floorPlan: activeFloorPlan });
    setScreen('editor');
  }

  return (
    <main className={screen === 'editor' ? 'app app--editor' : 'app'}>
      {screen === 'home' ? (
        <HomeScreen
          onOpenEditor={() => setScreen('editor')}
          onNewJob={() => setNewJobOpen(true)}
        />
      ) : screen === 'floorplan-editor' ? (
        <FloorPlanEditorScreen onBack={() => setScreen('home')} onDone={() => void handleFloorPlanDone()} />
      ) : (
        <EditorScreen onBack={() => setScreen('home')} />
      )}
      <NewJobDialog
        open={newJobOpen}
        onClose={() => setNewJobOpen(false)}
        onChoose={(choice) => void handleNewJobChoice(choice)}
      />
      {jobLoading ? <ElectricLoader variant="overlay" label="Powering up…" /> : null}
    </main>
  );
}
