import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
import Account from '@/models/Account';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await dbConnect();
  const acc = await Account.findById(params.id);
  if (!acc || acc.createdBy.toString() !== (session.user as any).id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = await req.json();
  acc.name = body.name ?? acc.name;
  acc.email = body.email ?? acc.email;
  acc.phone = body.phone ?? acc.phone;
  acc.address = body.address ?? acc.address;
  await acc.save();
  return NextResponse.json(acc);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await dbConnect();
  const acc = await Account.findById(params.id);
  if (!acc || acc.createdBy.toString() !== (session.user as any).id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await acc.deleteOne();
  return NextResponse.json({ ok: true });
}
