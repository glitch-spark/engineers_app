import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
import CardLink from '@/models/CardLink';
// import { notifyTransactionStatusChange } from '@/lib/slack';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await dbConnect();
  const cl = await CardLink.findById(params.id);
  if (!cl) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const isAdmin = (session.user as any).role === 'admin';
  const isOwner = cl.userId.toString() === (session.user as any).id;
  if (!isAdmin && !isOwner) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json();

  // Admin can change status to approved/rejected (no revert to pending)
//   if (isAdmin && body.status && ['approved', 'rejected'].includes(body.status)) {
//     if (cl.status !== body.status) {
//       cl.status = body.status;
//       cl.approvedBy = (session.user as any).id;
//       cl.approvedAt = new Date();
//       try {
//         await cl.populate('userId');
//         await notifyTransactionStatusChange({
//           clId: cl._id.toString(),
//           newStatus: body.status,
//           approverEmail: String(session.user?.email || ''),
//           ownerEmail: (cl.userId as any)?.email,
//           amount: cl.amount,
//           date: cl.date?.toISOString()?.slice(0,10),
//           notes: cl.notes,
//         });
//       } catch {}
//     }
//   }

  // Creator can edit while pending; admin can always edit
  if (cl.status !== 'cenceled' || isAdmin) {
    if (body.from) cl.from = new Date(body.from);
    if (body.to) cl.to = new Date(body.to);
    if (typeof body.amount === 'number') cl.amount = body.amount;
    if (typeof body.ownerEmail === 'string') cl.description = body.ownerEmail;
    if (typeof body.site === 'string') cl.site = body.site;
    if (typeof body.cardNumber === 'string') cl.cardNumber = body.cardNumber;
    if (typeof body.status === 'string') cl.status = body.status;
  }

  await cl.save();
  return NextResponse.json(cl);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await dbConnect();
  const cl = await CardLink.findById(params.id);
  if (!cl) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const isAdmin = (session.user as any).role === 'admin';
  const isOwner = cl.userId.toString() === (session.user as any).id;
  if (!isAdmin && !isOwner) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  await cl.deleteOne();
  return NextResponse.json({ ok: true });
}
