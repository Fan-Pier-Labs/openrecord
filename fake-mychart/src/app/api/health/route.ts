// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
