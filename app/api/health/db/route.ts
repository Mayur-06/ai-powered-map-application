import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const configuredToken = process.env.HEALTH_TOKEN;
    const incomingToken = request.headers.get('x-health-token');

    if (!configuredToken || incomingToken !== configuredToken) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });

    if (error) {
      return NextResponse.json(
        { ok: false, error: 'Database health check failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    const safeError = message.includes('Missing Supabase server environment variables')
      ? 'Supabase server configuration is missing'
      : 'Database health check failed';

    return NextResponse.json(
      { ok: false, error: safeError },
      { status: 500 }
    );
  }
}

