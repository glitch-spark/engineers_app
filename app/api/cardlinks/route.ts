import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
// import Transaction from '@/models/CardLink';
// import { notifyNewTransaction } from '@/lib/slack';
import CardLink from '@/models/CardLink';

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
        query.from = {};
        if (from) query.from.$gte = new Date(from);
        if (to) query.from.$lte = new Date(to + 'T23:59:59.999Z');
    }
    
    // Add user filter (admin only)
    if (isAdmin && userId) {
    query.userId = userId;
  }

  // Add general search filter
  if (search) {
    query.$or = [
      { cardNumber: { $regex: search, $options: 'i' } },
      { site: { $regex: search, $options: 'i' } },
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
  const total = await CardLink.countDocuments(query);
  
  // Get paginated results
  const rows = await CardLink.find(query)
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
    cardlinks: withOwner,
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
  if (!body.email ||  !body.cardNumber || !body.from || !body.to) {
    return NextResponse.json({ error: 'Fill in all required fields' }, { status: 400 });
  }
  const t = await CardLink.create({ userId: (session.user as any).id, from: new Date(body.from), to: new Date(body.to), site: body.site,
    cardNumber: body.cardNumber, email: body.email, status: 'billing',
  });
  // Best-effort Slack notify
  try {
    // await notifyNewTransaction({
    //   creatorEmail: String(session.user?.email || ''),
    //   amount: Number(body.amount),
    //   date: new Date(body.date).toISOString().slice(0,10),
    //   description: body.description || '',
    // });
  } catch {}
  return NextResponse.json(t, { status: 201 });
}
