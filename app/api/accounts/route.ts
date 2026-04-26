import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
import Account from '@/models/Account';
import UserExtra from '@/models/UserExtra';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const search = searchParams.get('search') || '';
  const userId = searchParams.get('userId') || '';
  const skip = (page - 1) * limit;
  
  await dbConnect();
  const isAdmin = (session.user as any).role === 'admin';
  const query: any = isAdmin ? (userId? {createdBy: userId }: {}) : { createdBy: (session.user as any).id };
  
  // Add search functionality
  if (search.trim()) {
    const searchRegex = new RegExp(search, 'i'); // Case-insensitive search
    query.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { address: searchRegex },
    ];
  }
  
  // Get total count for pagination
  const total = await Account.countDocuments(query);
  
  // Get paginated results
  const rows = await Account.find(query)
    .populate('createdBy')
    .skip(skip)
    .limit(limit)
    .lean();
    
  const withOwner = rows.map((r: any) => ({ 
    ...r, 
    ownerEmail: r.createdBy?.email || null, 
    ownerName: r.createdBy?.name || null 
  }));

  return NextResponse.json({
    accounts: withOwner,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  await dbConnect();
  const acc = await Account.create({ 
    name: body.name, email: body.email, phone: body.phone || '', address: body.address || '', 
    createdBy: (session.user as any).id 
  });
  return NextResponse.json(acc, { status: 201 });
}
