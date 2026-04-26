import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
import Transaction from '@/models/Transaction';
import { notifyTransactionStatusChange } from '@/lib/slack';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await dbConnect();
  const tx = await Transaction.findById(params.id);
  if (!tx) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const isAdmin = (session.user as any).role === 'admin';
  const isOwner = tx.userId.toString() === (session.user as any).id;
  if (!isAdmin && !isOwner) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json();

  // Admin can change status to approved/rejected (no revert to pending)
  if (isAdmin && body.status && ['approved', 'rejected'].includes(body.status)) {
    if (tx.status !== body.status) {
      tx.status = body.status;
      tx.approvedBy = (session.user as any).id;
      tx.approvedAt = new Date();
      try {
        await tx.populate('userId');
        await notifyTransactionStatusChange({
          txId: tx._id.toString(),
          newStatus: body.status,
          approverEmail: String(session.user?.email || ''),
          ownerEmail: (tx.userId as any)?.email,
          amount: tx.amount,
          date: tx.date?.toISOString()?.slice(0,10),
          notes: tx.notes,
        });
      } catch {}
    }
  }

  // Creator can edit while pending; admin can always edit
  if (tx.status === 'pending' || isAdmin) {
    if (body.date) tx.date = new Date(body.date);
    if (typeof body.amount === 'number') tx.amount = body.amount;
    if (typeof body.description === 'string') tx.description = body.description;
    if (typeof body.notes === 'string') tx.notes = body.notes;
  }

  await tx.save();
  return NextResponse.json(tx);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await dbConnect();
  const tx = await Transaction.findById(params.id);
  if (!tx) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const isAdmin = (session.user as any).role === 'admin';
  const isOwner = tx.userId.toString() === (session.user as any).id;
  if (!isAdmin && !isOwner) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  await tx.deleteOne();
  return NextResponse.json({ ok: true });
}
