import { Settings as SettingsIcon } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { LoadingState } from './components/States';

// Each screen is loaded on demand. The dashboard is the landing page, so it
// is bundled eagerly; the rest are fetched when the user navigates to them.
import { Dashboard } from './pages/Dashboard';

const ActiveWorkout = lazy(() =>
  import('./pages/ActiveWorkout').then((module) => ({ default: module.ActiveWorkout })),
);
const DayWorkout = lazy(() =>
  import('./pages/DayWorkout').then((module) => ({ default: module.DayWorkout })),
);
const DayHistory = lazy(() =>
  import('./pages/DayHistory').then((module) => ({ default: module.DayHistory })),
);
const Exercises = lazy(() =>
  import('./pages/Exercises').then((module) => ({ default: module.Exercises })),
);
const History = lazy(() =>
  import('./pages/History').then((module) => ({ default: module.History })),
);
const Progress = lazy(() =>
  import('./pages/Progress').then((module) => ({ default: module.Progress })),
);
const Settings = lazy(() =>
  import('./pages/Settings').then((module) => ({ default: module.Settings })),
);

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-dvh flex-col">
        <header className="safe-top sticky top-0 z-30 border-b border-border-subtle bg-surface/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 md:px-6">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-slate-950">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z" />
                </svg>
              </span>
              <span className="text-lg font-bold tracking-tight text-ink">FitTrack</span>
            </div>
            <Link
              to="/settings"
              aria-label="Settings"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
            >
              <SettingsIcon className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 md:px-6 md:pb-10 md:pt-6">
          <Suspense fallback={<LoadingState label="Loading…" />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/workout" element={<ActiveWorkout />} />
              {/* The workout of one day of the week. */}
              <Route path="/workout/day/:day" element={<DayWorkout />} />
              {/* The saved sessions of one day of the week. */}
              <Route path="/history/day/:day" element={<DayHistory />} />
              <Route path="/exercises" element={<Exercises />} />
              <Route path="/history" element={<History />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </main>

        <Navbar />
      </div>
    </BrowserRouter>
  );
}
