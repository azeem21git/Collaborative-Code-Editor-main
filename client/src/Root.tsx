import { useCallback, useEffect, useState } from 'react';
import App from './App';
import LandingPage from './components/LandingPage';

type Session = {
  roomId: string;
  userName: string;
};

const SESSION_STORAGE_KEY = 'collabrix.session';

function readStoredSession(): Session | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!rawSession) {
      return null;
    }

    const parsedSession = JSON.parse(rawSession) as Partial<Session>;
    const roomId = parsedSession.roomId?.trim();
    const userName = parsedSession.userName?.trim();

    if (!roomId || !userName) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return { roomId, userName };
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function Root() {
  const [session, setSession] = useState<Session | null>(() => readStoredSession());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!session) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  const handleJoin = useCallback((roomId: string, userName: string) => {
    setSession({ roomId, userName });
  }, []);

  const handleSessionChange = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
  }, []);

  if (!session) {
    return <LandingPage onJoin={handleJoin} />;
  }

  return (
    <App
      initialRoomId={session.roomId}
      initialUserName={session.userName}
      onSessionChange={handleSessionChange}
    />
  );
}

export default Root;
