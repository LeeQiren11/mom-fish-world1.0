/**
 * Supabase giả (in-memory) cho integration test của lib/werewolf.ts.
 *
 * Mô phỏng đúng phần PostgREST mà code dùng:
 *   from(t).select(cols, opts).eq/neq/in/gte/lte/order/limit/single/maybeSingle
 *   from(t).insert(rows).select(...).single()
 *   from(t).update(patch).eq(...).select(...)
 *   from(t).delete().neq(...)
 *   rpc('werewolf_take_seat', args)   -> bản TS của hàm SQL trong supabase.sql
 * Trả về { data, error, count } giống @supabase/supabase-js, gồm cả lỗi 23505
 * (unique violation) để test được luồng tranh ghế.
 */

export type Row = Record<string, any>;

interface Filter {
  op: 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'lt';
  col: string;
  val: any;
}

const UNIQUE_KEYS: Record<string, string[][]> = {
  werewolf_rooms: [['code']],
  werewolf_players: [
    ['room_id', 'zalo_id'],
    ['room_id', 'seat'],
  ],
};

let clock = Date.UTC(2026, 10, 21, 3, 0, 0); // 10:00 giờ VN
const nextTs = () => {
  clock += 1000;
  return new Date(clock).toISOString();
};

function defaults(table: string): Row {
  switch (table) {
    case 'werewolf_rooms':
      return {
        id: crypto.randomUUID(),
        status: 'waiting',
        current_round: 1,
        current_turn: 0,
        turn_interval_minutes: 15,
        turn_deadline: null,
        winner: null,
      };
    case 'werewolf_players':
      return {
        id: crypto.randomUUID(),
        role: null,
        is_alive: true,
        has_spoken: false,
        is_afk: false,
        seer_checked_round: 0,
      };
    case 'werewolf_messages':
      return { id: crypto.randomUUID(), vote_for: null };
    case 'werewolf_push_logs':
      return { id: crypto.randomUUID() };
    default:
      return { id: crypto.randomUUID() };
  }
}

const ok = (data: any, count: number | null = null) => ({ data, error: null, count });
const fail = (message: string, code = 'P0001') => ({ data: null, error: { message, code }, count: null });

class Query implements PromiseLike<any> {
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private lim: number | null = null;
  private singleMode: 'single' | 'maybeSingle' | null = null;
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private insertRows: Row[] = [];
  private patch: Row = {};
  private wantsReturn = false;
  private countMode: 'exact' | 'planned' | 'estimated' | null = null;
  private head = false;

  constructor(
    private db: FakeDB,
    private table: string,
  ) {}

  select(_cols = '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    if (this.mode === 'insert' || this.mode === 'update') this.wantsReturn = true;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.head = true;
    return this;
  }

  insert(rows: Row | Row[]) {
    this.mode = 'insert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch: Row) {
    this.mode = 'update';
    this.patch = patch;
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push({ op: 'eq', col, val });
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push({ op: 'neq', col, val });
    return this;
  }
  in(col: string, val: any[]) {
    this.filters.push({ op: 'in', col, val });
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push({ op: 'gte', col, val });
    return this;
  }
  lte(col: string, val: any) {
    this.filters.push({ op: 'lte', col, val });
    return this;
  }
  lt(col: string, val: any) {
    this.filters.push({ op: 'lt', col, val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  single() {
    this.singleMode = 'single';
    return this;
  }
  maybeSingle() {
    this.singleMode = 'maybeSingle';
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const v = row[f.col];
      switch (f.op) {
        case 'eq':
          return v === f.val;
        case 'neq':
          return v !== f.val;
        case 'in':
          return (f.val as any[]).includes(v);
        case 'gte':
          return v !== null && v !== undefined && v >= f.val;
        case 'lte':
          return v !== null && v !== undefined && v <= f.val;
        case 'lt':
          return v !== null && v !== undefined && v < f.val;
      }
    });
  }

  private run(): { data: any; error: any; count: number | null } {
    const rows = this.db.table(this.table);

    if (this.mode === 'insert') {
      const inserted: Row[] = [];
      for (const raw of this.insertRows) {
        const row: Row = { ...defaults(this.table), created_at: nextTs(), ...raw };
        for (const keys of UNIQUE_KEYS[this.table] ?? []) {
          const clash = rows.some((r) => keys.every((k) => r[k] === row[k]));
          if (clash) return fail(`duplicate key value violates unique constraint "${this.table}_${keys.join('_')}_key"`, '23505');
        }
        rows.push(row);
        inserted.push({ ...row });
      }
      const data = this.wantsReturn ? (this.singleMode ? inserted[0] ?? null : inserted) : null;
      return ok(data);
    }

    if (this.mode === 'update') {
      const updated: Row[] = [];
      for (const row of rows) {
        if (!this.matches(row)) continue;
        for (const [k, v] of Object.entries(this.patch)) if (v !== undefined) row[k] = v;
        updated.push({ ...row });
      }
      return ok(this.wantsReturn ? updated : null);
    }

    if (this.mode === 'delete') {
      const keep = rows.filter((r) => !this.matches(r));
      const removed = rows.length - keep.length;
      rows.length = 0;
      rows.push(...keep);
      return ok(null, removed);
    }

    // select
    let out = rows.filter((r) => this.matches(r)).map((r) => ({ ...r }));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
    }
    const total = out.length;
    if (this.head) return ok(null, total);
    if (this.lim !== null) out = out.slice(0, this.lim);

    if (this.singleMode === 'single') {
      if (out.length !== 1) return fail('JSON object requested, multiple (or no) rows returned', 'PGRST116');
      return ok(out[0], this.countMode ? total : null);
    }
    if (this.singleMode === 'maybeSingle') {
      if (out.length > 1) return fail('JSON object requested, multiple (or no) rows returned', 'PGRST116');
      return ok(out[0] ?? null, this.countMode ? total : null);
    }
    return ok(out, this.countMode ? total : null);
  }

