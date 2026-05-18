import { useEffect } from 'react';
import './styles/app.css';
import { useJobStore } from './store/job-store';

export default function App() {
  const loadLibrary = useJobStore((s) => s.loadLibrary);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  return (
    <main className="app">
      <h1>Wirer</h1>
      <p>Electrical wiring mapper</p>
    </main>
  );
}
