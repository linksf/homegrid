import { useEffect, useState } from 'react';
import { useJobStore } from './store/job-store';
import { EditorScreen } from './screens/EditorScreen';
import { HomeScreen } from './screens/HomeScreen';

type AppScreen = 'home' | 'editor';

export default function App() {
  const loadLibrary = useJobStore((s) => s.loadLibrary);
  const [screen, setScreen] = useState<AppScreen>('home');

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  return (
    <main className={screen === 'editor' ? 'app app--editor' : 'app'}>
      {screen === 'home' ? (
        <HomeScreen onOpenEditor={() => setScreen('editor')} />
      ) : (
        <EditorScreen onBack={() => setScreen('home')} />
      )}
    </main>
  );
}
