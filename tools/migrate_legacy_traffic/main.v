// Migrate the most recent 30 calendar days of legacy vlang.io homepage events
// into the reusable traffic module's PostgreSQL table.
module main

import db.pg
import medvednikov.botdetect
import net.urllib
import os

const batch_size = 5_000
const site_id = 'vlang.io'

fn main() {
	conninfo := os.getenv('VLANG_DB_CONNINFO')
	if conninfo == '' {
		panic('VLANG_DB_CONNINFO must contain the PostgreSQL connection string')
	}
	mut db := pg.connect_with_conninfo(conninfo, pg.PoolConfig{}) or {
		panic('Could not connect to PostgreSQL: ${err}')
	}
	migrate(mut db) or {
		panic('Could not migrate legacy traffic: ${err}')
	}
}

fn migrate(mut db pg.DB) ! {
	mut tx := db.begin(pg.PQTransactionParam{})!
	mut committed := false
	defer {
		if !committed {
			tx.rollback() or {}
		}
	}

	tx.exec("CREATE TABLE IF NOT EXISTS visits (id BIGSERIAL PRIMARY KEY, site TEXT NOT NULL DEFAULT 'vinix', visited_at TIMESTAMPTZ NOT NULL, referral TEXT NOT NULL, referral_url TEXT NOT NULL DEFAULT '', user_agent TEXT NOT NULL DEFAULT '', country TEXT NOT NULL, is_bot BOOLEAN NOT NULL DEFAULT false)")!
	tx.exec("ALTER TABLE visits ADD COLUMN IF NOT EXISTS site TEXT NOT NULL DEFAULT 'vinix'")!
	tx.exec("ALTER TABLE visits ADD COLUMN IF NOT EXISTS referral_url TEXT NOT NULL DEFAULT ''")!
	tx.exec("ALTER TABLE visits ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT ''")!
	tx.exec('CREATE INDEX IF NOT EXISTS visits_site_visited_at_idx ON visits (site, visited_at)')!

	existing_count := tx.q_int("SELECT COUNT(*) FROM visits WHERE site = '${site_id}'")!
	if existing_count != 0 {
		return error("visits already contains ${existing_count} '${site_id}' rows; refusing to duplicate them")
	}

	cutoff := tx.q_string("SELECT to_char(CURRENT_DATE - 29, 'YYYY-MM-DD')")!
	source_count := tx.q_int('SELECT COUNT(*) FROM events WHERE event = 112 AND time >= CURRENT_DATE - 29')!
	tx.prepare('insert_legacy_visit', 'INSERT INTO visits (site, visited_at, referral, referral_url, user_agent, country, is_bot) VALUES (\$1, \$2::timestamptz, \$3, \$4, \$5, \$6, \$7::boolean)', 7)!

	mut last_id := 0
	mut imported_count := 0
	for {
		rows := tx.exec_param2("SELECT id::text, to_char(time, 'YYYY-MM-DD HH24:MI:SS.US') || ' UTC', COALESCE(arg, ''), COALESCE(arg2, '') FROM events WHERE event = 112 AND time >= CURRENT_DATE - 29 AND id > \$1::integer ORDER BY id LIMIT \$2::integer", last_id.str(), batch_size.str())!
		if rows.len == 0 {
			break
		}
		for row in rows {
			last_id = row.val(0).int()
			referral_url := row.val(2)
			user_agent := row.val(3)
			tx.exec_prepared('insert_legacy_visit', [
				site_id,
				row.val(1),
				referral_host(referral_url),
				referral_url,
				user_agent,
				'Unknown',
				botdetect.ua_is_bot(user_agent).str(),
			])!
			imported_count++
		}
		eprintln('Classified ${imported_count}/${source_count} legacy visits...')
		if rows.len < batch_size {
			break
		}
	}

	if imported_count != source_count {
		return error('source changed inside the migration snapshot: expected ${source_count}, imported ${imported_count}')
	}
	target_count := tx.q_int("SELECT COUNT(*) FROM visits WHERE site = '${site_id}'")!
	if target_count != source_count {
		return error('import verification failed: expected ${source_count}, got ${target_count}')
	}

	tx.commit()!
	committed = true
	println('Migrated ${target_count} vlang.io visits since ${cutoff}; the legacy events table was not changed.')
}

fn referral_host(referer string) string {
	if referer == '' {
		return 'Direct / unknown'
	}
	url := urllib.parse(referer) or { return 'Direct / unknown' }
	host := url.hostname().to_lower()
	return if host == '' { 'Direct / unknown' } else { host }
}
