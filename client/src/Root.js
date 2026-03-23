import { jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import App from './App';
import LandingPage from './components/LandingPage';
const SESSION_STORAGE_KEY = 'collabrix.session';
function readStoredSession() {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (!rawSession) {
            return null;
        }
        const parsedSession = JSON.parse(rawSession);
        const roomId = parsedSession.roomId?.trim();
        const userName = parsedSession.userName?.trim();
        if (!roomId || !userName) {
            window.localStorage.removeItem(SESSION_STORAGE_KEY);
            return null;
        }
        return { roomId, userName };
    }
    catch {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
    }
}
function Root() {
    const [session, setSession] = useState(() => readStoredSession());
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
    const handleJoin = useCallback((roomId, userName) => {
        setSession({ roomId, userName });
    }, []);
    const handleSessionChange = useCallback((nextSession) => {
        setSession(nextSession);
    }, []);
    if (!session) {
        return _jsx(LandingPage, { onJoin: handleJoin });
    }
    return (_jsx(App, { initialRoomId: session.roomId, initialUserName: session.userName, onSessionChange: handleSessionChange }));
}
export default Root;
