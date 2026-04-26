import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
import Transaction from '@/models/Transaction';
import { ObjectId } from 'mongodb';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await dbConnect();

  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  const yearStr = url.searchParams.get('year');
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

  const isAdmin = (session.user as any).role === 'admin';
  const match: any = {};

  if (isAdmin) {
    if (userId) match.userId = new ObjectId(userId);
  } else {
    match.userId = new ObjectId((session.user as any).id);
  }

  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  match.date = { $gte: start, $lte: end };

  // Get monthly totals
  const monthlyPipeline: any[] = [
    { $match: match },
    { $group: { _id: { $dateToString: { date: '$date', format: '%Y-%m' } }, total: { $sum: '$amount' } } },
    { $sort: { _id: 1 } },
  ];
  
  const monthlyRows = await Transaction.aggregate(monthlyPipeline);

  console.log("match : ", match);
  console.log("monthlyRows : ", monthlyRows);
  
  // Get overall statistics
  const statsPipeline: any[] = [
    { $match: match },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalCount: { $sum: 1 },
        avgAmount: { $avg: '$amount' },
        minAmount: { $min: '$amount' },
        maxAmount: { $max: '$amount' }
      }
    }
  ];

  const statsResult = await Transaction.aggregate(statsPipeline);
  const stats = statsResult[0] || { totalAmount: 0, totalCount: 0, avgAmount: 0, minAmount: 0, maxAmount: 0 };

  // Get status breakdown
  const statusPipeline: any[] = [
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } },
    { $sort: { _id: 1 } }
  ];

  const statusRows = await Transaction.aggregate(statusPipeline);
  const statusBreakdown = statusRows.reduce((acc: any, row: any) => {
    acc[row._id] = { count: row.count, total: row.total };
    return acc;
  }, {});

  return NextResponse.json({
    monthly: monthlyRows.map((r: any) => ({ period: r._id, total: r.total, year })),
    stats: {
      totalAmount: stats.totalAmount,
      totalCount: stats.totalCount,
      avgAmount: stats.avgAmount,
      minAmount: stats.minAmount,
      maxAmount: stats.maxAmount
    },
    statusBreakdown
  });
}