  then<T1 = any, T2 = never>(
    onfulfilled?: ((value: any) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    const result = this.run();
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

export class FakeDB {
  private tables: Record<string, Row[]> = {
    werewolf_rooms: [],
    werewolf_players: [],
    werewolf_messages: [],
    werewolf_push_logs: [],
    user_coins: [],
    game_logs: [],
  };

  table(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  from(name: string) {
    return new Query(this, name);
  }

  /** Bản TS của các hàm Postgres trong supabase.sql. */
  async rpc(name: string, args: Record<string, any>): Promise<{ data: any; error: any }> {
    if (name === 'werewolf_find_or_create_room') {
      const pMax = args.p_max ?? 8;
      const rooms = this.table('werewolf_rooms');
      const open = rooms
        .filter((r) => r.status === 'waiting')
        .filter((r) => this.table('werewolf_players').filter((p) => p.room_id === r.id).length < pMax)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
      if (open) return { data: open.id, error: null };

      const code = Math.random().toString(36).slice(2, 7).toUpperCase();
      const row: Row = { ...defaults('werewolf_rooms'), code, created_at: nextTs() };
      rooms.push(row);
      return { data: row.id, error: null };
    }

    if (name !== 'werewolf_take_seat') return { data: null, error: { message: `unknown rpc ${name}` } };
    const { p_room_id, p_zalo_id, p_name, p_max = 8 } = args;

    const room = this.table('werewolf_rooms').find((r) => r.id === p_room_id);
    if (!room) return { data: null, error: { message: 'room_not_found', code: 'P0001' } };

    const existing = this.table('werewolf_players').find((p) => p.room_id === p_room_id && p.zalo_id === p_zalo_id);
    if (existing) return { data: { ...existing }, error: null };

    if (room.status !== 'waiting') return { data: null, error: { message: 'room_not_waiting', code: 'P0001' } };

    const seats = this.table('werewolf_players').filter((p) => p.room_id === p_room_id).map((p) => p.seat as number);
    const seat = seats.length ? Math.max(...seats) + 1 : 0;
    if (seat >= p_max) return { data: null, error: { message: 'room_full', code: 'P0001' } };

    const row: Row = {
      ...defaults('werewolf_players'),
      room_id: p_room_id,
      zalo_id: p_zalo_id,
      name: String(p_name).trim(),
      seat,
      created_at: nextTs(),
    };
    this.table('werewolf_players').push(row);
    return { data: { ...row }, error: null };
  }

  /** Dùng cho test: đọc thẳng bảng. */
  rows(name: string): Row[] {
    return this.table(name);
  }

  reset() {
    for (const k of Object.keys(this.tables)) this.tables[k].length = 0;
  }
}

export function newFake(): any {
  return new FakeDB();
}
