import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
import WeeklyPlan from '@/models/WeeklyPlan';
import UserExtra from '@/models/UserExtra';

// Helper function to get week number and dates
function getWeekInfo(date: Date) {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  
  // Get start and end of week (Monday to Sunday)
  const dayOfWeek = date.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startDate = new Date(date);
  startDate.setDate(date.getDate() + mondayOffset);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);
  
  return { weekNumber, year, startDate, endDate };
}

// GET /api/weekly-plans
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const year = searchParams.get('year');
    const weekNumber = searchParams.get('weekNumber');
    const userId = searchParams.get('userId');

    const role = (session.user as any)?.role;
    const isAdmin = role === 'admin';

    // Build query
    const query: any = {};
    
    // Non-admin users can only see their own plans
    if (!isAdmin) {
      query.userId = (session.user as any).id;
    } else if (userId) {
      query.userId = userId;
    }

    if (year) query.year = parseInt(year);
    if (weekNumber) query.weekNumber = parseInt(weekNumber);

    // Get total count
    const total = await WeeklyPlan.countDocuments(query);

    // Get plans with pagination
    const plans = await WeeklyPlan.find(query)
      .populate('userId', 'name email')
      .sort({ year: -1, weekNumber: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      plans,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching weekly plans:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/weekly-plans
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const { weekNumber, year, startDate, endDate, content, result } = body;

    if (!weekNumber || !year || !startDate || !endDate || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if plan already exists for this user and week
    const existingPlan = await WeeklyPlan.findOne({
      userId: (session.user as any).id,
      year,
      weekNumber,
    });

    if (existingPlan) {
      return NextResponse.json({ error: 'Weekly plan already exists for this week' }, { status: 400 });
    }

    const plan = new WeeklyPlan({
      userId: (session.user as any).id,
      weekNumber,
      year,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      content,
      result: result || '',
    });

    await plan.save();

    // Populate user data
    await plan.populate('userId', 'name email');

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    console.error('Error creating weekly plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
