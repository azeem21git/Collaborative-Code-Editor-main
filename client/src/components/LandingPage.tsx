import { useState, type KeyboardEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ArrowRight, Key, RefreshCw, User, Users } from 'lucide-react';
import '../landing.css';

interface LandingPageProps {
  onJoin: (roomId: string, userName: string) => void;
}

function LandingPage({ onJoin }: LandingPageProps) {
  const [roomId, setRoomId] = useState('');
  const [developerName, setDeveloperName] = useState('');
  const [nameError, setNameError] = useState('');

  const generateRoomId = () => {
    setRoomId(uuidv4());
  };

  const handleJoin = () => {
    const trimmedUserName = developerName.trim();

    if (!trimmedUserName) {
      setNameError('Please enter your developer name.');
      return;
    }

    setNameError('');
    const resolvedRoomId = roomId.trim() || uuidv4();

    if (!roomId.trim()) {
      setRoomId(resolvedRoomId);
    }

    onJoin(resolvedRoomId, trimmedUserName);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleJoin();
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0f0f0f] font-sans">
      <div className="landing-mesh" aria-hidden="true" />
      <div className="landing-glow landing-glow--top" aria-hidden="true" />
      <div className="landing-glow landing-glow--bottom" aria-hidden="true" />

      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <section className="w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/5">
              <Users className="h-7 w-7 text-violet-200" strokeWidth={1.8} />
            </div>
            <h1 className="bg-gradient-to-r from-sky-400 to-violet-500 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
              CollaBrix
            </h1>
            <p className="mt-2 text-sm font-medium text-white/70">Sync Minds, Code Smarter.</p>
          </div>

          <h2 className="mt-7 text-xl font-semibold tracking-tight text-white">Enter Your Session</h2>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="landing-room" className="text-sm font-medium text-white/80">
                Room ID
              </label>
              <div className="relative mt-2">
                <Key
                  size={16}
                  strokeWidth={2}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-violet-200/90"
                />
                <input
                  id="landing-room"
                  type="text"
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. 550e8400-e29b..."
                  className="h-12 w-full rounded-xl border border-white/20 bg-white/95 pl-11 pr-12 text-sm text-[#1f2937] outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/40"
                />
                <button
                  type="button"
                  onClick={generateRoomId}
                  title="Generate Room ID"
                  aria-label="Generate Room ID"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-violet-600 transition hover:bg-violet-100"
                >
                  <RefreshCw size={16} strokeWidth={2.1} />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="landing-name" className="text-sm font-medium text-white/80">
                Developer Name
              </label>
              <div className="relative mt-2">
                <User
                  size={16}
                  strokeWidth={2}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-violet-200/90"
                />
                <input
                  id="landing-name"
                  type="text"
                  value={developerName}
                  onChange={(event) => {
                    setDeveloperName(event.target.value);
                    if (nameError) {
                      setNameError('');
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Azeem"
                  className="h-12 w-full rounded-xl border border-white/20 bg-white/95 pl-11 pr-4 text-sm text-[#1f2937] outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/40"
                />
              </div>
              {nameError ? <p className="mt-2 text-sm text-red-400">{nameError}</p> : null}
            </div>
          </div>

          <button
            type="button"
            onClick={handleJoin}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8d6e53] text-sm font-semibold text-white transition duration-200 hover:scale-[1.02] hover:bg-[#9a7a5d] active:scale-[0.99]"
          >
            Join Room
            <ArrowRight size={16} strokeWidth={2.5} />
          </button>

          <button
            type="button"
            onClick={generateRoomId}
            className="mt-4 text-sm text-violet-200/80 transition hover:text-violet-100 hover:underline"
          >
            Generate a new Room ID
          </button>
        </section>
      </main>
    </div>
  );
}

export default LandingPage;
