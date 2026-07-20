import type { Pool } from "pg";
import type { TournamentDatabase } from "../../tournamentDatabase";

function parseTimestamptz(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function syncDealerStaffShadow(
  pool: Pool,
  db: TournamentDatabase,
): Promise<void> {
  const staff = db.dealerRotation?.staff ?? [];
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ids = staff.map(member => member.id);
    if (ids.length === 0) {
      await client.query("DELETE FROM dealer_staff");
    } else {
      await client.query("DELETE FROM dealer_staff WHERE NOT (id = ANY($1::text[]))", [ids]);
    }

    for (const member of staff) {
      await client.query(
        `
          INSERT INTO dealer_staff (
            id,
            payload,
            version,
            phone_session_token,
            phone_device_id,
            phone_last_seen_at,
            phone_grace_until,
            state_before_disconnect,
            zone_id,
            rotation_state,
            table_number
          )
          VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            payload = EXCLUDED.payload,
            version = dealer_staff.version + 1,
            phone_session_token = EXCLUDED.phone_session_token,
            phone_device_id = EXCLUDED.phone_device_id,
            phone_last_seen_at = EXCLUDED.phone_last_seen_at,
            phone_grace_until = EXCLUDED.phone_grace_until,
            state_before_disconnect = EXCLUDED.state_before_disconnect,
            zone_id = EXCLUDED.zone_id,
            rotation_state = EXCLUDED.rotation_state,
            table_number = EXCLUDED.table_number
        `,
        [
          member.id,
          JSON.stringify(member),
          Date.now(),
          member.phoneSessionToken,
          member.phoneDeviceId,
          parseTimestamptz(member.phoneLastSeenAt),
          parseTimestamptz(member.phoneGraceUntil),
          member.stateBeforeDisconnect,
          member.zoneId,
          member.state,
          member.tableNumber,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function countDealersInGraceFromShadow(pool: Pool, now = new Date()): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM dealer_staff
      WHERE phone_grace_until IS NOT NULL
        AND phone_grace_until > $1
    `,
    [now],
  );

  return Number(result.rows[0]?.count ?? 0);
}
