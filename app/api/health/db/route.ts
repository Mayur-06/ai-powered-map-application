import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });

    if (error) {
      console.error('[Health/DB Error]:', error.message);
      return NextResponse.json(
        { ok: false, error: 'Database health check failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[Health/DB Error]:', message);

    const safeError = message.includes('Missing Supabase server environment variables')
      ? 'Supabase server configuration is missing'
      : 'Database health check failed';

    return NextResponse.json(
      { ok: false, error: safeError },
      { status: 500 }
    );
  }
}

