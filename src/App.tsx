import { useEffect, useState } from 'react';
import { NewJobDialog, type NewJobChoice } from './components/NewJobDialog';
import { FloorPlanManageDialog, type FloorPlanManageChoice } from './components/FloorPlanManageDialog';
import { ElectricLoader } from './components/ElectricLoader';
import { floorPlanFromJob } from './domain/floor-plan-defaults';
import { getFloorPlan, putFloorPlan } from './persistence/floor-plan-db';
import { useFloorPlanStore } from './store/floor-plan-store';
import { useJobStore } from './store/job-store';
import { EditorScreen } from './screens/EditorScreen';
import { FloorPlanEditorScreen } from './screens/FloorPlanEditorScreen';
import { HomeScreen } from './screens/HomeScreen';

type AppScreen = 'home' | 'editor' | 'floorplan-editor';

type FloorPlanEditorContext =
  | { mode: 'library'; returnScreen: 'home' }
  | { mode: 'new-job'; returnScreen: 'home' }
  | { mode: 'job'; returnScreen: 'editor' };

export default function App() {
  const loadLibrary = useJobStore((s) => s.loadLibrary);
  const loadFloorPlanLibrary = useFloorPlanStore((s) => s.loadLibrary);
  const openFloorPlan = useFloorPlanStore((s) => s.openFloorPlan);
  const setActiveFloorPlan = useFloorPlanStore((s) => s.setActiveFloorPlan);
  const jobLoading = useJobStore((s) => s.jobLoading);
  const activeJob = useJobStore((s) => s.activeJob);
  const createJob = useJobStore((s) => s.createJob);
  const applyFloorPlan = useJobStore((s) => s.applyFloorPlan);
  const createFloorPlan = useFloorPlanStore((s) => s.createFloorPlan);
  const activeFloorPlan = useFloorPlanStore((s) => s.activeFloorPlan);
  const [screen, setScreen] = useState<AppScreen>('home');
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [floorPlanManageOpen, setFloorPlanManageOpen] = useState(false);
  const [floorPlanEditorContext, setFloorPlanEditorContext] = useState<FloorPlanEditorContext>({
    mode: 'library',
    returnScreen: 'home',
  });

  useEffect(() => {
    void loadLibrary();
    void loadFloorPlanLibrary();
  }, [loadLibrary, loadFloorPlanLibrary]);

  async function resolveFloorPlanForJobEdit(): Promise<void> {
    if (!activeJob) return;
    let plan = activeJob.floorPlanId ? await getFloorPlan(activeJob.floorPlanId) : undefined;
    if (!plan) {
      plan = floorPlanFromJob(activeJob);
    }
    setActiveFloorPlan(plan);
  }

  async function persistAndApplyFloorPlan(): Promise<void> {
    if (!activeFloorPlan) return;
    await putFloorPlan(activeFloorPlan);
    await loadFloorPlanLibrary();
    if (floorPlanEditorContext.mode === 'job') {
      await applyFloorPlan(activeFloorPlan);
    }
  }

  async function handleNewJobChoice(choice: NewJobChoice): Promise<void> {
    setNewJobOpen(false);
    if (choice.kind === 'sandbox') {
      await createJob({ mode: 'sandbox' });
      setScreen('editor');
      return;
    }
    if (choice.kind === 'create-floorplan') {
      await createFloorPlan();
      setFloorPlanEditorContext({ mode: 'new-job', returnScreen: 'home' });
      setScreen('floorplan-editor');
      return;
    }
    const floorPlan = await getFloorPlan(choice.floorPlanId);
    if (!floorPlan) return;
    await createJob({ mode: 'floorplan', floorPlan });
    setScreen('editor');
  }

  async function handleFloorPlanEditorDone(): Promise<void> {
    if (!activeFloorPlan) return;
    if (floorPlanEditorContext.mode === 'new-job') {
      await putFloorPlan(activeFloorPlan);
      await createJob({ mode: 'floorplan', floorPlan: activeFloorPlan });
      setScreen('editor');
      return;
    }
    if (floorPlanEditorContext.mode === 'job') {
      await persistAndApplyFloorPlan();
      setScreen('editor');
      return;
    }
    await putFloorPlan(activeFloorPlan);
    await loadFloorPlanLibrary();
    setScreen('home');
  }

  function handleFloorPlanEditorBack(): void {
    setScreen(floorPlanEditorContext.returnScreen);
  }

  async function handleNewFloorPlan(): Promise<void> {
    await createFloorPlan();
    setFloorPlanEditorContext({ mode: 'library', returnScreen: 'home' });
    setScreen('floorplan-editor');
  }

  async function handleOpenFloorPlan(id: string): Promise<void> {
    const plan = await openFloorPlan(id);
    if (!plan) return;
    setFloorPlanEditorContext({ mode: 'library', returnScreen: 'home' });
    setScreen('floorplan-editor');
  }

  async function handleEditFloorPlanFromJob(): Promise<void> {
    setFloorPlanManageOpen(false);
    await resolveFloorPlanForJobEdit();
    setFloorPlanEditorContext({ mode: 'job', returnScreen: 'editor' });
    setScreen('floorplan-editor');
  }

  async function handleFloorPlanManageChoice(choice: FloorPlanManageChoice): Promise<void> {
    setFloorPlanManageOpen(false);
    if (choice.kind === 'create-new') {
      await createFloorPlan();
      setFloorPlanEditorContext({ mode: 'job', returnScreen: 'editor' });
      setScreen('floorplan-editor');
      return;
    }
    const floorPlan = await getFloorPlan(choice.floorPlanId);
    if (!floorPlan) return;
    await applyFloorPlan(floorPlan);
  }

  const floorPlanEditorDoneLabel =
    floorPlanEditorContext.mode === 'new-job'
      ? 'Start wiring job'
      : floorPlanEditorContext.mode === 'job'
        ? 'Apply to job'
        : 'Save';

  return (
    <main className={screen === 'editor' ? 'app app--editor' : 'app'}>
      {screen === 'home' ? (
        <HomeScreen
          onOpenEditor={() => setScreen('editor')}
          onNewJob={() => setNewJobOpen(true)}
          onNewFloorPlan={() => void handleNewFloorPlan()}
          onOpenFloorPlan={(id) => void handleOpenFloorPlan(id)}
        />
      ) : screen === 'floorplan-editor' ? (
        <FloorPlanEditorScreen
          onBack={handleFloorPlanEditorBack}
          onDone={() => void handleFloorPlanEditorDone()}
          doneLabel={floorPlanEditorDoneLabel}
        />
      ) : (
        <EditorScreen
          onBack={() => setScreen('home')}
          onManageFloorPlan={() => setFloorPlanManageOpen(true)}
        />
      )}
      <NewJobDialog
        open={newJobOpen}
        onClose={() => setNewJobOpen(false)}
        onChoose={(choice) => void handleNewJobChoice(choice)}
      />
      <FloorPlanManageDialog
        open={floorPlanManageOpen}
        showEditCurrent
        onClose={() => setFloorPlanManageOpen(false)}
        onEditCurrent={() => void handleEditFloorPlanFromJob()}
        onChoose={(choice) => void handleFloorPlanManageChoice(choice)}
      />
      {jobLoading ? <ElectricLoader variant="overlay" label="Powering up…" /> : null}
    </main>
  );
}
