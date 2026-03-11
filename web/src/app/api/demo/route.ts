import { NextResponse } from 'next/server';
import { demoData } from '@/lib/demoData';

export async function POST() {
  return NextResponse.json(demoData);
}
