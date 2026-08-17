import { sql } from 'drizzle-orm';

export function excluded(column: { name: string }) {
    return sql.raw(`excluded."${column.name}"`);
}
