import { NextResponse } from 'next/server';

export async function POST() {
  // BetterAuth handles session cleanup via its own signOut endpoint.
  // MyChart sessions in memory expire naturally.
  return NextResponse.json({ success: true });
}
