import { createContext, useContext } from 'react';
import type { Player } from '../api';

export const ActivePlayerContext = createContext<{ players: Player[]; activePlayer?: Player }>({ players: [] });
export const useActivePlayer = () => useContext(ActivePlayerContext);
