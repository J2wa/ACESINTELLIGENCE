import { drizzle } from 'drizzle-orm/libsql';
import { getClient } from '../lib/database';
import * as schema from './schema';
export const getDb = () => drizzle(getClient(), { schema });
