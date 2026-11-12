import { useEffect, useReducer, useState } from 'react';
import { getSavedDecks, type SavedDeck } from '../api';

const emptyDecks: SavedDeck[] = [];

export function useSavedDecks(playerName: string) {
  const [revision, reload] = useReducer((value: number) => value + 1, 0);
  const [snapshot, setSnapshot] = useState<{
    playerName: string;
    revision: number;
    decks: SavedDeck[];
    error?: string;
  }>();

  useEffect(() => {
    if (!playerName) return;
    const request = new AbortController();
    getSavedDecks(playerName, request.signal).then(
      decks => {
        if (!request.signal.aborted) setSnapshot({ playerName, revision, decks });
      },
      () => {
        if (!request.signal.aborted) {
          setSnapshot({
            playerName, revision, decks: emptyDecks, error: 'Не удалось загрузить сохранённые колоды',
          });
        }
      },
    );
    return () => request.abort();
  }, [playerName, revision]);

  const current = snapshot?.playerName === playerName && snapshot.revision === revision ? snapshot : undefined;
  return {
    decks: current?.decks ?? emptyDecks,
    error: current?.error,
    loading: Boolean(playerName && !current),
    reload,
  };
}
