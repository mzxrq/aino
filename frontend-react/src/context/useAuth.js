import { useContext } from 'react';
import { AuthContext } from './contextBase';
export const useAuth = () => useContext(AuthContext);
