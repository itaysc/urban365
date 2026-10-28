import axios from 'axios';
import { config } from '@/config';

/** Single axios instance for the app; every service imports this one. */
export const api = axios.create({
  baseURL: `${config.apiUrl}/api/v1`,
  withCredentials: true,
});
