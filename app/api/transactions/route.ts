import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
import Transaction from '@/models/Transaction';
import { notifyNewTransaction } from '@/lib/slack';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const userId = searchParams.get('userId') || '';
  const search = searchParams.get('search') || '';
  const fromSearch = searchParams.get('fromSearch') || '';
  const toSearch = searchParams.get('toSearch') || '';
  const userSearch = searchParams.get('userSearch') || '';

  const skip = (page - 1) * limit;
  
  await dbConnect();
  const isAdmin = (session.user as any).role === 'admin';
  const query: any = isAdmin ? {} : { userId: (session.user as any).id };
  
  // Add date range filters
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = new Date(from);
    if (to) query.date.$lte = new Date(to + 'T23:59:59.999Z');
  }
  
  // Add user filter (admin only)
  if (isAdmin && userId) {
    query.userId = userId;
  }

  // Add general search filter
  if (search) {
    query.$or = [
      { description: { $regex: search, $options: 'i' } },
      { notes: { $regex: search, $options: 'i' } },
      { 'userId.name': { $regex: search, $options: 'i' } },
      { 'userId.email': { $regex: search, $options: 'i' } }
    ];
  }

  // Add specific search filters
  if (fromSearch || toSearch || userSearch) {
    const searchConditions: any[] = [];
    
    if (fromSearch) {
      searchConditions.push({
        $expr: {
          $regexMatch: {
            input: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            regex: fromSearch,
            options: "i"
          }
        }
      });
    }
    
    if (toSearch) {
      searchConditions.push({
        $expr: {
          $regexMatch: {
            input: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            regex: toSearch,
            options: "i"
          }
        }
      });
    }
    
    if (userSearch) {
      searchConditions.push({
        $or: [
          { 'userId.name': { $regex: userSearch, $options: 'i' } },
          { 'userId.email': { $regex: userSearch, $options: 'i' } }
        ]
      });
    }
    
    if (searchConditions.length > 0) {
      query.$and = searchConditions;
    }
  }
  
  // Get total count for pagination
  const total = await Transaction.countDocuments(query);
  
  // Get paginated results
  const rows = await Transaction.find(query)
    .populate('userId')
    .sort({ date: -1 }) // Sort by date descending (newest first)
    .skip(skip)
    .limit(limit)
    .lean();
    
  const withOwner = rows.map((r: any) => ({
    ...r,
    ownerEmail: r.userId?.email || null,
    ownerName: r.userId?.name || null,
  }));
  
  return NextResponse.json({
    transactions: withOwner,
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
  await dbConnect();
  const body = await req.json();
  if (!body.date || typeof body.amount !== 'number') {
    return NextResponse.json({ error: 'date and amount are required' }, { status: 400 });
  }
    const t = await Transaction.create({ userId: (session.user as any).id, date: new Date(body.date),
    amount: body.amount, description: body.description || '', notes: body.notes || '', status: 'pending',
  });
  // Best-effort Slack notify
  try {
    await notifyNewTransaction({
      creatorEmail: String(session.user?.email || ''),
      amount: Number(body.amount),
      date: new Date(body.date).toISOString().slice(0,10),
      description: body.description || '',
    });
  } catch {}
  return NextResponse.json(t, { status: 201 });
}
