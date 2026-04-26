import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
import UserExtra from '@/models/UserExtra';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  
  try {
    await dbConnect();
    const body = await req.json();
    
    // Only allow updating certain fields
    const updateData = {
      name: body.name,
      role: body.role,
      phone: body.phone,
      birthday: body.birthday ? new Date(body.birthday) : undefined,
    };
    
    const updatedUser = await UserExtra.findByIdAndUpdate(
      params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await dbConnect();
  await UserExtra.findByIdAndDelete(params.id);
  return NextResponse.json({ ok: true });
}
